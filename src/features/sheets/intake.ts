// Deciding whether an uploaded tab can become a finance sheet, and building the
// sheet. An upload must have the template's columns (in any order, anywhere near
// the top). Its rows are then copied into a fresh template, so every sheet keeps
// the template's formulas, formats and dropdowns. For the WFP, the DA-CAR AWFP form
// is also accepted and converted.
import { canConvertAwfp, convertAwfp, statusChoice, type BedRow } from './convert'
import { isError, type Scalar } from './formula'
import { matchActivity } from './match'
import {
  createEvaluator,
  getCell,
  mergeAt,
  setCells,
  type CellUpdate,
  type Evaluator,
  type Sheet,
  type SheetKind,
} from './model'
import { sheetFromTemplate, templateDataStart, templateHeaders } from './templates'
import { resolveRoles, wfpActivities } from './wfp'

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const text = (v: Scalar) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const TOTAL = /^\s*(grand\s+|sub-?\s*)?total\b/i
const SIGNATORIES = /^(prepared|reviewed|noted|certified|submitted)\s+by\b|^recommending approval/i

export type UploadCheck =
  | { kind: 'template'; headerRow: number; columns: number[] }
  | { kind: 'awfp' }
  | { kind: 'mismatch'; missing: string[]; found: number }

/** Finds the template's header row in an uploaded tab. */
export function checkUpload(
  kind: SheetKind,
  sheet: Sheet,
  name: string,
  ev: Evaluator,
): UploadCheck {
  const headers = templateHeaders(kind)
  const wanted = headers.map(norm)
  let best: { row: number; columns: number[]; found: number } = { row: -1, columns: [], found: 0 }
  const limit = Math.min(sheet.rows.length, 30)
  for (let r = 0; r < limit; r++) {
    // A column's label is the cell in this row, or the merged cell that reaches it.
    const labels = sheet.cols.map((_, c) => {
      const m = mergeAt(sheet, r, c)
      const own = text(ev.value(name, m ? m.r : r, m ? m.c : c))
      return norm(m && m.c !== c ? '' : own)
    })
    const columns = wanted.map((w) => labels.indexOf(w))
    const found = columns.filter((c) => c >= 0).length
    if (found > best.found) best = { row: r, columns, found }
  }
  if (best.found === headers.length) {
    return { kind: 'template', headerRow: best.row, columns: best.columns }
  }
  if (kind === 'WFP' && canConvertAwfp(sheet)) return { kind: 'awfp' }
  return {
    kind: 'mismatch',
    found: best.found,
    missing: headers.filter((_, i) => (best.columns[i] ?? -1) < 0),
  }
}

/** Copies the rows of a matching upload into a fresh template. */
export function fillTemplate(
  kind: SheetKind,
  source: Sheet,
  name: string,
  ev: Evaluator,
  check: Extract<UploadCheck, { kind: 'template' }>,
): Sheet {
  const rows: number[] = []
  for (let r = check.headerRow + 1; r < source.rows.length; r++) {
    const values = check.columns.map((c) => ev.value(name, r, c))
    if (values.some((v) => SIGNATORIES.test(text(v)))) break
    const first = values.find((v) => text(v) !== '')
    if (typeof first === 'string' && TOTAL.test(first)) continue
    if (values.every((v) => v === null || v === '' || v === false)) continue
    rows.push(r)
  }
  const sheet = sheetFromTemplate(kind, rows.length + 20)
  const start = templateDataStart(kind)
  const updates: CellUpdate[] = []
  rows.forEach((r, i) => {
    check.columns.forEach((c, t) => {
      const target = getCell(sheet, start + i, t)
      // Columns the template calculates keep their formula.
      if (target?.f !== undefined) return
      let v = ev.value(name, r, c)
      if (isError(v) || v === null || v === '') return
      if (typeof target?.v === 'boolean') v = v === true || /^(true|yes|✓|x)$/i.test(text(v))
      if (v === false) return
      updates.push({ r: start + i, c: t, cell: { v } })
    })
  })
  return setCells(sheet, updates)
}

/** Adds BED 2 monthly targets, and statuses where the Status cell is empty. */
export function attachBed(sheet: Sheet, targets?: BedRow[], statuses?: BedRow[]): Sheet {
  if (!targets?.length && !statuses?.length) return sheet
  const statusCol = resolveRoles(sheet).status
  const physical: Record<string, number[]> = { ...(sheet.physical ?? {}) }
  const updates: CellUpdate[] = []
  for (const a of wfpActivities(
    sheet,
    'WFP',
    createEvaluator({ sheets: new Map([['WFP', sheet]]) }),
  )) {
    const months = targets ? matchActivity(a.title, targets)?.months : null
    if (months?.some((v) => v > 0) && !physical[a.rowId]) physical[a.rowId] = months
    const status = statuses ? matchActivity(a.title, statuses)?.status : null
    const choice = status ? statusChoice(status) : null
    if (choice && !a.status && statusCol !== undefined)
      updates.push({ r: a.row, c: statusCol, cell: { v: choice } })
  }
  return { ...setCells(sheet, updates), ...(Object.keys(physical).length ? { physical } : {}) }
}

/** The sheet an accepted upload becomes. */
export function buildFromUpload(
  kind: SheetKind,
  source: Sheet,
  name: string,
  ev: Evaluator,
  check: Exclude<UploadCheck, { kind: 'mismatch' }>,
  bed: { targets?: BedRow[]; statuses?: BedRow[] } = {},
): Sheet {
  if (check.kind === 'awfp') return convertAwfp(source, name, ev, bed)
  const sheet = fillTemplate(kind, source, name, ev, check)
  if (kind !== 'WFP') return sheet
  return attachBed(sheet, bed.targets, bed.statuses)
}
