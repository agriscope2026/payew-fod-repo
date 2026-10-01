// Pure helpers for the Excel-like grid: parsing typed cells, TSV copy/paste,
// range math. No React here, so it is unit-tested.

export type CellType = 'text' | 'number' | 'select'

export interface GridColumnSpec {
  key: string
  type: CellType
  /** For selects: value ↔ label. Pasted text matches either (case-insensitive). */
  options?: { value: string; label: string }[]
  readOnly?: boolean
}

export interface CellPos {
  row: number
  col: number
}

export interface Range {
  start: CellPos
  end: CellPos
}

export type CellValue = string | number | null

/** Parses user/pasted text into a typed value; returns `undefined` when invalid. */
export function parseCell(text: string, col: GridColumnSpec): CellValue | undefined {
  const t = text.trim()
  if (t === '') return null
  if (col.type === 'number') {
    // Accept "1,234.50", "₱1,234", "(500)" (accounting negative) and "12%".
    let s = t.replace(/[₱$,\s]/g, '')
    let neg = false
    if (/^\(.*\)$/.test(s)) {
      neg = true
      s = s.slice(1, -1)
    }
    if (s.endsWith('%')) s = s.slice(0, -1)
    const n = Number(s)
    if (!Number.isFinite(n)) return undefined
    return neg ? -n : n
  }
  if (col.type === 'select') {
    const lower = t.toLowerCase()
    const hit =
      col.options?.find((o) => o.value.toLowerCase() === lower) ??
      col.options?.find((o) => o.label.toLowerCase() === lower) ??
      col.options?.find((o) => o.label.toLowerCase().startsWith(lower))
    return hit ? hit.value : undefined
  }
  return t
}

/** Text shown for a cell (selects show their label). */
export function displayCell(value: CellValue | undefined, col: GridColumnSpec): string {
  if (value === null || value === undefined || value === '') return ''
  if (col.type === 'select')
    return col.options?.find((o) => o.value === value)?.label ?? String(value)
  return String(value)
}

/** Splits clipboard text (Excel copies TSV with \r\n, quotes cells containing tabs/newlines). */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
    } else if (ch === '"' && cell === '') {
      quoted = true
    } else if (ch === '\t') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export function toTsv(matrix: string[][]) {
  const esc = (s: string) => (/[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return matrix.map((r) => r.map(esc).join('\t')).join('\n')
}

export function normalizeRange(r: Range): Range {
  return {
    start: { row: Math.min(r.start.row, r.end.row), col: Math.min(r.start.col, r.end.col) },
    end: { row: Math.max(r.start.row, r.end.row), col: Math.max(r.start.col, r.end.col) },
  }
}

export function inRange(r: Range | null, row: number, col: number) {
  if (!r) return false
  const n = normalizeRange(r)
  return row >= n.start.row && row <= n.end.row && col >= n.start.col && col <= n.end.col
}

/** Copies a range as display text. */
export function copyRange<R extends Record<string, unknown>>(
  rows: R[],
  cols: GridColumnSpec[],
  range: Range,
): string {
  const n = normalizeRange(range)
  const out: string[][] = []
  for (let r = n.start.row; r <= n.end.row; r++) {
    const line: string[] = []
    for (let c = n.start.col; c <= n.end.col; c++) {
      line.push(displayCell(rows[r]?.[cols[c].key] as CellValue, cols[c]))
    }
    out.push(line)
  }
  return toTsv(out)
}

export interface PasteResult<R> {
  rows: R[]
  /** Cells that could not be parsed (left unchanged), as "row:col" 0-based. */
  rejected: CellPos[]
  range: Range
}

/**
 * Pastes a matrix at `at`, adding rows with `newRow()` when it runs past the end.
 * A single copied cell fills the whole selected range (Excel behaviour).
 * Read-only columns are skipped; invalid values are reported and left unchanged.
 */
export function applyPaste<R extends Record<string, unknown>>(
  rows: R[],
  cols: GridColumnSpec[],
  matrix: string[][],
  target: Range,
  newRow: () => R,
): PasteResult<R> {
  const n = normalizeRange(target)
  const single = matrix.length === 1 && matrix[0].length === 1
  const height = single ? n.end.row - n.start.row + 1 : matrix.length
  const width = single ? n.end.col - n.start.col + 1 : Math.max(...matrix.map((m) => m.length))
  const next = rows.slice()
  const rejected: CellPos[] = []
  for (let i = 0; i < height; i++) {
    const r = n.start.row + i
    while (next.length <= r) next.push(newRow())
    const copy = { ...next[r] } as Record<string, unknown>
    for (let j = 0; j < width; j++) {
      const c = n.start.col + j
      const col = cols[c]
      if (!col || col.readOnly) continue
      const text = single ? matrix[0][0] : (matrix[i]?.[j] ?? '')
      const value = parseCell(text, col)
      if (value === undefined) rejected.push({ row: r, col: c })
      else copy[col.key] = value
    }
    next[r] = copy as R
  }
  return {
    rows: next,
    rejected,
    range: {
      start: n.start,
      end: {
        row: n.start.row + height - 1,
        col: Math.min(n.start.col + width - 1, cols.length - 1),
      },
    },
  }
}

/** Clears editable cells in a range. */
export function clearRange<R extends Record<string, unknown>>(
  rows: R[],
  cols: GridColumnSpec[],
  range: Range,
): R[] {
  const n = normalizeRange(range)
  return rows.map((row, r) => {
    if (r < n.start.row || r > n.end.row) return row
    const copy = { ...row } as Record<string, unknown>
    for (let c = n.start.col; c <= n.end.col; c++) {
      if (!cols[c]?.readOnly) copy[cols[c].key] = cols[c].type === 'number' ? null : null
    }
    return copy as R
  })
}

/** Moves the active cell, clamped to the grid. */
export function move(
  pos: CellPos,
  dRow: number,
  dCol: number,
  rowCount: number,
  colCount: number,
): CellPos {
  return {
    row: Math.max(0, Math.min(rowCount - 1, pos.row + dRow)),
    col: Math.max(0, Math.min(colCount - 1, pos.col + dCol)),
  }
}
