// Pure helpers shared by the `sheets-fetch` Edge Function (Deno) and the web app (Vite).
// No runtime-specific imports here, so both can import it and Vitest can test it.

export const MAX_SHEET_BYTES = 15 * 1024 * 1024

/** Pulls the spreadsheet id out of a Google Sheets link, or returns null if it isn't one. */
export function parseSheetId(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') return null
  const match = url.pathname.match(
    /^\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,100})(?:\/|$)/,
  )
  return match?.[1] ?? null
}

export function sheetExportUrl(id: string) {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`
}

/** Hosts a sheet export may legitimately redirect through. */
export function isAllowedSheetHost(hostname: string) {
  return hostname === 'docs.google.com' || hostname.endsWith('.googleusercontent.com')
}
