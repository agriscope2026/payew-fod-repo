// SheetJS is loaded on demand (only when importing/exporting).
import { timestampSlug } from '@/lib/export'
import { exportSheet } from '@/lib/xlsx-export'
import type { SupplierView } from '@/types/database'
import { SUPPLIER_COLUMNS, SUPPLIER_TYPES } from './supplier-logic'

export async function downloadSupplierTemplate(categories: { code: string; name: string }[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const data = XLSX.utils.aoa_to_sheet([
    SUPPLIER_COLUMNS.map((c) => c.header),
    SUPPLIER_COLUMNS.map((c) => c.example ?? ''),
  ])
  data['!cols'] = SUPPLIER_COLUMNS.map((c) => ({ wch: Math.max(14, c.header.length + 2) }))
  XLSX.utils.book_append_sheet(wb, data, 'Suppliers')

  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill in this template'],
    [],
    [
      '• One supplier per row. Delete the example row before importing. Only "Business name" is required.',
    ],
    ['• Type: ' + SUPPLIER_TYPES.map((t) => t.value).join(', ') + ' (blank = individual).'],
    ['• TIN: 123-456-789 or 123-456-789-000. A TIN already in the system blocks the row.'],
    ['• Dates: YYYY-MM-DD (e.g. 2027-03-31).'],
    ['• Province / Municipality / Barangay must match the names used in PAYEW.'],
    ['• Categories: codes or names separated by semicolons, e.g. "MEALS; VENUE".'],
    ['• Bank details are not imported; admins add them on the supplier page.'],
    [],
    ['Category code', 'Category name'],
    ...categories.map((c) => [c.code, c.name]),
  ])
  help['!cols'] = [{ wch: 30 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, help, 'Instructions')
  XLSX.writeFile(wb, 'PAYEW-suppliers-template.xlsx')
}

export function exportSuppliers(
  rows: SupplierView[],
  location: (s: SupplierView) => string,
  categoryName: (code: string) => string,
) {
  return exportSheet(
    `PAYEW-suppliers-${timestampSlug()}.xlsx`,
    'Suppliers',
    [
      'Business name',
      'Trade name',
      'Owner / Representative',
      'Type',
      'TIN',
      'PhilGEPS No.',
      'PhilGEPS expiry',
      'Business permit No.',
      'Permit expiry',
      'Address',
      'Contact person',
      'Contact No.',
      'Email',
      'Categories',
      'Status',
      'Status reason',
      'Packages',
      'Open packages',
      'Awarded (PHP)',
      'Last award',
    ],
    rows.map((s) => [
      s.business_name,
      s.trade_name ?? '',
      s.owner_name ?? '',
      s.supplier_type,
      s.tin ?? '',
      s.philgeps_no ?? '',
      s.philgeps_expiry ?? '',
      s.permit_no ?? '',
      s.permit_expiry ?? '',
      [s.address_line, location(s)].filter((x) => x && x !== '—').join(', '),
      s.contact_person ?? '',
      s.contact_no ?? '',
      s.email ?? '',
      s.categories.map(categoryName).join('; '),
      s.status,
      s.status_reason ?? '',
      s.packages_count,
      s.open_packages,
      Number(s.awarded_total ?? 0),
      s.last_award_date ?? '',
    ]),
  )
}
