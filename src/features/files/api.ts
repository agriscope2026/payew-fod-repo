import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DEFAULT_UPLOAD_POLICY, validateUpload, type UploadPolicy } from '@shared/files-core'
import { invokeFunction, supabase } from '@/lib/supabase'
import type { AttachmentRow } from '@/types/database'

export const attachmentsKey = ['attachments'] as const

// ---------------------------------------------------------------------------
// Upload policy (Settings → System → File uploads)
// ---------------------------------------------------------------------------
export function useUploadPolicy() {
  return useQuery({
    queryKey: ['app_settings', 'uploads'],
    queryFn: async (): Promise<UploadPolicy> => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'uploads')
        .maybeSingle()
      return { ...DEFAULT_UPLOAD_POLICY, ...((data?.value as Partial<UploadPolicy> | null) ?? {}) }
    },
    staleTime: 10 * 60_000,
  })
}

export function checkFile(policy: UploadPolicy, file: File) {
  return validateUpload(policy, { fileName: file.name, size: file.size, mimeType: file.type })
}

// ---------------------------------------------------------------------------
// Upload: Edge Function → presigned PUT straight to R2 → confirm
// ---------------------------------------------------------------------------
export interface UploadMeta {
  program_id: string | null
  fiscal_year_id?: string | null
  entity_type?: string
  entity_id?: string | null
  document_type_id?: string | null
  folder?: string | null
  tags?: string[]
  description?: string | null
  replaces_id?: string
}

interface UploadTicket {
  attachment_id: string
  upload_url: string
  headers: Record<string, string>
}

function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the upload (HTTP ${xhr.status})`))
    xhr.onerror = () =>
      reject(new Error('Network error while uploading. Check the bucket CORS policy.'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(file)
  })
}

export async function uploadFile(
  file: File,
  meta: UploadMeta,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
) {
  const ticket = await invokeFunction<UploadTicket>('files', {
    action: 'upload',
    ...meta,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
  })
  try {
    await putWithProgress(ticket.upload_url, file, ticket.headers, opts.onProgress, opts.signal)
    return await invokeFunction<AttachmentRow>('files', {
      action: 'confirm',
      attachment_id: ticket.attachment_id,
    })
  } catch (err) {
    // Best effort: remove the pending row and any partial object.
    void invokeFunction('files', { action: 'cancel', attachment_id: ticket.attachment_id }).catch(
      () => {},
    )
    throw err
  }
}

/** Short-lived (≤ 10 min) signed URL. Fetch it right before use; don't store it. */
export async function getFileUrl(attachmentId: string, disposition: 'inline' | 'attachment') {
  const { url } = await invokeFunction<{ url: string }>('files', {
    action: 'download',
    attachment_id: attachmentId,
    disposition,
  })
  return url
}

export async function downloadAttachment(attachmentId: string) {
  const url = await getFileUrl(attachmentId, 'attachment')
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Files attached to one record (latest versions only). */
export function useEntityAttachments(entityType: string, entityId: string | null | undefined) {
  return useQuery({
    queryKey: [...attachmentsKey, 'entity', entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .eq('status', 'ready')
        .eq('is_latest', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export interface RepositoryFilters {
  programIds: string[]
  includeShared: boolean
  fiscalYearId: string | null // null = all years
  documentTypeId?: string
  folder?: string
  tag?: string
  search?: string
  source: 'all' | 'repository' | 'attached'
  trash: boolean
  page: number
  pageSize: number
}

/** PostgREST `or` filters treat , ( ) as syntax; drop them from free text. */
const cleanSearch = (s: string) => s.replace(/[,()%*\\]/g, ' ').trim()

export function useRepositoryFiles(f: RepositoryFilters) {
  return useQuery({
    queryKey: [...attachmentsKey, 'repository', f],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase
        .from('attachments')
        .select('*', { count: 'exact' })
        .eq('status', 'ready')
        .eq('is_latest', true)

      q = f.trash ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null)

      const scope = [
        f.programIds.length ? `program_id.in.(${f.programIds.join(',')})` : null,
        f.includeShared ? 'program_id.is.null' : null,
      ].filter(Boolean)
      if (scope.length === 0) return { rows: [] as AttachmentRow[], count: 0 }
      q = q.or(scope.join(','))

      if (f.fiscalYearId) q = q.eq('fiscal_year_id', f.fiscalYearId)
      if (f.documentTypeId) q = q.eq('document_type_id', f.documentTypeId)
      if (f.folder) q = q.eq('folder', f.folder)
      if (f.tag) q = q.contains('tags', [f.tag.toLowerCase()])
      if (f.source === 'repository') q = q.eq('entity_type', 'repository')
      if (f.source === 'attached') q = q.neq('entity_type', 'repository')
      const term = f.search ? cleanSearch(f.search) : ''
      if (term) q = q.or(`file_name.ilike.%${term}%,description.ilike.%${term}%`)

      const from = f.page * f.pageSize
      const { data, error, count } = await q
        .order(f.trash ? 'deleted_at' : 'created_at', { ascending: false })
        .range(from, from + f.pageSize - 1)
      if (error) throw error
      return { rows: data, count: count ?? 0 }
    },
  })
}

/** Distinct folder names in the visible scope (for filters and autocomplete). */
export function useFolders(programIds: string[]) {
  return useQuery({
    queryKey: [...attachmentsKey, 'folders', programIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('folder')
        .not('folder', 'is', null)
        .is('deleted_at', null)
        .limit(2000)
      if (error) throw error
      return [...new Set(data.map((r) => r.folder as string))].sort((a, b) => a.localeCompare(b))
    },
    staleTime: 5 * 60_000,
  })
}

export function useVersions(versionGroupId: string | null) {
  return useQuery({
    queryKey: [...attachmentsKey, 'versions', versionGroupId],
    enabled: !!versionGroupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('version_group_id', versionGroupId!)
        .eq('status', 'ready')
        .order('version', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export function useInvalidateAttachments() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: attachmentsKey })
}

export type AttachmentEdit = Partial<
  Pick<AttachmentRow, 'file_name' | 'description' | 'document_type_id' | 'folder' | 'tags'>
>

export function useUpdateAttachment() {
  const invalidate = useInvalidateAttachments()
  return useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: AttachmentEdit }) => {
      const { data, error } = await supabase
        .from('attachments')
        .update(changes)
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data.length) throw new Error('You do not have permission to edit this file.')
    },
    onSuccess: invalidate,
  })
}

/** Moves every version of a file to Trash (or restores them). */
export function useTrashAttachment() {
  const invalidate = useInvalidateAttachments()
  return useMutation({
    mutationFn: async ({
      versionGroupId,
      restore,
    }: {
      versionGroupId: string
      restore?: boolean
    }) => {
      const { data, error } = await supabase
        .from('attachments')
        .update({ deleted_at: restore ? null : new Date().toISOString() })
        .eq('version_group_id', versionGroupId)
        .select('id')
      if (error) throw error
      if (!data.length) throw new Error('You do not have permission to change this file.')
    },
    onSuccess: invalidate,
  })
}
