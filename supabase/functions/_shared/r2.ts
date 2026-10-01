// Cloudflare R2 (S3-compatible) access for Edge Functions.
// Secrets come from Edge Function env vars; they never reach the browser.
import { AwsClient } from 'npm:aws4fetch@1'
import { HttpError } from './cors.ts'

const accountId = Deno.env.get('R2_ACCOUNT_ID')
const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
const bucket = Deno.env.get('R2_BUCKET')

let client: AwsClient | null = null

function r2() {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new HttpError(503, 'File storage is not configured (R2 secrets missing)')
  }
  client ??= new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
  return client
}

/** Path-style URL: https://<account>.r2.cloudflarestorage.com/<bucket>/<key> */
function objectUrl(key: string) {
  const path = key.split('/').map(encodeURIComponent).join('/')
  return new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${path}`)
}

/** Presigned URL for a direct browser PUT or GET. */
export async function presign(
  method: 'GET' | 'PUT',
  key: string,
  ttlSeconds: number,
  query: Record<string, string> = {},
) {
  const c = r2()
  const url = objectUrl(key)
  url.searchParams.set('X-Amz-Expires', String(ttlSeconds))
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  const signed = await c.sign(new Request(url, { method }), { aws: { signQuery: true } })
  return signed.url
}

export async function headObject(key: string) {
  const res = await r2().fetch(objectUrl(key), { method: 'HEAD' })
  if (res.status === 404) return null
  if (!res.ok) throw new HttpError(502, `Storage error (${res.status})`)
  return {
    size: Number(res.headers.get('content-length') ?? 0),
    contentType: res.headers.get('content-type'),
  }
}

export async function deleteObject(key: string) {
  const res = await r2().fetch(objectUrl(key), { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new HttpError(502, `Storage error (${res.status})`)
}
