// Pure helpers shared by the `files` Edge Function (Deno) and the web app (Vite).
// No runtime-specific imports here, so both can import it and Vitest can test it.

/** Absolute cap regardless of settings (matches the attachments.size_bytes check). */
export const HARD_MAX_BYTES = 25 * 1024 * 1024
export const MAX_TTL_SECONDS = 600

export interface UploadPolicy {
  max_mb: number
  allowed_extensions: string[]
  presign_ttl_seconds: number
}

export const DEFAULT_UPLOAD_POLICY: UploadPolicy = {
  max_mb: 25,
  allowed_extensions: ['xlsx', 'xls', 'csv', 'pdf', 'docx', 'jpg', 'jpeg', 'png'],
  presign_ttl_seconds: 600,
}

/** Accepted MIME types per extension (browsers vary, especially for CSV). */
export const MIME_BY_EXTENSION: Record<string, string[]> = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/csv'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  txt: ['text/plain'],
}

/** Drops any client-supplied directory part ("C:\x\a.pdf", "../a.pdf" → "a.pdf"). */
export function baseName(fileName: string) {
  return fileName.split(/[\\/]/).pop() ?? ''
}

export function extensionOf(fileName: string) {
  const name = baseName(fileName)
  const i = name.lastIndexOf('.')
  const ext = i > 0 ? name.slice(i + 1).toLowerCase() : ''
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : ''
}

/** Safe, readable object-key segment: ASCII letters, digits, dot, dash, underscore. */
export function sanitizeFileName(fileName: string) {
  fileName = baseName(fileName)
  const ext = extensionOf(fileName)
  const base = ext ? fileName.slice(0, -(ext.length + 1)) : fileName
  const clean = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '') // strip accents (ñ → n)
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
  const safeBase = clean(base).slice(0, 100) || 'file'
  return ext ? `${safeBase}.${clean(ext)}` : safeBase
}

/** {PROGRAM|shared}/{year}/{attachmentId}/{safe-name}. The id makes keys unique and unguessable. */
export function buildObjectKey(opts: {
  programCode: string | null
  year: number
  attachmentId: string
  fileName: string
}) {
  return [
    opts.programCode ?? 'shared',
    String(opts.year),
    opts.attachmentId,
    sanitizeFileName(opts.fileName),
  ].join('/')
}

export type UploadCheck =
  { ok: true; mimeType: string; extension: string } | { ok: false; error: string }

export function validateUpload(
  policy: UploadPolicy,
  file: { fileName: string; size: number; mimeType: string },
): UploadCheck {
  const extension = extensionOf(file.fileName)
  const allowed = policy.allowed_extensions.map((e) => e.toLowerCase())
  if (!extension || !allowed.includes(extension)) {
    return { ok: false, error: `File type not allowed. Allowed: ${allowed.join(', ')}` }
  }
  const maxBytes = Math.min(policy.max_mb * 1024 * 1024, HARD_MAX_BYTES)
  if (!(file.size > 0)) return { ok: false, error: 'The file is empty' }
  if (file.size > maxBytes) {
    return { ok: false, error: `File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB` }
  }

  const known = MIME_BY_EXTENSION[extension]
  const mime = file.mimeType.trim().toLowerCase()
  if (!known) {
    // Extension allowed by settings but not in our table: accept the browser's type.
    return { ok: true, extension, mimeType: mime || 'application/octet-stream' }
  }
  if (!mime || mime === 'application/octet-stream') {
    return { ok: true, extension, mimeType: known[0] }
  }
  if (!known.includes(mime)) {
    return { ok: false, error: `The file content type (${mime}) does not match .${extension}` }
  }
  return { ok: true, extension, mimeType: mime }
}

export function clampTtl(seconds: number | undefined) {
  return Math.min(Math.max(Math.round(seconds ?? MAX_TTL_SECONDS), 60), MAX_TTL_SECONDS)
}

/** RFC 6266 Content-Disposition with an ASCII fallback and a UTF-8 filename*. */
export function contentDisposition(type: 'inline' | 'attachment', fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
