/**
 * Location import (Settings → Master Lists → Locations).
 *
 * Two spreadsheet layouts are understood:
 *  A. Simple: one row per place with "Province", "Municipality/City" and
 *     "Barangay" columns (PSGC code columns optional).
 *  B. The PSA PSGC publication: "10-digit PSGC" (or "PSGC"/"Code"), "Name" and
 *     "Geographic Level" (Reg, Prov, City, Mun, SubMun, Bgy). Parents come from
 *     the code: RR PPP MM BBB (10 digits) or RR PP MM BBB (9 digits).
 *     Highly urbanized cities (e.g. Baguio) have no province above them; they
 *     are listed at province level and as their own municipality, as in PAYEW.
 *
 * The result is a list of rows in parent-first order for import_locations().
 */

export interface LocationRow {
  province: string
  province_psgc?: string | null
  province_is_city?: boolean
  municipality?: string | null
  municipality_psgc?: string | null
  municipality_is_city?: boolean
  barangay?: string | null
  barangay_psgc?: string | null
}

export interface ParsedLocations {
  format: 'simple' | 'psgc'
  rows: LocationRow[]
  errors: string[]
  /** PSGC files: regions found (code → name) so the user can pick one. */
  regions: { code: string; name: string }[]
  counts: { provinces: number; municipalities: number; barangays: number }
}

type Raw = Record<string, unknown>

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const text = (v: unknown) => String(v ?? '').trim()

/** Finds the column whose normalised header matches one of the candidates. */
function column(headers: string[], ...candidates: string[]) {
  const wanted = candidates.map(norm)
  return headers.find((h) => wanted.includes(norm(h))) ?? null
}

/**
 * Title-cases ALL-CAPS names from the PSA file and drops its "(Capital)" marker;
 * mixed-case names are left alone.
 */
