// SheetJS is ~400 KB, so it is loaded on demand (only when importing or downloading).
import type { ImportField, ImportTemplate, OptionLists, SheetTab } from './import-core'

const loadXlsx = () => import('xlsx')

/** Reads every tab as raw rows, keeping merged-cell ranges and hidden flags. */
export async function readWorkbook(data: ArrayBuffer | Uint8Array): Promise<SheetTab[]> {
  const XLSX = await loadXlsx()
  const wb = XLSX.read(data, { type: 'array', cellDates: false })
  const meta = wb.Workbook?.Sheets ?? []
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    return {
      name,
      hidden: !!meta.find((s) => s.name === name)?.Hidden,
      merges: ws['!merges'] ?? [],
      rows: XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        raw: true,
        defval: '',
        blankrows: true,
      }),
    }
  })
}

const safeName = (s: string) =>
  s
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

/** Blank workbook for a template: its columns, instructions and the valid list values. */
export async function downloadTemplateFile(
  template: ImportTemplate,
  fields: ImportField[],
  options: OptionLists,
) {
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()
  const headers = template.columns.map((c) => c.label)
  const data = XLSX.utils.aoa_to_sheet([headers])
  data['!cols'] = headers.map((h) => ({ wch: Math.max(14, h.length + 2) }))
  XLSX.utils.book_append_sheet(wb, data, 'Data')

  const fieldFor = (key: string) => fields.find((f) => f.key === key)
  const lines = template.columns.map((c) => {
    const f = fieldFor(c.field)
    const kind =
      f?.type === 'date'
        ? 'a date (YYYY-MM-DD or MM/DD/YYYY)'
        : f?.type === 'number'
          ? 'a number'
          : f?.type === 'select'
            ? 'a value from the Lists sheet'
            : 'text'
    return [`• ${c.label}: ${kind}${f?.required ? ' (required)' : ''}.`]
  })
  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill in this template'],
    [],
    ['• Enter one record per row on the Data sheet, starting in row 2. Keep the header row.'],
    ['• You can add, remove or reorder columns. PAYEW finds them by their header name.'],
    ['• You can review and edit every row in PAYEW before anything is saved.'],
    [],
    ...lines,
  ])
  help['!cols'] = [{ wch: 100 }]
  XLSX.utils.book_append_sheet(wb, help, 'Instructions')

  const selects = template.columns
    .map((c) => fieldFor(c.field))
    .filter((f): f is ImportField => f?.type === 'select')
  if (selects.length) {
    const lists = selects.map((f) => (options[f.options ?? ''] ?? []).map((o) => o.label))
    const longest = Math.max(...lists.map((l) => l.length), 0)
    const body = Array.from({ length: longest }, (_, i) => lists.map((l) => l[i] ?? ''))
    const sheet = XLSX.utils.aoa_to_sheet([
      selects.map((f) => f.label.replace(/\s*\*$/, '')),
      ...body,
    ])
    sheet['!cols'] = selects.map(() => ({ wch: 34 }))
    XLSX.utils.book_append_sheet(wb, sheet, 'Lists')
  }
  XLSX.writeFile(wb, `payew-${safeName(template.target)}-${safeName(template.name)}-template.xlsx`)
}
