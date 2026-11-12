// Pure helpers for importing spreadsheets: finding the header, mapping columns,
// reading rows and checking them. No React or network here, so it is unit-tested.

export type ImportTarget =
  'WFP' | 'PPMP' | 'APP' | 'allotments' | 'obligations' | 'disbursements' | 'activities'

export type FieldType = 'text' | 'number' | 'date' | 'select'

export interface ImportField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  aliases?: string[]
  /** For selects: which list of choices to match against. */
  options?: string
  width?: number
  /** Must be unique; 'error' blocks saving, 'warn' only flags the row. */
  unique?: 'error' | 'warn'
}

export interface TemplateColumn {
  /** A field key from the target, or "custom:<name>" for an extra column. */
  field: string
  label: string
  /** Spreadsheet column letter. */
  source: string
  /** e.g. 1000 for amounts written in thousands. */
  multiplier?: number
  /** A blank cell repeats the value above it. */
  fillDown?: boolean
  /** Rows with this cell blank (or zero, for numbers) are skipped. */
  mustHave?: boolean
  /** Used when the cell is blank or doesn't match a list value. */
  fallback?: string
  /** With mustHave: a number in this column also counts as blank. */
  notNumber?: boolean
  /** Amounts on skipped detail rows are added to the line item they belong to. */
  rollUp?: boolean
  /** Letter of a checkbox column; the value only counts on rows where it is ticked. */
  whenTrue?: string
}

export interface ImportTemplate {
  id?: string
  target: ImportTarget
  name: string
  header_row: number
  data_row: number
  columns: TemplateColumn[]
  source_url?: string | null
  created_by?: string | null
  builtIn?: boolean
  /** Which tab to open first, for built-in formats. */
  tabHint?: RegExp
  /** Opens the tab with a matching header cell, when no tab name matches. */
  tabHeader?: RegExp
}

export interface SheetTab {
  name: string
  hidden: boolean
  rows: unknown[][]
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[]
}

export interface SelectOption {
  value: string
  label: string
  /** Texts that identify this choice (code, name, abbreviation…). */
  keys: string[]
}

export type OptionLists = Record<string, SelectOption[]>
export type ImportCell = string | number | null

export type ImportRow = Record<string, unknown> & {
  _key: string
  /** Spreadsheet row number, when the row came from a sheet. */
  _row?: number
  /** Text from the sheet, kept so unmatched list values can be reported. */
  _raw: Record<string, string>
}

// ---------------------------------------------------------------------------
// Columns and headers
// ---------------------------------------------------------------------------
export function columnLetter(index: number) {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

export function columnIndex(letter: string) {
  return (
    letter
      .toUpperCase()
      .split('')
      .reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0) - 1
  )
}

const isBlank = (v: unknown) => v === null || v === undefined || String(v).trim() === ''
const text = (v: unknown) => (isBlank(v) ? '' : String(v).replace(/\s+/g, ' ').trim())

/** Lower-case words without punctuation or plural endings, for forgiving comparisons. */
export function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length > 3 ? w.replace(/s$/, '') : w))
    .join(' ')
}

const textCells = (row: unknown[] = []) =>
  row.filter((c) => typeof c === 'string' && c.trim() !== '').length

/** Finds where the header starts and where the data begins (1-based rows). */
export function detectLayout(tab: SheetTab) {
  const scan = tab.rows.slice(0, 30)
  let best = 0
  scan.forEach((row, i) => {
    if (textCells(row) > textCells(scan[best])) best = i
  })
  // Headers often span rows; walk up, allowing one blank row inside the block.
  let first = best
  for (let i = best - 1; i >= 0; i--) {
    const cells = textCells(scan[i])
    if (cells >= 2) first = i
    else if (cells !== 0 || i !== first - 1) break
  }
  let data = best + 1
  while (data < tab.rows.length && !tab.rows[data]?.some((c) => !isBlank(c))) data++
  return { header_row: first + 1, data_row: Math.max(data + 1, best + 2) }
}

/** Header text per column letter, combining header rows and repeating merged cells. */
export function columnLabels(tab: SheetTab, headerRow: number, dataRow: number) {
  const from = headerRow - 1
  const to = dataRow - 2
  const cell = (r: number, c: number) => {
    const merge = tab.merges.find((m) => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c)
    return text(merge ? tab.rows[merge.s.r]?.[merge.s.c] : tab.rows[r]?.[c])
  }
  const width = tab.rows.reduce((w, row) => Math.max(w, row?.length ?? 0), 0)
  const out: { letter: string; label: string }[] = []
  for (let c = 0; c < width; c++) {
    const parts: string[] = []
    for (let r = from; r <= to; r++) {
      const v = cell(r, c)
      if (v && parts[parts.length - 1] !== v) parts.push(v)
    }
    out.push({ letter: columnLetter(c), label: parts.join(' › ') })
  }
  return out
}

