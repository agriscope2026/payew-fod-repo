// The sheet model and pure edits on it. Cells are keyed by row and column ids,
// so cards and cells keep their identity when rows or columns are inserted.
import {
  cellName,
  colName,
  dateToSerial,
  evaluate,
  isError,
  moveFormula,
  SheetError,
  shiftFormula,
  type Scalar,
} from './formula'

export type SheetKind = 'WFP' | 'PPMP' | 'APP' | 'allotments' | 'obligations' | 'disbursements'

/** Name used in formulas from other sheets, e.g. =SUM(ORS!H:H). */
export const SHEET_NAME: Record<SheetKind, string> = {
  WFP: 'WFP',
  PPMP: 'PPMP',
  APP: 'APP',
  allotments: 'Allotments',
  obligations: 'ORS',
  disbursements: 'DV',
}

export const SHEET_TITLE: Record<SheetKind, string> = {
  WFP: 'Work and Financial Plan',
  PPMP: 'Project Procurement Management Plan',
  APP: 'Annual Procurement Plan',
  allotments: 'Allotments',
  obligations: 'Obligation Request and Status (ORS) Register',
  disbursements: 'Disbursement Voucher (DV) Register',
}

export type NumberFormat = 'general' | 'number' | 'integer' | 'peso' | 'percent' | 'date' | 'text'

export interface CellStyle {
  b?: boolean
  i?: boolean
  u?: boolean
  strike?: boolean
  /** Hex colors, e.g. "#1f2937". */
  color?: string
  bg?: string
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  wrap?: boolean
  fmt?: NumberFormat
  /** Font size in points. */
  size?: number
  border?: { t?: boolean; r?: boolean; b?: boolean; l?: boolean }
}

export interface Cell {
  /** Typed value. Dates are Excel serial numbers with fmt "date". */
  v?: string | number | boolean | null
  /** Formula without the leading "=". */
  f?: string
  s?: CellStyle
}

export interface Merge {
  r: number
  c: number
  rs: number
  cs: number
}

/** What a column means, for features that read the sheet (e.g. WFP activities). */
export type ColumnRole =
  | 'phase'
  | 'pap'
  | 'sub'
  | 'status'
  | 'unit'
  | 'target'
  | 'object'
  | 'budget'
  | 'for_obligation'
  | 'obligated'
  | 'for_disbursement'
  | 'paid'
  | 'disbursed'
  | 'remarks'

export interface Sheet {
  version: 1
  /** Column id per role; columns keep their role when others are inserted. */
  roles?: Partial<Record<ColumnRole, string>>
  /** Dropdown choices per column id, like Excel's list validation. */
  lists?: Record<string, string[]>
  /**
   * Monthly physical targets per activity row id, brought in with an uploaded file
   * (BED 2). They fill activities whose monthly targets are still empty.
   */
  physical?: Record<string, number[]>
  /** Row id → the WFP row it reflects, in sheets filled from the WFP. */
  links?: Record<string, string>
  cols: { id: string; w: number }[]
  rows: { id: string; h?: number }[]
  cells: Record<string, Cell>
  merges: Merge[]
  freeze: { rows: number; cols: number }
}

export interface Range {
  r1: number
  c1: number
  r2: number
  c2: number
}

export const DEFAULT_COL_WIDTH = 110
export const DEFAULT_ROW_HEIGHT = 28
export const MAX_ROWS = 5000
export const MAX_COLS = 200

let counter = 0
/** Short unique ids; cell keys are "rowId:colId". */
export const newId = () =>
  `${Date.now().toString(36)}${(counter++ % 1296).toString(36).padStart(2, '0')}${Math.random()
    .toString(36)
    .slice(2, 6)}`

export const cellKey = (sheet: Sheet, r: number, c: number) => {
  const row = sheet.rows[r]
  const col = sheet.cols[c]
  return row && col ? `${row.id}:${col.id}` : null
}

export const getCell = (sheet: Sheet, r: number, c: number): Cell | undefined => {
  const key = cellKey(sheet, r, c)
  return key ? sheet.cells[key] : undefined
}

export function blankSheet(rows = 50, cols = 12): Sheet {
  return {
    version: 1,
    cols: Array.from({ length: cols }, () => ({ id: newId(), w: DEFAULT_COL_WIDTH })),
    rows: Array.from({ length: rows }, () => ({ id: newId() })),
    cells: {},
    merges: [],
    freeze: { rows: 0, cols: 0 },
  }
}

