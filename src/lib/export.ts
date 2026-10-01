/** Triggers a browser download for in-memory content. */
export function downloadFile(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvCell(value: unknown) {
  if (value == null) return ''
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** RFC 4180 CSV with a BOM so Excel opens UTF-8 (₱, ñ) correctly. */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T & string; label: string }[],
) {
  const lines = [
    columns.map((c) => csvCell(c.label)).join(','),
    ...rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(',')),
  ]
  return '﻿' + lines.join('\r\n')
}

export function exportCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns: { key: keyof T & string; label: string }[],
) {
  downloadFile(toCsv(rows, columns), filename, 'text/csv;charset=utf-8')
}

export function timestampSlug(date = new Date()) {
  return date.toISOString().slice(0, 16).replace(/[-:T]/g, '')
}
