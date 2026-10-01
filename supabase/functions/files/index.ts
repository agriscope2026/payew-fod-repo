// POST /functions/v1/files
//   { action: "upload", ...metadata }  → creates a pending attachment row, returns a presigned PUT URL
//   { action: "confirm", attachment_id } → verifies the object in R2, marks the row ready
//   { action: "cancel", attachment_id }  → removes an unfinished upload
//   { action: "download", attachment_id, disposition } → presigned GET URL (RLS decides visibility)
// Presigned URLs expire in ≤ 10 minutes. Authorization uses SQL helpers with the caller's JWT.
import { z } from 'npm:zod@4'
import { adminClient, getCaller, type Caller } from '../_shared/clients.ts'
import { corsHeaders, HttpError, json } from '../_shared/cors.ts'
import {
  buildObjectKey,
  clampTtl,
  contentDisposition,
  DEFAULT_UPLOAD_POLICY,
  HARD_MAX_BYTES,
  validateUpload,
  type UploadPolicy,
} from '../_shared/files-core.ts'
import { deleteObject, headObject, presign } from '../_shared/r2.ts'

const uuid = z.uuid()

const uploadSchema = z.object({
  action: z.literal('upload'),
  program_id: uuid.nullable(),
  fiscal_year_id: uuid.nullish(),
  entity_type: z
    .string()
    .regex(/^[a-z_]{2,40}$/)
    .default('repository'),
  entity_id: uuid.nullish(),
  document_type_id: uuid.nullish(),
  folder: z.string().trim().max(200).nullish(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).optional(),
  description: z.string().trim().max(2000).nullish(),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.string().max(200).default(''),
  size_bytes: z.number().int().positive(),
  /** Upload a new version of this attachment. */
  replaces_id: uuid.optional(),
})

const idSchema = z.object({
  action: z.enum(['confirm', 'cancel']),
  attachment_id: uuid,
})

const downloadSchema = z.object({
  action: z.literal('download'),
  attachment_id: uuid,
  disposition: z.enum(['inline', 'attachment']).default('attachment'),
})

const bodySchema = z.discriminatedUnion('action', [uploadSchema, idSchema, downloadSchema])

async function loadPolicy(): Promise<UploadPolicy> {
  const { data } = await adminClient
    .from('app_settings')
    .select('value')
    .eq('key', 'uploads')
    .maybeSingle()
  return { ...DEFAULT_UPLOAD_POLICY, ...((data?.value as Partial<UploadPolicy>) ?? {}) }
}

async function upload(caller: Caller, input: z.infer<typeof uploadSchema>) {
  const policy = await loadPolicy()
  const check = validateUpload(policy, {
    fileName: input.file_name,
    size: input.size_bytes,
    mimeType: input.mime_type,
  })
  if (!check.ok) throw new HttpError(422, check.error)

  let meta = {
    program_id: input.program_id,
    fiscal_year_id: input.fiscal_year_id ?? null,
    entity_type: input.entity_type,
    entity_id: input.entity_id ?? null,
    document_type_id: input.document_type_id ?? null,
    folder: input.folder || null,
    tags: [...new Set(input.tags ?? [])],
    description: input.description || null,
  }
  let versionGroupId: string | null = null
  let version = 1

  if (input.replaces_id) {
    // The caller must be able to see the original (RLS), and versions inherit its scope.
    const { data: original } = await caller.db
      .from('attachments')
      .select('*')
      .eq('id', input.replaces_id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!original) throw new HttpError(404, 'Original file not found')
    meta = {
      program_id: original.program_id,
      fiscal_year_id: original.fiscal_year_id,
      entity_type: original.entity_type,
      entity_id: original.entity_id,
      document_type_id: input.document_type_id ?? original.document_type_id,
      folder: input.folder ?? original.folder,
      tags: input.tags ? meta.tags : original.tags,
      description: input.description ?? original.description,
    }
    versionGroupId = original.version_group_id
    const { data: latest } = await adminClient
      .from('attachments')
      .select('version')
      .eq('version_group_id', versionGroupId)
      .order('version', { ascending: false })
      .limit(1)
      .single()
    version = (latest?.version ?? 0) + 1
  }

  const { data: allowed, error: authError } = await caller.db.rpc('can_upload_attachment', {
    p_program_id: meta.program_id,
    p_entity_type: meta.entity_type,
    p_entity_id: meta.entity_id,
  })
  if (authError) throw new HttpError(500, authError.message)
  if (!allowed) throw new HttpError(403, 'You are not allowed to upload files here')

  let programCode: string | null = null
  if (meta.program_id) {
    const { data: program } = await adminClient
      .from('programs')
      .select('code, archived_at')
      .eq('id', meta.program_id)
      .single()
    if (!program) throw new HttpError(404, 'Program not found')
    if (program.archived_at) throw new HttpError(409, 'This program is archived')
    programCode = program.code
  }
  if (meta.fiscal_year_id) {
    const { data: fy } = await adminClient
      .from('fiscal_years')
      .select('status')
      .eq('id', meta.fiscal_year_id)
      .single()
    if (fy?.status === 'locked') throw new HttpError(409, 'This fiscal year is locked')
  }

  const id = crypto.randomUUID()
  const r2Key = buildObjectKey({
    programCode,
    year: new Date().getFullYear(),
    attachmentId: id,
    fileName: input.file_name,
  })

  const { error: insertError } = await adminClient.from('attachments').insert({
    id,
    ...meta,
    file_name: input.file_name.split(/[\\/]/).pop(),
    r2_key: r2Key,
    mime_type: check.mimeType,
    size_bytes: input.size_bytes,
    status: 'pending',
    version_group_id: versionGroupId ?? id,
    version,
    is_latest: false,
    uploaded_by: caller.id,
  })
  if (insertError) throw new HttpError(500, insertError.message)

  const ttl = clampTtl(policy.presign_ttl_seconds)
  const uploadUrl = await presign('PUT', r2Key, ttl)
  return {
    attachment_id: id,
    upload_url: uploadUrl,
    method: 'PUT',
    headers: { 'Content-Type': check.mimeType },
    expires_in: ttl,
  }
}