/** Makes sure stored JSON has every part, so older or hand-made sheets still open. */
export function normalizeSheet(raw: unknown): Sheet {
  const s = (raw ?? {}) as Partial<Sheet>
  if (!Array.isArray(s.rows) || !Array.isArray(s.cols)) return blankSheet()
  return {
    version: 1,
    cols: s.cols.map((c) => ({ id: String(c.id), w: Number(c.w) || DEFAULT_COL_WIDTH })),
    rows: s.rows.map((r) => (r.h ? { id: String(r.id), h: Number(r.h) } : { id: String(r.id) })),
    cells: s.cells && typeof s.cells === 'object' ? s.cells : {},
    merges: Array.isArray(s.merges) ? s.merges : [],
    freeze: { rows: Number(s.freeze?.rows) || 0, cols: Number(s.freeze?.cols) || 0 },
    ...(s.roles && typeof s.roles === 'object' ? { roles: s.roles } : {}),
    ...(s.lists && typeof s.lists === 'object' ? { lists: s.lists } : {}),
    ...(s.physical && typeof s.physical === 'object' ? { physical: s.physical } : {}),
    ...(s.links && typeof s.links === 'object' ? { links: s.links } : {}),
  }
}

export const normRange = (a: { r: number; c: number }, b: { r: number; c: number }): Range => ({
  r1: Math.min(a.r, b.r),
  c1: Math.min(a.c, b.c),
  r2: Math.max(a.r, b.r),
  c2: Math.max(a.c, b.c),
})

export const rangeName = (r: Range) =>
  r.r1 === r.r2 && r.c1 === r.c2
    ? cellName(r.r1, r.c1)
    : `${cellName(r.r1, r.c1)}:${cellName(r.r2, r.c2)}`

/** Parses "B3" or "B3:D9" into a range. */
export function parseRangeName(text: string): Range | null {
  const m = /^\s*\$?([A-Za-z]{1,3})\$?(\d+)(?:\s*:\s*\$?([A-Za-z]{1,3})\$?(\d+))?\s*$/.exec(text)
  if (!m) return null
  const toCol = (l: string) =>
    l
      .toUpperCase()
      .split('')
      .reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1
  const a = { r: Number(m[2]) - 1, c: toCol(m[1]) }
  const b = m[3] ? { r: Number(m[4]) - 1, c: toCol(m[3]) } : a
  if (a.r < 0 || b.r < 0) return null
  return normRange(a, b)
}

export const mergeAt = (sheet: Sheet, r: number, c: number) =>
  sheet.merges.find((m) => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs)