export function tidyName(name: string) {
  const n = name
    .replace(/\s*\(capital\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (n !== n.toUpperCase()) return n
  return n
    .toLowerCase()
    .replace(/(^|[\s(-])([a-zñ])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Of|De|Del|Ng)\b/g, (w) => w.toLowerCase())
}

function count(rows: LocationRow[]) {
  const p = new Set<string>()
  const m = new Set<string>()
  const b = new Set<string>()
  for (const r of rows) {
    p.add(norm(r.province))
    if (r.municipality) m.add(`${norm(r.province)}|${norm(r.municipality)}`)
    if (r.municipality && r.barangay)
      b.add(`${norm(r.province)}|${norm(r.municipality)}|${norm(r.barangay)}`)
  }
  return { provinces: p.size, municipalities: m.size, barangays: b.size }
}

export function parseLocations(raw: Raw[], opts: { region?: string } = {}): ParsedLocations {
  const headers = Object.keys(raw[0] ?? {})
  const codeCol = column(headers, '10-digit PSGC', '10 digit psgc', 'psgc', 'psgc code', 'code')
  const levelCol = column(headers, 'Geographic Level', 'geographic level', 'level', 'geolevel')
  const nameCol = column(headers, 'Name')
  if (codeCol && levelCol && nameCol) return parsePsgc(raw, codeCol, levelCol, nameCol, opts.region)
  return parseSimple(raw, headers)
}

function parseSimple(raw: Raw[], headers: string[]): ParsedLocations {
  const pCol = column(headers, 'Province')
  const mCol = column(
    headers,
    'Municipality/City',
    'Municipality',
    'City/Municipality',
    'City',
    'LGU',
  )
  const bCol = column(headers, 'Barangay')
  const pCode = column(headers, 'Province PSGC', 'Province code')
  const mCode = column(headers, 'Municipality PSGC', 'Municipality code', 'City/Municipality PSGC')
  const bCode = column(headers, 'Barangay PSGC', 'Barangay code')
  const errors: string[] = []
  if (!pCol) errors.push('Missing a "Province" column (or use the PSA PSGC file as published).')
  const rows: LocationRow[] = []
  const seen = new Set<string>()
  raw.forEach((r, i) => {
    if (!pCol) return
    const province = tidyName(text(r[pCol]))
    const municipality = mCol ? tidyName(text(r[mCol])) : ''
    const barangay = bCol ? tidyName(text(r[bCol])) : ''
    if (!province && !municipality && !barangay) return
    if (!province) return void errors.push(`Row ${i + 2}: province is empty.`)
    if (barangay && !municipality)
      return void errors.push(`Row ${i + 2}: barangay "${barangay}" has no municipality/city.`)
    const key = `${norm(province)}|${norm(municipality)}|${norm(barangay)}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push({
      province,
      province_psgc: (pCode && text(r[pCode])) || null,
      municipality: municipality || null,
      municipality_psgc: (mCode && text(r[mCode])) || null,
      municipality_is_city: /\bcity\b/i.test(municipality),
      barangay: barangay || null,
      barangay_psgc: (bCode && text(r[bCode])) || null,
    })
  })
  return { format: 'simple', rows, errors, regions: [], counts: count(rows) }
}

function parsePsgc(
  raw: Raw[],
  codeCol: string,
  levelCol: string,
  nameCol: string,
  region: string | undefined,
): ParsedLocations {
  const errors: string[] = []
  type Item = { code: string; name: string; level: string }
  const items: Item[] = []
  for (const r of raw) {
    const code = text(r[codeCol]).replace(/\D/g, '')
    const level = text(r[levelCol]).toLowerCase()
    const name = tidyName(text(r[nameCol]))
    if (!code || !name || !level) continue
    if (code.length !== 9 && code.length !== 10) continue
    items.push({ code, name, level })
  }
  const width = items[0]?.code.length ?? 10
  const provLen = width === 10 ? 5 : 4
  const munLen = width === 10 ? 7 : 6
  const pad = (prefix: string) => prefix.padEnd(width, '0')

  const regions = items
    .filter((i) => i.level.startsWith('reg'))
    .map((i) => ({ code: i.code.slice(0, 2), name: i.name }))
  const inRegion = region ? items.filter((i) => i.code.startsWith(region)) : items
  if (!region && regions.length > 1)
    errors.push('This file covers several regions. Choose the region to import.')

  const byCode = new Map(inRegion.map((i) => [i.code, i]))
  const isProv = (i: Item) => i.level.startsWith('prov')
  const isMun = (i: Item) => i.level === 'mun' || i.level === 'city' || i.level.startsWith('submun')
  const isBgy = (i: Item) => i.level.startsWith('bgy') || i.level.startsWith('barangay')

  // Where each municipality/city sits: its province, or itself (HUCs / independent cities).
  const provinceOf = (mun: Item) => {
    const prov = byCode.get(pad(mun.code.slice(0, provLen)))
    return prov && isProv(prov)
      ? { name: prov.name, psgc: prov.code, isCity: false }
      : { name: mun.name, psgc: mun.code, isCity: true }
  }

  const rows: LocationRow[] = []
  for (const p of inRegion.filter(isProv)) rows.push({ province: p.name, province_psgc: p.code })
  for (const m of inRegion.filter(isMun)) {
    const prov = provinceOf(m)
    if (prov.isCity)
      rows.push({ province: prov.name, province_psgc: prov.psgc, province_is_city: true })
    rows.push({
      province: prov.name,
      province_psgc: prov.psgc,
      province_is_city: prov.isCity,
      municipality: m.name,
      municipality_psgc: m.code,
      municipality_is_city: m.level === 'city',
    })
  }
  for (const b of inRegion.filter(isBgy)) {
    const mun = byCode.get(pad(b.code.slice(0, munLen)))
    if (!mun || !isMun(mun)) {
      errors.push(`Barangay ${b.name} (${b.code}) has no municipality/city in the file.`)
      continue
    }
    const prov = provinceOf(mun)
    rows.push({
      province: prov.name,
      province_psgc: prov.psgc,
      province_is_city: prov.isCity,
      municipality: mun.name,
      municipality_psgc: mun.code,
      municipality_is_city: mun.level === 'city',
      barangay: b.name,
      barangay_psgc: b.code,
    })
  }
  return { format: 'psgc', rows, errors, regions, counts: count(rows) }
}