async function getOwnPending(caller: Caller, attachmentId: string) {
  const { data: row } = await adminClient
    .from('attachments')
    .select('id, r2_key, size_bytes, status, uploaded_by')
    .eq('id', attachmentId)
    .maybeSingle()
  if (!row || row.uploaded_by !== caller.id) throw new HttpError(404, 'Upload not found')
  if (row.status !== 'pending') throw new HttpError(409, 'Upload already finalized')
  return row
}

async function confirm(caller: Caller, attachmentId: string) {
  const row = await getOwnPending(caller, attachmentId)
  const head = await headObject(row.r2_key)
  if (!head) throw new HttpError(409, 'The file did not reach storage. Please upload it again.')

  const policy = await loadPolicy()
  const maxBytes = Math.min(policy.max_mb * 1024 * 1024, HARD_MAX_BYTES)
  if (head.size <= 0 || head.size > maxBytes) {
    await deleteObject(row.r2_key)
    await adminClient.from('attachments').delete().eq('id', row.id)
    throw new HttpError(413, 'The uploaded file exceeds the size limit')
  }

  const { data, error } = await adminClient.rpc('mark_attachment_ready', {
    p_attachment_id: row.id,
    p_size_bytes: head.size,
  })
  if (error) throw new HttpError(500, error.message)
  return data
}

async function cancel(caller: Caller, attachmentId: string) {
  const row = await getOwnPending(caller, attachmentId)
  await deleteObject(row.r2_key)
  await adminClient.from('attachments').delete().eq('id', row.id)
  return { cancelled: true }
}

async function download(caller: Caller, input: z.infer<typeof downloadSchema>) {
  // Read through the caller's client: RLS decides whether they may see this file.
  const { data: row } = await caller.db
    .from('attachments')
    .select('r2_key, file_name, mime_type, status')
    .eq('id', input.attachment_id)
    .maybeSingle()
  if (!row || row.status !== 'ready') throw new HttpError(404, 'File not found')

  const ttl = clampTtl((await loadPolicy()).presign_ttl_seconds)
  const url = await presign('GET', row.r2_key, ttl, {
    'response-content-disposition': contentDisposition(input.disposition, row.file_name),
    'response-content-type': row.mime_type,
  })
  return { url, expires_in: ttl }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  try {
    const caller = await getCaller(req)
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return json(req, { error: 'Invalid request', issues: parsed.error.issues }, 422)
    }
    const input = parsed.data
    switch (input.action) {
      case 'upload':
        return json(req, await upload(caller, input))
      case 'confirm':
        return json(req, await confirm(caller, input.attachment_id))
      case 'cancel':
        return json(req, await cancel(caller, input.attachment_id))
      case 'download':
        return json(req, await download(caller, input))
    }
  } catch (err) {
    if (err instanceof HttpError) return json(req, { error: err.message }, err.status)
    console.error(err)
    return json(req, { error: 'Unexpected server error' }, 500)
  }
})