/** Builds a mapping by comparing the sheet's headers with each field's name and aliases. */
export function autoMapColumns(
  fields: ImportField[],
  labels: { letter: string; label: string }[],
): TemplateColumn[] {
  const named = labels
    .filter((l) => l.label)
    .map((l) => ({
      letter: l.letter,
      full: normalize(l.label),
      last: normalize(l.label.split(' › ').pop()!),
    }))
  const taken = new Set<string>()
  const out: TemplateColumn[] = []
  for (const f of fields) {
    const wanted = [
      f.label.replace(/\s*\*$/, ''),
      f.key.replace(/_id$/, '').replace(/_/g, ' '),
      ...(f.aliases ?? []),
    ].map(normalize)
    const hit =
      named.find((n) => !taken.has(n.letter) && wanted.includes(n.full)) ??
      named.find((n) => !taken.has(n.letter) && wanted.includes(n.last))
    if (!hit) continue
    taken.add(hit.letter)
    out.push({
      field: f.key,
      label: f.label,
      source: hit.letter,
      mustHave: f.required || undefined,
    })
  }
  return out
}

/** A template in PAYEW's own flat layout: one column per field, header in row 1. */
export function standardTemplate(target: ImportTarget, fields: ImportField[]): ImportTemplate {
  return {
    target,
    name: 'PAYEW standard',
    header_row: 1,
    data_row: 2,
    builtIn: true,
    columns: fields.map((f, i) => ({
      field: f.key,
      label: f.label,
      source: columnLetter(i),
      mustHave: f.required || undefined,
    })),
  }
}

/**
 * Applies a template to a tab. If the tab has the template's headers in a flat
 * layout (a downloaded template), columns are found by name instead of position.
 */
export function fitTemplate(template: ImportTemplate, tab: SheetTab): ImportTemplate {
  const header = tab.rows[0] ?? []
  const positions = new Map(header.map((h, i) => [normalize(text(h)), i]))
  const found = template.columns.filter((c) => positions.has(normalize(c.label)))
  if (found.length < Math.ceil(template.columns.length * 0.6)) return template
  return {
    ...template,
    header_row: 1,
    data_row: 2,
    columns: found.map((c) => ({ ...c, source: columnLetter(positions.get(normalize(c.label))!) })),
  }
}

// ---------------------------------------------------------------------------
// Reading values
// ---------------------------------------------------------------------------
export function parseNumber(v: unknown): number | null | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const raw = text(v).replace(/[₱$,\s]/g, '')
  if (raw === '' || raw === '-') return null
  const negative = /^\(.*\)$/.test(raw)
  const n = Number(negative ? raw.slice(1, -1) : raw)
  if (!Number.isFinite(n)) return undefined
  return negative ? -n : n
}

/** Returns YYYY-MM-DD, null for a blank, or undefined when it isn't a date. */
export function parseDate(v: unknown): string | null | undefined {
  const iso = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d))
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
      return undefined
    return date.toISOString().slice(0, 10)
  }
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return undefined
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10)
  }
  const s = text(v)
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) return iso(+m[3], +m[1], +m[2])
  m = s.match(/^([a-z]{3,9})\.? (\d{1,2}),? (\d{4})$/i)
  if (m) {
    const month = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[1].slice(0, 3).toLowerCase())
    if (month >= 0 && month % 3 === 0) return iso(+m[3], month / 3 + 1, +m[2])
  }
  return undefined
}

/** Finds a list choice by exact name, or by a leading code such as "CO: Other Structure". */
export function matchOption(value: string, options: SelectOption[] = []) {
  const wanted = normalize(value)
  if (!wanted) return undefined
  const exact = options.find(
    (o) => o.value === value || o.keys.some((k) => normalize(k) === wanted),
  )
  if (exact) return exact
  return options.find((o) =>
    o.keys.some((k) => {
      const key = normalize(k)
      return key.length >= 2 && wanted.startsWith(`${key} `)
    }),
  )
}

const SIGNATORY =
  /^(prepared|reviewed|noted|certified|submitted)\s+by\b|^approved(\s+by)?\s*:?$|^recommending approval\s*:?$/i
const TOTAL_ROW = /^(grand\s+|sub-?\s*)?total\b/i

const fieldOf = (fields: ImportField[], key: string) => fields.find((f) => f.key === key)
const isTicked = (v: unknown) => v === true || text(v).toLowerCase() === 'true'

