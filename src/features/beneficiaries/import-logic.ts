// Pure helpers for the beneficiary Excel import: column auto-mapping and row
// validation against the master lists. No React or network here, so it is unit-tested.
import { locationKey } from '@/features/locations/api'

export interface ImportColumn {
  key: string
  header: string
  required?: boolean
  aliases?: string[]
  example?: string | number
}

export const IMPORT_COLUMNS: ImportColumn[] = [
  {
    key: 'name',
    header: 'Name',
    required: true,
    aliases: [
      'organization',
      'association',
      'association name',
      'fa name',
      'beneficiary',
      'name of fa',
    ],
    example: 'Buguias Highland Vegetable Growers Association',
  },
  {
    key: 'type',
    header: 'Type',
    required: true,
    aliases: ['beneficiary type', 'organization type', 'type of organization'],
    example: 'FA',
  },
  {
    key: 'registration_no',
    header: 'Registration No.',
    aliases: ['registration number', 'reg no', 'registration'],
    example: 'DOLE-CAR-2018-0412',
  },
  {
    key: 'registration_agency',
    header: 'Registration Agency',
    aliases: ['agency', 'registering agency'],
    example: 'DOLE',
  },
  { key: 'province', header: 'Province', required: true, example: 'Benguet' },
  {
    key: 'municipality',
    header: 'Municipality/City',
    aliases: ['municipality', 'city', 'town', 'municipality city', 'lgu'],
    example: 'Buguias',
  },
  { key: 'barangay', header: 'Barangay', aliases: ['brgy'], example: 'Abatan' },
  {
    key: 'address_line',
    header: 'Address / Sitio',
    aliases: ['address', 'sitio', 'purok'],
    example: 'Sitio Lamut',
  },
  {
    key: 'contact_person',
    header: 'Contact Person',
    aliases: ['contact', 'president', 'chairperson', 'representative'],
    example: 'Juan dela Cruz',
  },
  {
    key: 'contact_no',
    header: 'Contact No.',
    aliases: ['contact number', 'phone', 'mobile', 'cellphone', 'mobile no'],
    example: '0917 555 0101',
  },
  { key: 'email', header: 'Email', aliases: ['e-mail', 'email address'] },
  { key: 'members_male', header: 'Male Members', aliases: ['male', 'no of male'], example: 48 },
  {
    key: 'members_female',
    header: 'Female Members',
    aliases: ['female', 'no of female'],
    example: 37,
  },
  {
    key: 'members_ip',
    header: 'IP Members',
    aliases: ['ip', 'indigenous people', 'ips'],
    example: 80,
  },
  { key: 'members_youth', header: 'Youth Members', aliases: ['youth'], example: 12 },
  { key: 'members_pwd', header: 'PWD Members', aliases: ['pwd'], example: 1 },
  {
    key: 'members_senior',
    header: 'Senior Citizen Members',
    aliases: ['senior', 'senior citizens', 'seniors'],
    example: 9,
  },
  {
    key: 'area_ha',
    header: 'Area (ha)',
    aliases: ['area', 'hectares', 'area ha', 'farm area'],
    example: 62.5,
  },
  {
    key: 'commodities',
    header: 'Commodities',
    aliases: ['commodity', 'crops', 'crop'],
    example: 'Highland Vegetables; Strawberry',
  },
  { key: 'status', header: 'Status', example: 'active' },
  { key: 'latitude', header: 'Latitude', aliases: ['lat'], example: 16.722 },
  { key: 'longitude', header: 'Longitude', aliases: ['lng', 'lon', 'long'], example: 120.833 },
  { key: 'remarks', header: 'Remarks', aliases: ['notes', 'remark'] },
]

const normHeader = (h: string) =>
  h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Maps each import column to the best-matching sheet header ('' = not mapped). */
export function autoMapColumns(headers: string[]) {
  const byNorm = new Map(headers.map((h) => [normHeader(h), h]))
  const mapping: Record<string, string> = {}
  for (const col of IMPORT_COLUMNS) {
    const candidates = [col.header, col.key.replace(/_/g, ' '), ...(col.aliases ?? [])].map(
      normHeader,
    )
    mapping[col.key] = candidates.map((c) => byNorm.get(c)).find(Boolean) ?? ''
  }
  return mapping
}

