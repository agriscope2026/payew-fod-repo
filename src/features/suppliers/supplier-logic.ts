// Pure helpers for suppliers: name/TIN keys (mirror SQL), document expiry, Excel
// import validation. No React or network here, so it is unit-tested.
import { locationKey } from '@/features/locations/api'
import type { SupplierDocType, SupplierStatus, SupplierType } from '@/types/database'

/** Mirrors SQL public.supplier_name_key(). */
export function supplierNameKey(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(
      /(^|\s)(the|and|of|enterprises?|trading|general|merchandise|gen|merch|corp|corporation|inc|incorporated|co|company|ltd|opc|services?|store|supply|supplies)(?=\s|$)/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/** First 9 digits of a TIN (branch code ignored), or null. Mirrors suppliers.tin_key. */
export function tinKey(tin: string | null | undefined) {
  const digits = (tin ?? '').replace(/\D/g, '').slice(0, 9)
  return digits || null
}

export const TIN_PATTERN = /^\d{3}-?\d{3}-?\d{3}(-?\d{3,5})?$/

/** "123456789000" → "123-456-789-000" */
export function formatTin(tin: string) {
  const d = tin.replace(/\D/g, '')
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9)].filter(Boolean).join('-')
}

export type ExpiryState = 'missing' | 'expired' | 'expiring' | 'valid'

