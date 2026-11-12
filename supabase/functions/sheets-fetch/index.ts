// POST /functions/v1/sheets-fetch   { url: "https://docs.google.com/spreadsheets/d/..." }
// Reads a Google Sheet shared as "Anyone with the link" and returns it as a base64 .xlsx.
// It exists because Google does not allow browsers to read these exports directly.
// Only Google Sheets links are accepted, and only Google hosts are followed on redirect.
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { getCaller } from '../_shared/clients.ts'
import { corsHeaders, HttpError, json } from '../_shared/cors.ts'
import {
  isAllowedSheetHost,
  MAX_SHEET_BYTES,
  parseSheetId,
  sheetExportUrl,
} from '../_shared/sheets-core.ts'

const NOT_SHARED =
  'PAYEW could not open this sheet. In Google Sheets, click Share and set General access to "Anyone with the link" (Viewer), then try again.'

async function download(id: string) {
  let target = sheetExportUrl(id)
  for (let hops = 0; hops < 6; hops++) {
    const res = await fetch(target, { redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel()
      const next = new URL(res.headers.get('Location') ?? '', target)
      if (next.protocol !== 'https:' || !isAllowedSheetHost(next.hostname)) {
        throw new HttpError(403, NOT_SHARED)
      }
      target = next.toString()
      continue
    }
    if (res.status === 401 || res.status === 403) throw new HttpError(403, NOT_SHARED)
    if (res.status === 404) throw new HttpError(404, 'That Google Sheet was not found.')
    if (!res.ok) throw new HttpError(502, `Google returned an error (${res.status}).`)
    if (!(res.headers.get('Content-Type') ?? '').includes('spreadsheetml')) {
      await res.body?.cancel()
      throw new HttpError(403, NOT_SHARED)
    }
    return await readLimited(res)
  }
  throw new HttpError(502, 'Google redirected too many times.')
}

async function readLimited(res: Response) {
  const reader = res.body!.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_SHEET_BYTES) {
      await reader.cancel()
      throw new HttpError(413, 'This spreadsheet is larger than the 15 MB limit.')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) })
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
    await getCaller(req)
    const body = (await req.json().catch(() => null)) as { url?: unknown } | null
    const id = typeof body?.url === 'string' ? parseSheetId(body.url) : null
    if (!id)
      throw new HttpError(422, 'Paste a Google Sheets link (docs.google.com/spreadsheets/…).')
    return json(req, { data: encodeBase64(await download(id)) })
  } catch (err) {
    if (err instanceof HttpError) return json(req, { error: err.message }, err.status)
    console.error(err)
    return json(req, { error: 'Could not read the sheet. Please try again.' }, 500)
  }
})