/** Grows a range so it never cuts through a merged cell. */
export function expandToMerges(sheet: Sheet, range: Range): Range {
  let out = { ...range }
  let changed = true
  while (changed) {
    changed = false
    for (const m of sheet.merges) {
      const overlaps =
        m.r <= out.r2 && m.r + m.rs - 1 >= out.r1 && m.c <= out.c2 && m.c + m.cs - 1 >= out.c1
      if (!overlaps) continue
      const next = {
        r1: Math.min(out.r1, m.r),
        c1: Math.min(out.c1, m.c),
        r2: Math.max(out.r2, m.r + m.rs - 1),
        c2: Math.max(out.c2, m.c + m.cs - 1),
      }
      if (JSON.stringify(next) !== JSON.stringify(out)) {
        out = next
        changed = true
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Typing values
// ---------------------------------------------------------------------------
/** Turns what someone typed into a cell value, formula or format. */
export function parseInput(text: string): { v?: Cell['v']; f?: string; fmt?: NumberFormat } {
  if (text.startsWith('=') && text.length > 1) return { f: text.slice(1) }
  if (text.startsWith("'")) return { v: text.slice(1), fmt: 'text' }
  const t = text.trim()
  if (t === '') return { v: null }
  const upper = t.toUpperCase()
  if (upper === 'TRUE' || upper === 'FALSE') return { v: upper === 'TRUE' }
  const money = /^(-)?\s*(?:₱|PHP|P)\s?(-)?([\d,]*\.?\d+)$/i.exec(t)
  if (money) {
    const n = Number(money[3].replace(/,/g, ''))
    if (Number.isFinite(n)) return { v: money[1] || money[2] ? -n : n, fmt: 'peso' }
  }
  const pct = /^(-?[\d,]*\.?\d+)\s?%$/.exec(t)
  if (pct) return { v: Number(pct[1].replace(/,/g, '')) / 100, fmt: 'percent' }
  const paren = /^\(([\d,]*\.?\d+)\)$/.exec(t)
  if (paren) return { v: -Number(paren[1].replace(/,/g, '')) }
  if (/^-?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/.test(t) && /\d/.test(t)) {
    return { v: Number(t.replace(/,/g, '')) }
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (iso || us) {
    const [y, m, d] = iso ? [+iso[1], +iso[2], +iso[3]] : [+us![3], +us![1], +us![2]]
    const date = new Date(y, m - 1, d)
    if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) {
      return { v: dateToSerial(date), fmt: 'date' }
    }
  }
  return { v: text }
}

/** Text to show in the editor for a cell. */
export function editText(cell: Cell | undefined): string {
  if (!cell) return ''
  if (cell.f !== undefined) return `=${cell.f}`
  const v = cell.v
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number' && cell.s?.fmt === 'date') {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000))
    return d.toISOString().slice(0, 10)
  }
  if (typeof v === 'number' && cell.s?.fmt === 'percent')
    return `${Number((v * 100).toPrecision(12))}%`
  return String(v)
}

const isEmptyCell = (cell: Cell | undefined) =>
  !cell || (cell.f === undefined && (cell.v === undefined || cell.v === null || cell.v === ''))

// ---------------------------------------------------------------------------
// Edits (each returns a new sheet)
// ---------------------------------------------------------------------------
function ensureSize(sheet: Sheet, rows: number, cols: number): Sheet {
  if (sheet.rows.length >= rows && sheet.cols.length >= cols) return sheet
  return {
    ...sheet,
    rows:
      sheet.rows.length >= rows
        ? sheet.rows
        : [
            ...sheet.rows,
            ...Array.from({ length: Math.min(rows, MAX_ROWS) - sheet.rows.length }, () => ({
              id: newId(),
            })),
          ],
    cols:
      sheet.cols.length >= cols
        ? sheet.cols
        : [
            ...sheet.cols,
            ...Array.from({ length: Math.min(cols, MAX_COLS) - sheet.cols.length }, () => ({
              id: newId(),
              w: DEFAULT_COL_WIDTH,
            })),
          ],
  }
}

export interface CellUpdate {
  r: number
  c: number
  /** Replaces value and formula; style is kept unless given. */
  cell: Cell | null
}

export function setCells(sheet: Sheet, updates: CellUpdate[]): Sheet {
  if (!updates.length) return sheet
  const maxR = Math.max(...updates.map((u) => u.r)) + 1
  const maxC = Math.max(...updates.map((u) => u.c)) + 1
  const next = ensureSize(sheet, maxR, maxC)
  const cells = { ...next.cells }
  for (const u of updates) {
    const key = cellKey(next, u.r, u.c)
    if (!key) continue
    const style = u.cell?.s ?? cells[key]?.s
    const merged: Cell = { ...(u.cell ?? {}) }
    delete merged.s
    if (style && Object.keys(style).length) merged.s = style
    if (merged.v === undefined) delete merged.v
    if (merged.f === undefined) delete merged.f
    if (Object.keys(merged).length === 0) delete cells[key]
    else cells[key] = merged
  }
  return { ...next, cells }
}

/** Applies what someone typed to one cell, keeping its style and setting a format if implied. */
export function typeInto(sheet: Sheet, r: number, c: number, text: string): Sheet {
  const parsed = parseInput(text)
  const old = getCell(sheet, r, c)
  const style = { ...(old?.s ?? {}) }
  if (parsed.fmt && (!style.fmt || style.fmt === 'general')) style.fmt = parsed.fmt
  const cell: Cell =
    parsed.f !== undefined ? { f: parsed.f, s: style } : { v: parsed.v ?? null, s: style }
  return setCells(sheet, [{ r, c, cell }])
}

export function clearRange(
  sheet: Sheet,
  range: Range,
  what: 'contents' | 'formats' | 'all',
): Sheet {
  const cells = { ...sheet.cells }
  for (let r = range.r1; r <= range.r2; r++)
    for (let c = range.c1; c <= range.c2; c++) {
      const key = cellKey(sheet, r, c)
      if (!key || !cells[key]) continue
      if (what === 'all') delete cells[key]
      else if (what === 'contents') {
        if (cells[key].s) cells[key] = { s: cells[key].s }
        else delete cells[key]
      } else {
        const rest = { ...cells[key] }
        delete rest.s
        if (isEmptyCell(rest)) delete cells[key]
        else cells[key] = rest
      }
    }
  return { ...sheet, cells }
}

export function styleRange(
  sheet: Sheet,
  range: Range,
  patch: Partial<CellStyle> | ((old: CellStyle, r: number, c: number) => CellStyle),
): Sheet {
  const next = ensureSize(sheet, range.r2 + 1, range.c2 + 1)
  const cells = { ...next.cells }
  for (let r = range.r1; r <= range.r2; r++)
    for (let c = range.c1; c <= range.c2; c++) {
      const key = cellKey(next, r, c)!
      const old = cells[key]?.s ?? {}
      const style = typeof patch === 'function' ? patch(old, r, c) : { ...old, ...patch }
      for (const k of Object.keys(style) as (keyof CellStyle)[]) {
        if (style[k] === undefined || style[k] === false) delete style[k]
      }
      const cell = { ...(cells[key] ?? {}) }
      if (Object.keys(style).length) cell.s = style
      else delete cell.s
      if (isEmptyCell(cell) && !cell.s) delete cells[key]
      else cells[key] = cell
    }
  return { ...next, cells }
}

export type BorderPreset = 'all' | 'outer' | 'bottom' | 'top' | 'none'
export function borderRange(sheet: Sheet, range: Range, preset: BorderPreset): Sheet {
  return styleRange(sheet, range, (old, r, c) => {
    const border = preset === 'none' ? {} : { ...(old.border ?? {}) }
    if (preset === 'all') Object.assign(border, { t: true, r: true, b: true, l: true })
    if (preset === 'outer') {
      if (r === range.r1) border.t = true
      if (r === range.r2) border.b = true
      if (c === range.c1) border.l = true
      if (c === range.c2) border.r = true
    }
    if (preset === 'bottom' && r === range.r2) border.b = true
    if (preset === 'top' && r === range.r1) border.t = true
    const out = { ...old }
    if (Object.keys(border).length) out.border = border
    else delete out.border
    return out
  })
}

export function mergeRange(sheet: Sheet, range: Range): Sheet {
  const merges = sheet.merges.filter(
    (m) =>
      !(
        m.r <= range.r2 &&
        m.r + m.rs - 1 >= range.r1 &&
        m.c <= range.c2 &&
        m.c + m.cs - 1 >= range.c1
      ),
  )
  const covered = merges.length !== sheet.merges.length
  if (covered || (range.r1 === range.r2 && range.c1 === range.c2)) return { ...sheet, merges }
  // Like Excel, only the top-left value is kept.
  const keep = getCell(sheet, range.r1, range.c1)
  let next = clearRange(sheet, range, 'contents')
  if (keep) next = setCells(next, [{ r: range.r1, c: range.c1, cell: keep }])
  return {
    ...next,
    merges: [
      ...merges,
      { r: range.r1, c: range.c1, rs: range.r2 - range.r1 + 1, cs: range.c2 - range.c1 + 1 },
    ],
  }
}

function rewriteAllFormulas(sheet: Sheet, fn: (f: string) => string): Record<string, Cell> {
  const cells: Record<string, Cell> = {}
  for (const [key, cell] of Object.entries(sheet.cells)) {
    cells[key] = cell.f !== undefined ? { ...cell, f: fn(cell.f) } : cell
  }
  return cells
}

export function insertRows(sheet: Sheet, at: number, count: number, name: string): Sheet {
  const n = Math.min(count, MAX_ROWS - sheet.rows.length)
  if (n <= 0) return sheet
  const rows = [...sheet.rows]
  rows.splice(at, 0, ...Array.from({ length: n }, () => ({ id: newId() })))
  return {
    ...sheet,
    rows,
    cells: rewriteAllFormulas(sheet, (f) => shiftFormula(f, 'row', at, n, name, true)),
    merges: sheet.merges.map((m) =>
      m.r >= at ? { ...m, r: m.r + n } : m.r + m.rs > at ? { ...m, rs: m.rs + n } : m,
    ),
    freeze: {
      ...sheet.freeze,
      rows: sheet.freeze.rows > at ? sheet.freeze.rows + n : sheet.freeze.rows,
    },
  }
}

export function deleteRows(sheet: Sheet, at: number, count: number, name: string): Sheet {
  const n = Math.min(count, sheet.rows.length - at)
  if (n <= 0 || n >= sheet.rows.length) return sheet
  const gone = new Set(sheet.rows.slice(at, at + n).map((r) => r.id))
  const rows = sheet.rows.filter((r) => !gone.has(r.id))
  const cells = rewriteAllFormulas(sheet, (f) => shiftFormula(f, 'row', at, -n, name, true))
  for (const key of Object.keys(cells)) if (gone.has(key.split(':')[0])) delete cells[key]
  return {
    ...sheet,
    rows,
    cells,
    merges: shrinkMerges(sheet.merges, 'r', 'rs', at, n),
    freeze: {
      ...sheet.freeze,
      rows: Math.max(0, sheet.freeze.rows - overlap(0, sheet.freeze.rows, at, n)),
    },
  }
}

export function insertCols(sheet: Sheet, at: number, count: number, name: string): Sheet {
  const n = Math.min(count, MAX_COLS - sheet.cols.length)
  if (n <= 0) return sheet
  const width = sheet.cols[Math.max(0, at - 1)]?.w ?? DEFAULT_COL_WIDTH
  const cols = [...sheet.cols]
  cols.splice(at, 0, ...Array.from({ length: n }, () => ({ id: newId(), w: width })))
  return {
    ...sheet,
    cols,
    cells: rewriteAllFormulas(sheet, (f) => shiftFormula(f, 'col', at, n, name, true)),
    merges: sheet.merges.map((m) =>
      m.c >= at ? { ...m, c: m.c + n } : m.c + m.cs > at ? { ...m, cs: m.cs + n } : m,
    ),
    freeze: {
      ...sheet.freeze,
      cols: sheet.freeze.cols > at ? sheet.freeze.cols + n : sheet.freeze.cols,
    },
  }
}

export function deleteCols(sheet: Sheet, at: number, count: number, name: string): Sheet {
  const n = Math.min(count, sheet.cols.length - at)
  if (n <= 0 || n >= sheet.cols.length) return sheet
  const gone = new Set(sheet.cols.slice(at, at + n).map((c) => c.id))
  const cols = sheet.cols.filter((c) => !gone.has(c.id))
  const cells = rewriteAllFormulas(sheet, (f) => shiftFormula(f, 'col', at, -n, name, true))
  for (const key of Object.keys(cells)) if (gone.has(key.split(':')[1])) delete cells[key]
  return {
    ...sheet,
    cols,
    cells,
    merges: shrinkMerges(sheet.merges, 'c', 'cs', at, n),
    freeze: {
      ...sheet.freeze,
      cols: Math.max(0, sheet.freeze.cols - overlap(0, sheet.freeze.cols, at, n)),
    },
  }
}

const overlap = (a: number, len: number, b: number, n: number) =>
  Math.max(0, Math.min(a + len, b + n) - Math.max(a, b))

function shrinkMerges(merges: Merge[], pos: 'r' | 'c', span: 'rs' | 'cs', at: number, n: number) {
  return merges.flatMap((m) => {
    const lost = overlap(m[pos], m[span], at, n)
    const start = m[pos] >= at + n ? m[pos] - n : m[pos] >= at ? at : m[pos]
    const size = m[span] - lost
    if (size <= 0 || (size === 1 && (pos === 'r' ? m.cs : m.rs) === 1)) return []
    return [{ ...m, [pos]: start, [span]: size }]
  })
}

export function resizeCol(sheet: Sheet, c: number, w: number): Sheet {
  return {
    ...sheet,
    cols: sheet.cols.map((x, i) => (i === c ? { ...x, w: Math.max(24, Math.round(w)) } : x)),
  }
}

export function resizeRow(sheet: Sheet, r: number, h: number): Sheet {
  return {
    ...sheet,
    rows: sheet.rows.map((x, i) => (i === r ? { ...x, h: Math.max(18, Math.round(h)) } : x)),
  }
}

// ---------------------------------------------------------------------------
// Copy, paste and fill
// ---------------------------------------------------------------------------
export interface Clip {
  rows: number
  cols: number
  cells: (Cell | undefined)[][]
  /** Where it was copied from, for adjusting relative references. */
  from: { r: number; c: number }
}

export function copyRange(sheet: Sheet, range: Range): Clip {
  const cells: (Cell | undefined)[][] = []
  for (let r = range.r1; r <= range.r2; r++) {
    const row: (Cell | undefined)[] = []
    for (let c = range.c1; c <= range.c2; c++) row.push(getCell(sheet, r, c))
    cells.push(row)
  }
  return {
    rows: range.r2 - range.r1 + 1,
    cols: range.c2 - range.c1 + 1,
    cells,
    from: { r: range.r1, c: range.c1 },
  }
}

/** Pastes cells; a clip smaller than the target is repeated across it, as in Excel. */
export function pasteClip(sheet: Sheet, target: Range, clip: Clip): Sheet {
  const height = target.r2 - target.r1 + 1
  const width = target.c2 - target.c1 + 1
  const rows = height > clip.rows && height % clip.rows === 0 ? height : clip.rows
  const cols = width > clip.cols && width % clip.cols === 0 ? width : clip.cols
  const updates: CellUpdate[] = []
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const src = clip.cells[i % clip.rows][j % clip.cols]
      const r = target.r1 + i
      const c = target.c1 + j
      if (r >= MAX_ROWS || c >= MAX_COLS) continue
      const cell: Cell | null = src
        ? src.f !== undefined
          ? {
              ...src,
              f: moveFormula(
                src.f,
                r - (clip.from.r + (i % clip.rows)),
                c - (clip.from.c + (j % clip.cols)),
              ),
            }
          : { ...src }
        : null
      updates.push({ r, c, cell: cell ?? { v: null, s: undefined } })
    }
  // A pasted blank also clears style, as Excel does.
  let next = setCells(sheet, updates)
  const cells = { ...next.cells }
  for (const u of updates) {
    const key = cellKey(next, u.r, u.c)
    if (key && u.cell && isEmptyCell(u.cell) && !u.cell.s) delete cells[key]
  }
  next = { ...next, cells }
  return next
}

/** Parses tab-separated text copied from Excel or Google Sheets. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const body = text.replace(/\r\n?/g, '\n').replace(/\n$/, '')
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === '\t') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  rows.push(row)
  return rows
}

export function pasteText(
  sheet: Sheet,
  at: { r: number; c: number },
  text: string,
): { sheet: Sheet; range: Range } {
  const grid = parseTsv(text)
  let next = sheet
  for (let i = 0; i < grid.length; i++)
    for (let j = 0; j < grid[i].length; j++) {
      const r = at.r + i
      const c = at.c + j
      if (r >= MAX_ROWS || c >= MAX_COLS) continue
      next = typeInto(next, r, c, grid[i][j])
    }
  const width = Math.max(...grid.map((r) => r.length))
  return {
    sheet: next,
    range: { r1: at.r, c1: at.c, r2: at.r + grid.length - 1, c2: at.c + width - 1 },
  }
}

/** Fills `to` from the cells in `from`, which lies at its top or left edge. */
export function fillRange(sheet: Sheet, from: Range, to: Range): Sheet {
  const clip = copyRange(sheet, from)
  // Two or more numbers in a line continue their step: 1, 2 → 3, 4…
  const down = to.r2 > from.r2
  const across = to.c2 > from.c2
  let next = pasteClip(sheet, to, clip)
  if (down && clip.rows >= 2) {
    for (let j = 0; j < clip.cols; j++) {
      const series = clip.cells.map((row) => row[j])
      const step = numberStep(series)
      if (step === null) continue
      const last = Number(series[series.length - 1]!.v)
      const updates: CellUpdate[] = []
      for (let r = from.r2 + 1; r <= to.r2; r++) {
        const src = getCell(next, r, from.c1 + j)
        updates.push({ r, c: from.c1 + j, cell: { ...src, v: last + step * (r - from.r2) } })
      }
      next = setCells(next, updates)
    }
  } else if (across && clip.cols >= 2) {
    for (let i = 0; i < clip.rows; i++) {
      const series = clip.cells[i]
      const step = numberStep(series)
      if (step === null) continue
      const last = Number(series[series.length - 1]!.v)
      const updates: CellUpdate[] = []
      for (let c = from.c2 + 1; c <= to.c2; c++) {
        const src = getCell(next, from.r1 + i, c)
        updates.push({ r: from.r1 + i, c, cell: { ...src, v: last + step * (c - from.c2) } })
      }
      next = setCells(next, updates)
    }
  }
  return next
}

function numberStep(series: (Cell | undefined)[]): number | null {
  if (series.some((c) => !c || c.f !== undefined || typeof c.v !== 'number')) return null
  const values = series.map((c) => c!.v as number)
  const step = values[1] - values[0]
  return values.every((v, i) => i === 0 || Math.abs(v - values[i - 1] - step) < 1e-9) ? step : null
}

// ---------------------------------------------------------------------------
// Clean-up tools for uploaded tables
// ---------------------------------------------------------------------------
const rowEmpty = (sheet: Sheet, r: number) =>
  sheet.cols.every((_, c) => isEmptyCell(getCell(sheet, r, c)))
const colEmpty = (sheet: Sheet, c: number) =>
  sheet.rows.every((_, r) => isEmptyCell(getCell(sheet, r, c)))

export function removeEmptyRows(sheet: Sheet, name: string): { sheet: Sheet; removed: number } {
  let next = sheet
  let removed = 0
  for (let r = next.rows.length - 1; r >= 0; r--) {
    if (next.rows.length <= 1) break
    if (rowEmpty(next, r) && !next.merges.some((m) => r >= m.r && r < m.r + m.rs)) {
      next = deleteRows(next, r, 1, name)
      removed++
    }
  }
  return { sheet: next, removed }
}

export function removeEmptyCols(sheet: Sheet, name: string): { sheet: Sheet; removed: number } {
  let next = sheet
  let removed = 0
  for (let c = next.cols.length - 1; c >= 0; c--) {
    if (next.cols.length <= 1) break
    if (colEmpty(next, c) && !next.merges.some((m) => c >= m.c && c < m.c + m.cs)) {
      next = deleteCols(next, c, 1, name)
      removed++
    }
  }
  return { sheet: next, removed }
}

/** Trims spaces in text cells within the range. */
export function trimText(sheet: Sheet, range: Range): Sheet {
  return mapCells(sheet, range, (cell) =>
    typeof cell.v === 'string' && cell.f === undefined
      ? { ...cell, v: cell.v.replace(/\s+/g, ' ').trim() }
      : cell,
  )
}

/** Turns numbers stored as text, such as "1,234.50" or "₱ 500", into numbers. */
export function textToNumbers(sheet: Sheet, range: Range): Sheet {
  return mapCells(sheet, range, (cell) => {
    if (typeof cell.v !== 'string' || cell.f !== undefined || cell.s?.fmt === 'text') return cell
    const parsed = parseInput(cell.v)
    if (typeof parsed.v !== 'number') return cell
    const s = { ...(cell.s ?? {}) }
    if (parsed.fmt && !s.fmt) s.fmt = parsed.fmt
    return { ...cell, v: parsed.v, s }
  })
}

/** Replaces formulas with their current results. */
export function formulasToValues(
  sheet: Sheet,
  range: Range,
  value: (r: number, c: number) => Scalar,
): Sheet {
  const updates: CellUpdate[] = []
  for (let r = range.r1; r <= range.r2; r++)
    for (let c = range.c1; c <= range.c2; c++) {
      const cell = getCell(sheet, r, c)
      if (cell?.f === undefined) continue
      const v = value(r, c)
      updates.push({ r, c, cell: { v: isError(v) ? v.code : v, s: cell.s } })
    }
  return setCells(sheet, updates)
}

function mapCells(sheet: Sheet, range: Range, fn: (cell: Cell) => Cell): Sheet {
  const cells = { ...sheet.cells }
  for (let r = range.r1; r <= Math.min(range.r2, sheet.rows.length - 1); r++)
    for (let c = range.c1; c <= Math.min(range.c2, sheet.cols.length - 1); c++) {
      const key = cellKey(sheet, r, c)!
      if (cells[key]) cells[key] = fn(cells[key])
    }
  return { ...sheet, cells }
}

/** Sorts the rows of a range by one column; blanks go last. */
export function sortRows(
  sheet: Sheet,
  range: Range,
  byCol: number,
  descending: boolean,
  value: (r: number, c: number) => Scalar,
): Sheet {
  const order = Array.from({ length: range.r2 - range.r1 + 1 }, (_, i) => range.r1 + i)
  const key = (r: number) => {
    const v = value(r, byCol)
    return v === null || v === '' || isError(v) ? null : v
  }
  order.sort((a, b) => {
    const x = key(a)
    const y = key(b)
    if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1
    const cmp =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' })
    return descending ? -cmp : cmp
  })
  const rows = [...sheet.rows]
  const moved = order.map((r) => sheet.rows[r])
  rows.splice(range.r1, moved.length, ...moved)
  // Rows keep their cells (keyed by row id); only their positions change.
  return { ...sheet, rows }
}

// ---------------------------------------------------------------------------
// Evaluating a workbook of sheets
// ---------------------------------------------------------------------------
export interface Workbook {
  /** Sheet name (as used in formulas) to sheet. */
  sheets: Map<string, Sheet>
}

export interface Evaluator {
  value(sheetName: string, r: number, c: number): Scalar
}

/** Computes formulas on demand, remembering results until the workbook changes. */
export function createEvaluator(workbook: Workbook): Evaluator {
  const byLower = new Map(
    [...workbook.sheets].map(([name, s]) => [name.toLowerCase(), { name, s }]),
  )
  const memo = new Map<string, Scalar>()
  const active = new Set<string>()

  const value = (sheetName: string, r: number, c: number): Scalar => {
    const entry = byLower.get(sheetName.toLowerCase())
    if (!entry) return new SheetError('#REF!')
    const cell = getCell(entry.s, r, c)
    if (!cell) return null
    if (cell.f === undefined) return cell.v ?? null
    const id = `${entry.name}!${r},${c}`
    const known = memo.get(id)
    if (known !== undefined) return known
    if (active.has(id)) return new SheetError('#CIRC!')
    active.add(id)
    const result = evaluate(cell.f, {
      cell: (sheet, rr, cc) => value(sheet ?? entry.name, rr, cc),
      size: (sheet) => {
        const target = sheet ? byLower.get(sheet.toLowerCase())?.s : entry.s
        return target ? { rows: target.rows.length, cols: target.cols.length } : null
      },
    })
    active.delete(id)
    memo.set(id, result)
    return result
  }
  return { value }
}

/** Numbers in a range, for card values and the status bar. */
export function numbersIn(ev: Evaluator, sheetName: string, range: Range) {
  const out: number[] = []
  let count = 0
  let first: Scalar = null
  for (let r = range.r1; r <= range.r2; r++)
    for (let c = range.c1; c <= range.c2; c++) {
      const v = ev.value(sheetName, r, c)
      if (r === range.r1 && c === range.c1) first = v
      if (v !== null && v !== '') count++
      if (typeof v === 'number') out.push(v)
    }
  return { numbers: out, count, first }
}

export type Aggregate = 'sum' | 'average' | 'count' | 'min' | 'max' | 'value'

export function aggregate(ev: Evaluator, sheetName: string, range: Range, agg: Aggregate): Scalar {
  const { numbers, count, first } = numbersIn(ev, sheetName, range)
  switch (agg) {
    case 'sum':
      return numbers.reduce((a, b) => a + b, 0)
    case 'average':
      return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null
    case 'count':
      return count
    case 'min':
      return numbers.length ? Math.min(...numbers) : null
    case 'max':
      return numbers.length ? Math.max(...numbers) : null
    case 'value':
      return first
  }
}

/** Header text of a column (the first text in the frozen or first rows), for labels. */
export function columnHeader(sheet: Sheet, c: number) {
  const rows = Math.max(1, sheet.freeze.rows)
  for (let r = rows - 1; r >= 0; r--) {
    const v = getCell(sheet, r, c)?.v
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return colName(c)
}

/** Dropdown choices of a column, if it has any. */
export const listFor = (sheet: Sheet, c: number) => {
  const id = sheet.cols[c]?.id
  const list = id ? sheet.lists?.[id] : undefined
  return list && list.length ? list : null
}

export function setList(sheet: Sheet, cols: number[], options: string[] | null): Sheet {
  const lists = { ...(sheet.lists ?? {}) }
  for (const c of cols) {
    const id = sheet.cols[c]?.id
    if (!id) continue
    if (options && options.length) lists[id] = options
    else delete lists[id]
  }
  return { ...sheet, lists }
}