/** Expiring = within `days` days (default 30). */
export function expiryState(
  date: string | null | undefined,
  today: string,
  days = 30,
): ExpiryState {
  if (!date) return 'missing'
  if (date < today) return 'expired'
  const limit = new Date(`${today}T00:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() + days)
  return date <= limit.toISOString().slice(0, 10) ? 'expiring' : 'valid'
}

export const SUPPLIER_TYPES: { value: SupplierType; label: string }[] = [
  { value: 'individual', label: 'Individual / Sole proprietor' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'cooperative', label: 'Cooperative' },
  { value: 'government', label: 'Government agency' },
  { value: 'other', label: 'Other' },
]

export const SUPPLIER_STATUSES: { value: SupplierStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'blacklisted', label: 'Blacklisted' },
]

// ---------------------------------------------------------------------------
// Excel import
// ---------------------------------------------------------------------------
export interface SupplierImportColumn {
  key: string
  header: string
  required?: boolean
  example?: string
}

export const SUPPLIER_COLUMNS: SupplierImportColumn[] = [
  {
    key: 'business_name',
    header: 'Business name',
    required: true,
    example: 'Kabayan Catering Services',
  },
  { key: 'trade_name', header: 'Trade name', example: 'Kabayan Catering' },
  { key: 'owner_name', header: 'Owner / Representative', example: 'Juan Dela Cruz' },
  { key: 'supplier_type', header: 'Type', example: 'individual' },
  { key: 'tin', header: 'TIN', example: '123-456-789-000' },
  { key: 'philgeps_no', header: 'PhilGEPS No.', example: 'PG-2024-1234' },
  { key: 'philgeps_expiry', header: 'PhilGEPS expiry', example: '2027-03-31' },
  { key: 'permit_no', header: 'Business permit No.', example: 'BP-2026-0001' },
  { key: 'permit_expiry', header: 'Permit expiry', example: '2026-12-31' },
  { key: 'province', header: 'Province', example: 'Benguet' },
  { key: 'municipality', header: 'Municipality/City', example: 'La Trinidad' },
  { key: 'barangay', header: 'Barangay', example: 'Betag' },
  { key: 'address_line', header: 'Street / Address', example: 'Km. 5, Halsema Hwy' },
  { key: 'contact_person', header: 'Contact person', example: 'Maria Santos' },
  { key: 'contact_no', header: 'Contact No.', example: '0917 555 0101' },
  { key: 'email', header: 'Email', example: 'sales@example.ph' },
  { key: 'categories', header: 'Categories', example: 'MEALS; VENUE' },
  { key: 'notes', header: 'Notes', example: '' },
]

export interface SupplierLookups {
  provinces: { id: string; name: string }[]
  municipalities: { id: string; name: string; province_id: string }[]
  barangays: { id: string; name: string; municipality_id: string }[]
  categories: { code: string; name: string }[]
  existing: { id: string; business_name: string; tin: string | null }[]
}

export interface ValidatedSupplier {
  rowNumber: number
  name: string
  payload: Record<string, unknown>
  errors: string[]
  warnings: string[]
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Accepts yyyy-mm-dd, m/d/yyyy or Excel dates already rendered as text. */
export function parseDate(v: unknown): string | null | 'invalid' {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  const s = text(v)
  if (!s) return null
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  return 'invalid'
}

/** Validates rows keyed by SUPPLIER_COLUMNS headers. Duplicates block; soft issues warn. */
export function validateSuppliers(
  rows: Record<string, unknown>[],
  lookups: SupplierLookups,
): ValidatedSupplier[] {
  const provinceBy = new Map(lookups.provinces.map((p) => [locationKey(p.name), p.id]))
  const municipalityBy = new Map(
    lookups.municipalities.map((m) => [`${m.province_id}|${locationKey(m.name)}`, m.id]),
  )
  const barangayBy = new Map(
    lookups.barangays.map((b) => [`${b.municipality_id}|${locationKey(b.name)}`, b.id]),
  )
  const categoryBy = new Map<string, string>()
  for (const c of lookups.categories) {
    categoryBy.set(c.code.toLowerCase(), c.code)
    categoryBy.set(c.name.toLowerCase(), c.code)
  }
  const existingTin = new Map(
    lookups.existing.filter((e) => tinKey(e.tin)).map((e) => [tinKey(e.tin)!, e.business_name]),
  )
  const existingName = new Map(
    lookups.existing.map((e) => [supplierNameKey(e.business_name), e.business_name]),
  )
  const seenTin = new Map<string, number>()
  const seenName = new Map<string, number>()
  const header = (key: string) => SUPPLIER_COLUMNS.find((c) => c.key === key)!.header
  const types = new Set(SUPPLIER_TYPES.map((t) => t.value))

  return rows.map((row, i) => {
    const rowNumber = i + 2
    const get = (key: string) => text(row[header(key)])
    const errors: string[] = []
    const warnings: string[] = []
    const name = get('business_name')
    if (name.length < 2) errors.push('Business name is required')

    const type = get('supplier_type').toLowerCase() || 'individual'
    if (!types.has(type as SupplierType)) errors.push(`Unknown type "${get('supplier_type')}"`)

    const tin = get('tin')
    if (tin && !TIN_PATTERN.test(tin))
      errors.push('TIN must look like 123-456-789 or 123-456-789-000')
    const tk = tinKey(tin)
    if (tk) {
      if (existingTin.has(tk)) errors.push(`TIN already registered to ${existingTin.get(tk)}`)
      if (seenTin.has(tk)) errors.push(`Same TIN as row ${seenTin.get(tk)}`)
      else seenTin.set(tk, rowNumber)
    }
    const nk = supplierNameKey(name)
    if (nk) {
      if (existingName.has(nk))
        warnings.push(`Looks like existing supplier ${existingName.get(nk)}`)
      if (seenName.has(nk)) warnings.push(`Same name as row ${seenName.get(nk)}`)
      else seenName.set(nk, rowNumber)
    }

    const dates: Record<string, string | null> = {}
    for (const key of ['philgeps_expiry', 'permit_expiry']) {
      const d = parseDate(row[header(key)])
      if (d === 'invalid') errors.push(`${header(key)}: use YYYY-MM-DD`)
      else dates[key] = d
    }

    let provinceId: string | null = null
    let municipalityId: string | null = null
    let barangayId: string | null = null
    if (get('province')) {
      provinceId = provinceBy.get(locationKey(get('province'))) ?? null
      if (!provinceId) errors.push(`Unknown province "${get('province')}"`)
    }
    if (get('municipality')) {
      municipalityId = provinceId
        ? (municipalityBy.get(`${provinceId}|${locationKey(get('municipality'))}`) ?? null)
        : null
      if (!municipalityId)
        errors.push(`Unknown municipality "${get('municipality')}" in that province`)
    }
    if (get('barangay')) {
      barangayId = municipalityId
        ? (barangayBy.get(`${municipalityId}|${locationKey(get('barangay'))}`) ?? null)
        : null
      if (!barangayId) warnings.push(`Barangay "${get('barangay')}" not found; left blank`)
    }

    const email = get('email')
    if (email && !EMAIL.test(email)) errors.push('Email is not valid')

    const categories: string[] = []
    for (const raw of get('categories')
      .split(/[;,]/)
      .map((c) => c.trim())
      .filter(Boolean)) {
      const code = categoryBy.get(raw.toLowerCase())
      if (code) categories.push(code)
      else warnings.push(`Unknown category "${raw}" ignored`)
    }

    return {
      rowNumber,
      name,
      errors,
      warnings,
      payload: {
        business_name: name,
        trade_name: get('trade_name') || null,
        owner_name: get('owner_name') || null,
        supplier_type: type,
        tin: tin ? formatTin(tin) : null,
        philgeps_no: get('philgeps_no') || null,
        philgeps_expiry: dates.philgeps_expiry ?? null,
        permit_no: get('permit_no') || null,
        permit_expiry: dates.permit_expiry ?? null,
        province_id: provinceId,
        municipality_id: municipalityId,
        barangay_id: barangayId,
        address_line: get('address_line') || null,
        contact_person: get('contact_person') || null,
        contact_no: get('contact_no') || null,
        email: email || null,
        categories: [...new Set(categories)],
        notes: get('notes') || null,
      },
    }
  })
}

export const DOC_TYPE_LABEL: Record<SupplierDocType, string> = {
  philgeps: 'PhilGEPS certificate',
  business_permit: "Mayor's / business permit",
  bir_2303: 'BIR Form 2303 (COR)',
  dti_sec_cda: 'DTI / SEC / CDA registration',
  tax_clearance: 'Tax clearance',
  omnibus_sworn: 'Omnibus sworn statement',
  audited_fs: 'Audited financial statements',
  other: 'Other document',
}
