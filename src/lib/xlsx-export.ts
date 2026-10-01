// SheetJS is loaded on demand so it never weighs down the main bundle.

/** Writes a single-sheet .xlsx with a header row, column widths and an autofilter. */
export async function exportSheet(
  filename: string,
  sheetName: string,
  header: string[],
  rows: unknown[][],
) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  ws['!cols'] = header.map((h, i) => ({
    wch: Math.min(
      60,
      Math.max(10, h.length + 2, ...rows.slice(0, 200).map((r) => String(r[i] ?? '').length + 1)),
    ),
  }))
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length, c: header.length - 1 },
    }),
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename)
}