/** Mirrors SQL public.beneficiary_name_key() closely enough to catch in-file duplicates. */
export function nameKey(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(
      /(^|\s)(the|of|and|ng|sa|farmers?|growers?|producers?|association|assn|assoc|inc|incorporated|cooperative|coop|multi|purpose|mpc|org|organization|group|federation)(?=\s|$)/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

export interface Lookups {
  types: { id: string; code: string; name: string; is_active: boolean }[]
  provinces: { id: string; name: string }[]
  municipalities: { id: string; name: string; province_id: string }[]
  barangays: { id: string; name: string; municipality_id: string }[]
  commodities: { id: string; name: string; is_active: boolean }[]
}

export interface ValidatedRow {
  /** Spreadsheet row number (header = row 1). */
  rowNumber: number
  name: string
  payload: Record<string, unknown>
  municipalityId: string | null
  errors: string[]
  warnings: string[]
}

function text(v: unknown) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function parseNumber(v: unknown): number | null | 'invalid' {
  const s = text(v).replace(/,/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : 'invalid'
}

const STATUSES = ['active', 'inactive', 'dissolved']
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function validateRows(
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
  lookups: Lookups,
): ValidatedRow[] {
  const get = (row: Record<string, unknown>, key: string) =>
    mapping[key] ? row[mapping[key]] : undefined

  const typeBy = new Map<string, string>()
  for (const t of lookups.types) {
    typeBy.set(t.code.toLowerCase(), t.id)
    typeBy.set(t.name.toLowerCase(), t.id)
  }
  const provinceBy = new Map(lookups.provinces.map((p) => [locationKey(p.name), p.id]))
  const municipalityBy = new Map(
    lookups.municipalities.map((m) => [`${m.province_id}|${locationKey(m.name)}`, m.id]),
  )
  const barangayBy = new Map(
    lookups.barangays.map((b) => [`${b.municipality_id}|${locationKey(b.name)}`, b.id]),
  )
  const commodityBy = new Map(lookups.commodities.map((c) => [c.name.toLowerCase(), c.id]))

  const seen = new Map<string, number>()
  const out: ValidatedRow[] = []

  rows.forEach((row, i) => {
    const rowNumber = i + 2
    const values = IMPORT_COLUMNS.map((c) => text(get(row, c.key)))
    if (values.every((v) => !v)) return // blank line

    const errors: string[] = []
    const warnings: string[] = []
    const name = text(get(row, 'name'))
    if (name.length < 2) errors.push('Name is required')
    if (name.length > 200) errors.push('Name is longer than 200 characters')

    const typeRaw = text(get(row, 'type'))
    const typeId = typeBy.get(typeRaw.toLowerCase()) ?? null
    if (!typeRaw) errors.push('Type is required')
    else if (!typeId) errors.push(`Unknown type “${typeRaw}”`)

    const provinceRaw = text(get(row, 'province'))
    const provinceId = provinceBy.get(locationKey(provinceRaw)) ?? null
    if (!provinceRaw) errors.push('Province is required')
    else if (!provinceId) errors.push(`Unknown province “${provinceRaw}”`)

    const muniRaw = text(get(row, 'municipality'))
    let municipalityId: string | null = null
    if (muniRaw && provinceId) {
      municipalityId = municipalityBy.get(`${provinceId}|${locationKey(muniRaw)}`) ?? null
      if (!municipalityId) errors.push(`“${muniRaw}” is not a municipality of ${provinceRaw}`)
    }

    const brgyRaw = text(get(row, 'barangay'))
    let barangayId: string | null = null
    if (brgyRaw) {
      if (!municipalityId) warnings.push('Barangay ignored: no valid municipality')
      else {
        barangayId = barangayBy.get(`${municipalityId}|${locationKey(brgyRaw)}`) ?? null
        if (!barangayId)
          warnings.push(`Barangay “${brgyRaw}” is not in the master list; it was left blank`)
      }
    }

    const counts: Record<string, number> = {}
    for (const key of [
      'members_male',
      'members_female',
      'members_ip',
      'members_youth',
      'members_pwd',
      'members_senior',
    ]) {
      const n = parseNumber(get(row, key))
      const label = IMPORT_COLUMNS.find((c) => c.key === key)!.header
      if (n === 'invalid' || (n !== null && (n < 0 || !Number.isInteger(n)))) {
        errors.push(`${label} must be a whole number`)
        counts[key] = 0
      } else counts[key] = n ?? 0
    }
    const total = counts.members_male + counts.members_female
    for (const key of ['members_ip', 'members_youth', 'members_pwd', 'members_senior']) {
      if (counts[key] > total) {
        errors.push(
          `${IMPORT_COLUMNS.find((c) => c.key === key)!.header} exceed total members (${total})`,
        )
      }
    }

    const area = parseNumber(get(row, 'area_ha'))
    if (area === 'invalid' || (typeof area === 'number' && area < 0))
      errors.push('Area must be a positive number')

    const lat = parseNumber(get(row, 'latitude'))
    const lng = parseNumber(get(row, 'longitude'))
    if (lat === 'invalid' || lng === 'invalid') errors.push('Coordinates must be numbers')
    else if ((lat === null) !== (lng === null))
      errors.push('Give both latitude and longitude, or neither')
    else if (lat !== null && lng !== null && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
      errors.push('Coordinates are out of range')
    }

    const status = text(get(row, 'status')).toLowerCase() || 'active'
    if (!STATUSES.includes(status)) errors.push(`Status must be one of: ${STATUSES.join(', ')}`)

    const email = text(get(row, 'email'))
    if (email && !EMAIL.test(email)) errors.push('Email address is not valid')

    const commodityIds: string[] = []
    for (const c of text(get(row, 'commodities'))
      .split(/[;,]/)
      .map((x) => x.trim())
      .filter(Boolean)) {
      const id = commodityBy.get(c.toLowerCase())
      if (id) commodityIds.push(id)
      else warnings.push(`Commodity “${c}” not found; skipped`)
    }

    const dupKey = `${nameKey(name)}|${municipalityId ?? provinceId}`
    if (name && seen.has(dupKey)) errors.push(`Duplicate of row ${seen.get(dupKey)} in this file`)
    else if (name) seen.set(dupKey, rowNumber)

    out.push({
      rowNumber,
      name,
      municipalityId,
      errors,
      warnings,
      payload: {
        name,
        type_id: typeId,
        registration_no: text(get(row, 'registration_no')),
        registration_agency: text(get(row, 'registration_agency')),
        province_id: provinceId,
        municipality_id: municipalityId,
        barangay_id: barangayId,
        address_line: text(get(row, 'address_line')),
        contact_person: text(get(row, 'contact_person')),
        contact_no: text(get(row, 'contact_no')),
        email,
        ...counts,
        area_ha: typeof area === 'number' ? area : null,
        status,
        latitude: typeof lat === 'number' ? lat : null,
        longitude: typeof lng === 'number' ? lng : null,
        remarks: text(get(row, 'remarks')),
        commodity_ids: [...new Set(commodityIds)],
      },
    })
  })
  return out
}