/** Reads a tab through a template. Signature blocks, totals and filtered rows are left out. */
export function extractRows(
  tab: SheetTab,
  template: ImportTemplate,
  fields: ImportField[],
  options: OptionLists,
): ImportRow[] {
  const out: ImportRow[] = []
  const carried = new Map<string, unknown>()
  // Amounts from a heading row wait here for the first line item beneath it.
  const pending = new Map<string, number>()
  const headingColumn = template.columns.find((c) => c.fillDown)
  const scaled = (col: TemplateColumn, value: unknown) =>
    (parseNumber(value) ?? 0) * (col.multiplier ?? 1)
  const addTo = (row: ImportRow, col: TemplateColumn, amount: number) => {
    const total = Number(row[col.field] ?? 0) + amount
    row[col.field] = Math.round(total * 100) / 100
  }

  tab.rows.slice(template.data_row - 1).forEach((row, i) => {
    if (!row?.some((c) => !isBlank(c))) return
    const cells = template.columns.map((col) => {
      let value = row[columnIndex(col.source)]
      if (col.fillDown) {
        if (isBlank(value)) value = carried.get(col.field)
        else carried.set(col.field, value)
      }
      if (col.whenTrue && !isTicked(row[columnIndex(col.whenTrue)])) value = null
      return { col, value }
    })
    const firstText = text(row.find((c) => typeof c === 'string' && c.trim() !== ''))
    const excluded =
      row.some((c) => typeof c === 'string' && SIGNATORY.test(c.trim())) ||
      TOTAL_ROW.test(firstText)
    const skip =
      excluded ||
      cells.some(({ col, value }) => {
        if (!col.mustHave) return false
        if (fieldOf(fields, col.field)?.type === 'number') return !parseNumber(value)
        return isBlank(value) || (!!col.notNumber && typeof value === 'number')
      })
    if (skip) {
      const heading = !!headingColumn && !isBlank(row[columnIndex(headingColumn.source)])
      const last = out[out.length - 1]
      for (const { col, value } of cells) {
        const amount = col.rollUp ? scaled(col, value) : 0
        if (!amount) continue
        if (last && !heading) addTo(last, col, amount)
        else pending.set(col.field, (pending.get(col.field) ?? 0) + amount)
      }
      return
    }

    const parsed: ImportRow = { _key: crypto.randomUUID(), _row: i + template.data_row, _raw: {} }
    for (const { col, value } of cells) {
      const field = fieldOf(fields, col.field)
      if (field?.type === 'number') {
        const n = parseNumber(value)
        if (n === undefined) parsed._raw[col.field] = text(value)
        const amount = n === null || n === undefined ? null : n * (col.multiplier ?? 1)
        parsed[col.field] = amount === null ? null : Math.round(amount * 100) / 100
      } else if (field?.type === 'date') {
        const d = parseDate(value)
        if (d === undefined) parsed._raw[col.field] = text(value)
        parsed[col.field] = d ?? null
      } else if (field?.type === 'select') {
        const source = text(value)
        const hit =
          matchOption(source, options[field.options ?? '']) ??
          (col.fallback ? matchOption(col.fallback, options[field.options ?? '']) : undefined)
        if (source && !hit) parsed._raw[col.field] = source
        parsed[col.field] = hit?.value ?? null
      } else {
        parsed[col.field] = text(value) || null
      }
    }
    for (const col of template.columns) {
      const amount = pending.get(col.field)
      if (amount) addTo(parsed, col, amount)
    }
    pending.clear()
    out.push(parsed)
  })
  return out
}

// ---------------------------------------------------------------------------
// Checking rows
// ---------------------------------------------------------------------------
export interface RowCheck {
  errors: string[]
  warnings: string[]
}

const label = (f: ImportField) => f.label.replace(/\s*\*$/, '')

/** Validates rows; `existing` holds values already in PAYEW, per unique field. */
export function checkRows(
  rows: ImportRow[],
  fields: ImportField[],
  existing: Record<string, Set<string>> = {},
): RowCheck[] {
  const seen = new Map<string, number>()
  return rows.map((row, index) => {
    const errors: string[] = []
    const warnings: string[] = []
    for (const f of fields) {
      const value = row[f.key]
      const raw = row._raw[f.key]
      const empty = isBlank(value)
      if (f.required && empty) {
        errors.push(raw ? `${label(f)}: "${raw}" was not recognized` : `${label(f)} is required`)
      } else if (empty && raw) {
        warnings.push(`${label(f)}: "${raw}" was not recognized and is blank`)
      }
      if (f.type === 'date' && !empty && parseDate(value) === undefined) {
        errors.push(`${label(f)} is not a valid date`)
      }
      if (f.unique && !empty) {
        const key = `${f.key}|${normalize(String(value))}`
        const report = f.unique === 'error' ? errors : warnings
        if (seen.has(key)) report.push(`${label(f)} repeats row ${seen.get(key)! + 1}`)
        else seen.set(key, index)
        if (existing[f.key]?.has(normalize(String(value)))) {
          report.push(`${label(f)} "${String(value)}" already exists in PAYEW`)
        }
      }
    }
    return { errors, warnings }
  })
}

/** Field values for saving; extra columns are written into the notes field as "Label: value". */
export function rowToPayload(
  row: ImportRow,
  fields: ImportField[],
  columns: TemplateColumn[],
  notesField: string,
  notesLimit = 1000,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const value = row[f.key]
    if (isBlank(value)) continue
    out[f.key] = f.type === 'date' ? parseDate(value) : value
  }
  const extras = columns
    .filter((c) => c.field.startsWith('custom:') && !isBlank(row[c.field]))
    .map((c) => `${c.label}: ${text(row[c.field])}`)
  if (extras.length) {
    const notes = [text(out[notesField]), ...extras].filter(Boolean).join(' · ')
    out[notesField] = notes.slice(0, notesLimit)
  }
  return out
}
