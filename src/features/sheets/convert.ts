// Converts an AWFP sheet that keeps phases, activities and sub-activities in one
// column (the original DA-CAR form) into the PAYEW WFP template, which gives each
// level its own column. Subtotals are dropped: the template adds them up itself.
import { isError, type Scalar } from './formula'
import { setCells, type CellUpdate, type ColumnRole, type Evaluator, type Sheet } from './model'
import { matchActivity } from './match'
import { WFP_STATUSES, wfpTemplate } from './templates'
import { headerLabels, headerRowCount, resolveRoles } from './wfp'

const text = (v: Scalar) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const num = (v: Scalar) => (typeof v === 'number' && !isError(v) ? v : null)
const SIGNATORIES = /^(prepared|reviewed|noted|certified|submitted)\s+by\b|^recommending approval/i
const PHASE_WORD = /^(phase\b|pmo\b|lfp\b|program management|cross-?cutting)/i
/** "2.1.4.1." → 4 levels; plain text has none. */
const depth = (s: string) => {
  const m = /^(\d+(?:\.\d+)+)\.?\s|^(\d+)\.\s/.exec(s)
  return m ? (m[1] ?? m[2]).split('.').length : 0
}
const isLetterItem = (s: string) => /^[a-z]\.\s/i.test(s)

/** True for a one-column AWFP sheet that can be converted. */
export function canConvertAwfp(sheet: Sheet) {
  const roles = resolveRoles(sheet)
  return (
    roles.phase === undefined &&
    roles.pap !== undefined &&
    roles.unit !== undefined &&
    roles.object !== undefined &&
    roles.budget !== undefined
  )
}

/** Turns a status sentence ("Obligated, PO under processing…") into a dropdown choice. */
export function statusChoice(raw: string): string | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  const hit = WFP_STATUSES.find((x) => s.startsWith(x.toLowerCase()))
  if (hit) return hit
  if (/accomplish|completed|conducted on|done/.test(s)) return 'Accomplished'
  if (/obligat/.test(s)) return 'Obligated'
  if (/procure|bidding|canvass|pr\b/.test(s)) return 'For procurement'
  if (/cancel/.test(s)) return 'Cancelled'
  if (/to be|scheduled|for conduct/.test(s)) return 'To be conducted'
  return 'Ongoing'
}

