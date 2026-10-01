// SheetJS is ~400 KB, so it is loaded on demand (only when importing/exporting).
import { timestampSlug } from '@/lib/export'
import type { Beneficiary } from './api'
import { IMPORT_COLUMNS, type Lookups } from './import-logic'

const loadXlsx = () => import('xlsx')

export interface ParsedSheet {
  name: string
  headers: string[]
  rows: Record<string, unknown>[]
}

/** Reads every sheet of an .xlsx/.xls/.csv file; the first row is the header. */
export async function parseWorkbook(file: File): Promise<ParsedSheet[]> {
  const XLSX = await loadXlsx()
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: '',
      blankrows: false,
    })
    const headers = (matrix[0] ?? []).map((h) => String(h ?? '').trim()).filter(Boolean)
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false })
    return { name, headers, rows }
  })
}

/** Blank template: one example row, an instructions sheet and the valid list values. */
export async function downloadTemplate(lookups: Lookups) {
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()

  const data = XLSX.utils.aoa_to_sheet([
    IMPORT_COLUMNS.map((c) => c.header),
    IMPORT_COLUMNS.map((c) => c.example ?? ''),
  ])
  data['!cols'] = IMPORT_COLUMNS.map((c) => ({ wch: Math.max(14, c.header.length + 2) }))
  XLSX.utils.book_append_sheet(wb, data, 'Beneficiaries')

  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill in this template'],
    [],
    ['• One beneficiary per row. Delete the example row before importing.'],
    ['• Required: Name, Type, Province. Municipality and Barangay are strongly recommended.'],
    ['• Type: use a code or name from the Lists sheet (e.g. FA, COOP, IND).'],
    [
      '• Locations must match the names in the Lists sheet (spelling and capitalization are forgiven).',
    ],
    ['• Members: whole numbers. IP, Youth, PWD and Senior counts cannot exceed Male + Female.'],
    ['• Commodities: separate several with a semicolon, e.g. "Arabica Coffee; Cacao".'],
    ['• Status: active, inactive or dissolved (blank = active).'],
    [
      '• Latitude/Longitude are optional; give both or neither (decimal degrees, e.g. 16.722 / 120.833).',
    ],
    ['• Possible duplicates of existing records are flagged before anything is saved.'],
  ])
  help['!cols'] = [{ wch: 110 }]
  XLSX.utils.book_append_sheet(wb, help, 'Instructions')

  const provinceName = new Map(lookups.provinces.map((p) => [p.id, p.name]))
  const muniName = new Map(lookups.municipalities.map((m) => [m.id, m]))
  const longest = Math.max(
    lookups.types.length,
    lookups.commodities.length,
    lookups.barangays.length,
  )
  const lists: unknown[][] = [
    ['Type code', 'Type name', 'Commodity', 'Province', 'Municipality/City', 'Barangay'],
  ]
  const munis = lookups.municipalities.map((m) => [provinceName.get(m.province_id) ?? '', m.name])
  const brgys = lookups.barangays.map((b) => {
    const m = muniName.get(b.municipality_id)
    return [m ? (provinceName.get(m.province_id) ?? '') : '', m?.name ?? '', b.name]
  })
  for (let i = 0; i < Math.max(longest, munis.length); i++) {
    const t = lookups.types.filter((x) => x.is_active)[i]
    const c = lookups.commodities.filter((x) => x.is_active)[i]
    const b = brgys[i]
    const m = munis[i]
    lists.push([
      t?.code ?? '',
      t?.name ?? '',
      c?.name ?? '',
      b?.[0] ?? m?.[0] ?? '',
      b?.[1] ?? m?.[1] ?? '',
      b?.[2] ?? '',
    ])
  }
  const listSheet = XLSX.utils.aoa_to_sheet(lists)
  listSheet['!cols'] = [
    { wch: 10 },
    { wch: 32 },
    { wch: 24 },
    { wch: 18 },
    { wch: 22 },
    { wch: 22 },
  ]
  XLSX.utils.book_append_sheet(wb, listSheet, 'Lists')

  XLSX.writeFile(wb, 'payew-beneficiaries-template.xlsx')
}

export async function exportBeneficiaries(
  rows: Beneficiary[],
  names: {
    type: (id: string) => string
    province: (id: string | null) => string
    municipality: (id: string | null) => string
    barangay: (id: string | null) => string
    commodity: (id: string) => string
    program: (id: string | null) => string
  },
) {
  const XLSX = await loadXlsx()
  const header = [...IMPORT_COLUMNS.map((c) => c.header), 'Total Members', 'Registered By']
  const body = rows.map((b) => [
    b.name,
    names.type(b.type_id),
    b.registration_no ?? '',
    b.registration_agency ?? '',
    names.province(b.province_id),
    names.municipality(b.municipality_id),
    names.barangay(b.barangay_id),
    b.address_line ?? '',
    b.contact_person ?? '',
    b.contact_no ?? '',
    b.email ?? '',
    b.members_male,
    b.members_female,
    b.members_ip,
    b.members_youth,
    b.members_pwd,
    b.members_senior,
    b.area_ha ?? '',
    b.commodity_ids.map(names.commodity).join('; '),
    b.status,
    b.latitude ?? '',
    b.longitude ?? '',
    b.remarks ?? '',
    b.members_total,
    names.program(b.registered_by_program_id),
  ])
  const ws = XLSX.utils.aoa_to_sheet([header, ...body])
  ws['!cols'] = header.map((h) => ({ wch: Math.max(12, h.length + 2) }))
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: body.length, c: header.length - 1 },
    }),
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Beneficiaries')
  XLSX.writeFile(wb, `payew-beneficiaries-${timestampSlug()}.xlsx`)
}