export interface BedRow {
  id: string
  title: string
  /** Twelve monthly targets, or null when the tab has no month columns. */
  months: number[] | null
  status: string | null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * Reads a BED 2 style tab (monthly physical targets, or the accomplishment version
 * with a STATUS column): one entry per row that has a title and a unit of measure.
 */
export function readBed(sheet: Sheet, name: string, ev: Evaluator): BedRow[] {
  const header = Math.min(sheet.rows.length, 15)
  const find = (test: RegExp) => {
    for (let r = 0; r < header; r++)
      for (let c = 0; c < sheet.cols.length; c++)
        if (test.test(text(ev.value(name, r, c)))) return { r, c }
    return null
  }
  const unit = find(/^unit of measure$|^unit$/i)
  if (!unit) return []
  let monthsRow = -1
  const monthCols = MONTHS.map((m) => {
    for (let r = 0; r < header; r++)
      for (let c = 0; c < sheet.cols.length; c++)
        if (text(ev.value(name, r, c)).toLowerCase() === m) {
          monthsRow = Math.max(monthsRow, r)
          return c
        }
    return -1
  })
  const statusCol = find(/^status$/i)?.c ?? -1
  const titleCol = Math.max(0, unit.c - 1)
  const start = Math.max(unit.r, monthsRow) + 1
  const out: BedRow[] = []
  for (let r = start; r < sheet.rows.length; r++) {
    const title = text(ev.value(name, r, titleCol))
    if (SIGNATORIES.test(title)) break
    if (title.length < 3 || !text(ev.value(name, r, unit.c))) continue
    out.push({
      id: String(r),
      title,
      months: monthCols.every((c) => c >= 0)
        ? monthCols.map((c) => num(ev.value(name, r, c)) ?? 0)
        : null,
      status: statusCol >= 0 ? text(ev.value(name, r, statusCol)) || null : null,
    })
  }
  return out
}

export interface ConvertOptions {
  /** Monthly targets (BED 2) and statuses (accomplishment tab), matched by title. */
  targets?: BedRow[]
  statuses?: BedRow[]
}

export function convertAwfp(
  source: Sheet,
  name: string,
  ev: Evaluator,
  opts: ConvertOptions = {},
): Sheet {
  const roles = resolveRoles(source)
  const at = (r: number, role: ColumnRole) =>
    roles[role] === undefined ? null : ev.value(name, r, roles[role]!)
  // Data starts under the header row that names the unit column, so the program and
  // phase rows right under it are kept.
  let start = headerRowCount(source)
  if (roles.unit !== undefined) {
    for (let r = 0; r < Math.min(start, 20); r++) {
      if (/unit/i.test(text(ev.value(name, r, roles.unit)))) start = r + 1
    }
  }
  let stop = source.rows.length
  for (let r = start; r < source.rows.length && stop === source.rows.length; r++) {
    if (source.cols.some((_, c) => SIGNATORIES.test(text(ev.value(name, r, c))))) stop = r
  }

  const labels = headerLabels(source)
  const poCol = labels.findIndex((l) => /\bpo\b|po #|po no/.test(l))
  const supplierCol = labels.findIndex((l) => /supplier|payee/.test(l))
  const particularsCol = labels.findIndex((l) => /particular/.test(l) && !/program|activit/.test(l))

  type Out = Partial<Record<'phase' | 'pap' | 'sub', string>> & {
    unit?: string
    target?: number | null
    object?: string
    budget?: number | null
    forObligation?: number | null
    obligated?: number | null
    po?: string
    supplier?: string
    particulars?: string
    forDisbursement?: number | null
    paid?: boolean
    status?: string | null
    remarks?: string
    months?: number[] | null
  }
  const rows: Out[] = []
  let activityDepth = -1
  let inActivity = false
  let letterActivity = false

  for (let r = start; r < stop; r++) {
    const pap = text(at(r, 'pap'))
    const unit = text(at(r, 'unit'))
    const object = text(at(r, 'object'))
    const money = {
      object: object || undefined,
      budget: object ? num(at(r, 'budget')) : null,
      forObligation: num(at(r, 'for_obligation')),
      obligated: num(at(r, 'obligated')),
      forDisbursement: num(at(r, 'for_disbursement')),
      paid: at(r, 'paid') === true,
      remarks: text(at(r, 'remarks')) || undefined,
    }
    const out: Out = { ...money }
    const extra = (c: number) => (c < 0 ? '' : text(ev.value(name, r, c)))
    out.po = extra(poCol) || undefined
    out.supplier = extra(supplierCol) || undefined
    out.particulars = extra(particularsCol) || undefined
    const empty =
      !pap &&
      !object &&
      Object.values(money).every((v) => v === null || v === undefined || v === false)
    if (empty && !out.supplier && !out.particulars) continue

    if (pap && unit) {
      // An activity.
      out.pap = pap
      out.unit = unit
      out.target = num(at(r, 'target'))
      const status = opts.statuses ? matchActivity(pap, opts.statuses)?.status : null
      out.status = status ? statusChoice(status) : null
      out.months = opts.targets ? matchActivity(pap, opts.targets)?.months : null
      if (status && out.status !== status)
        out.remarks = [out.remarks, status].filter(Boolean).join(' · ')
      activityDepth = depth(pap)
      letterActivity = isLetterItem(pap)
      inActivity = true
    } else if (pap) {
      const d = depth(pap)
      const subtotal = !object && num(at(r, 'budget')) !== null
      if (PHASE_WORD.test(pap) || (subtotal && !inActivity)) {
        out.phase = pap
        inActivity = false
        // A phase heading carries subtotals only.
        Object.assign(out, {
          budget: null,
          forObligation: null,
          obligated: null,
          forDisbursement: null,
        })
      } else if (
        inActivity &&
        ((d > 0 && activityDepth > 0 && d > activityDepth) || (d === 0 && !isLetterItem(pap)))
      ) {
        out.sub = pap
      } else if (inActivity && letterActivity && isLetterItem(pap)) {
        // A sibling item without a unit, e.g. "f. Benchmarking"; it needs a unit to count.
        out.pap = pap
      } else {
        // A heading between phase and activity, e.g. "2.1. No. of AMIA villages…".
        out.pap = pap
        inActivity = false
        Object.assign(out, {
          budget: null,
          forObligation: null,
          obligated: null,
          forDisbursement: null,
        })
      }
    }
    rows.push(out)
  }

  // Signature names and titles at the bottom carry no figures: drop trailing rows like that.
  const hasFigures = (o: Out) =>
    !!o.object ||
    [o.budget, o.forObligation, o.obligated, o.forDisbursement, o.target].some(
      (v) => typeof v === 'number',
    )
  while (rows.length && !hasFigures(rows[rows.length - 1])) rows.pop()

  const sheet = wfpTemplate(Math.max(40, rows.length + 20))
  const first = 3
  const updates: CellUpdate[] = []
  rows.forEach((o, i) => {
    const r = first + i
    const put = (c: number, v: string | number | boolean | null | undefined) => {
      if (v !== undefined && v !== null && v !== '') updates.push({ r, c, cell: { v } })
    }
    put(0, o.phase)
    put(1, o.pap)
    put(2, o.sub)
    put(3, o.unit)
    put(4, o.target)
    put(5, o.object)
    put(6, o.budget)
    put(7, o.forObligation)
    put(8, o.obligated)
    put(10, o.po)
    put(11, o.supplier)
    put(12, o.particulars)
    put(13, o.forDisbursement)
    if (o.paid) updates.push({ r, c: 14, cell: { v: true } })
    put(16, o.status)
    put(17, o.remarks)
  })
  // setCells keeps each column's formats from the template.
  const physical: Record<string, number[]> = {}
  rows.forEach((o, i) => {
    if (o.months && o.months.some((v) => v > 0)) physical[sheet.rows[first + i].id] = o.months
  })
  return { ...setCells(sheet, updates), ...(Object.keys(physical).length ? { physical } : {}) }
}
