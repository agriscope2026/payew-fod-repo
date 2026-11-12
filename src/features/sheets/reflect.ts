// The WFP is the main place to type. Its rows are reflected into the other sheets
// they belong to: purchase orders into the ORS register, payments into the DV
// register, budget lines into the PPMP and activities into the APP. Reflected rows
// stay linked to their WFP row, so later WFP edits update them; the other columns
// of those rows (ORS No., dates, mode…) are filled in on the sheet itself.
import { isError, moveFormula, type Scalar } from './formula'
import { checkUpload } from './intake'
import {
  createEvaluator,
  deleteRows,
  getCell,
  insertRows,
  setCells,
  SHEET_NAME,
  type CellUpdate,
  type ColumnRole,
  type Evaluator,
  type Sheet,
} from './model'
import { templateHeaders } from './templates'
import { headerLabels, resolveRoles, wfpActivities } from './wfp'

const text = (v: Scalar) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const num = (v: Scalar) => (typeof v === 'number' && !isError(v) ? v : 0)
const TOTAL = /^\s*(grand\s+|sub-?\s*)?total\b/i

export const REFLECT_KINDS = ['obligations', 'disbursements', 'PPMP', 'APP'] as const
export type ReflectKind = (typeof REFLECT_KINDS)[number]

/** One detail row of a WFP activity. */
export interface WfpLine {
  rowId: string
  activity: string
  activityRowId: string
  /** The object of expenditure this row falls under (carried down from the line item). */
  object: string
  /** Budget, only on the line-item row itself. */
  budget: number
  forObligation: number
  obligated: number
  po: string
  supplier: string
  particulars: string
  forDisbursement: number
  paid: boolean
}

export function wfpLines(sheet: Sheet, name: string, ev: Evaluator): WfpLine[] {
  const roles = resolveRoles(sheet)
  const labels = headerLabels(sheet)
  const find = (test: RegExp, not?: RegExp) =>
    labels.findIndex((l) => test.test(l) && !(not && not.test(l)))
  const poCol = find(/\bpo\b|po no|po #/)
  const supplierCol = find(/supplier|payee/)
  const particularsCol = find(/particular/, /program|activit/)
  const at = (r: number, role: ColumnRole) =>
    roles[role] === undefined ? null : ev.value(name, r, roles[role]!)
  const raw = (r: number, c: number) => (c < 0 ? '' : text(ev.value(name, r, c)))

  const out: WfpLine[] = []
  for (const a of wfpActivities(sheet, name, ev)) {
    let object = ''
    for (let r = a.row; r <= a.lastRow; r++) {
      const own = text(at(r, 'object'))
      if (own) object = own
      out.push({
        rowId: sheet.rows[r].id,
        activity: a.title,
        activityRowId: a.rowId,
        object,
        budget: own ? num(at(r, 'budget')) : 0,
        forObligation: num(at(r, 'for_obligation')),
        obligated: num(at(r, 'obligated')),
        po: raw(r, poCol),
        supplier: raw(r, supplierCol),
        particulars: raw(r, particularsCol),
        forDisbursement: num(at(r, 'for_disbursement')),
        paid: at(r, 'paid') === true,
      })
    }
  }
  return out
}

/** Columns kept in step with the WFP; the rest of a reflected row is typed on the sheet. */
export const OWNED: Record<ReflectKind, string[]> = {
  obligations: ['Payee', 'Particulars', 'Activity', 'Object of expenditure', 'Amount'],
  disbursements: ['Payee', 'Particulars', 'Gross amount'],
  PPMP: ['General description', 'Estimated budget', 'Remarks'],
  APP: ['Procurement project', 'MOOE', 'CO'],
}

export interface ReflectItem {
  /** WFP row id the target row is linked to. */
  key: string
  /** Template header → value. These columns are kept in step with the WFP. */
  values: Record<string, string | number>
}

/** The rows a sheet should have for the WFP as it is now. */
export function reflectItems(kind: ReflectKind, lines: WfpLine[]): ReflectItem[] {
  if (kind === 'obligations') {
    return lines
      .filter((l) => (l.supplier || l.po) && (l.forObligation > 0 || l.obligated > 0))
      .map((l) => ({
        key: l.rowId,
        values: {
          Payee: l.supplier,
          Particulars: [l.particulars, l.po && `PO ${l.po}`].filter(Boolean).join(' · '),
          Activity: l.activity,
          'Object of expenditure': l.object,
          Amount: l.forObligation || l.obligated,
        },
      }))
  }
  if (kind === 'disbursements') {
    return lines
      .filter((l) => l.forDisbursement > 0)
      .map((l) => ({
        key: l.rowId,
        values: {
          Payee: l.supplier,
          Particulars: [l.particulars || l.object, l.activity].filter(Boolean).join(' · '),
          'Gross amount': l.forDisbursement,
        },
      }))
  }
  if (kind === 'PPMP') {
    return lines
      .filter((l) => l.budget > 0)
      .map((l) => ({
        key: l.rowId,
        values: {
          'General description': l.object,
          'Estimated budget': l.budget,
          Remarks: l.activity,
        },
      }))
  }
  // APP: one row per activity, split into capital outlay and the rest.
  const byActivity = new Map<string, { title: string; mooe: number; co: number }>()
  for (const l of lines) {
    if (l.budget <= 0) continue
    const a = byActivity.get(l.activityRowId) ?? { title: l.activity, mooe: 0, co: 0 }
    if (/^co\b|capital outlay/i.test(l.object)) a.co += l.budget
    else a.mooe += l.budget
    byActivity.set(l.activityRowId, a)
  }
  return [...byActivity].map(([key, a]) => ({
    key,
    values: { 'Procurement project': a.title, MOOE: a.mooe, CO: a.co },
  }))
}

export interface ReflectResult {
  sheet: Sheet
  added: number
  updated: number
  removed: number
}

/**
 * Brings a sheet in step with the items: updates linked rows, adds missing ones
 * above the total row, and removes rows whose WFP row is gone (unless someone has
 * filled in other details there). Returns null for a sheet whose layout is no longer
 * the template's, which cannot be filled automatically.
 */
export function reflectInto(
  kind: ReflectKind,
  target: Sheet,
  items: ReflectItem[],
): ReflectResult | null {
  const name = SHEET_NAME[kind]
  const evalOf = (s: Sheet) => createEvaluator({ sheets: new Map([[name, s]]) })
  const check = checkUpload(kind, target, name, evalOf(target))
  if (check.kind !== 'template') return null
  const headers = templateHeaders(kind)
  const colOf = (header: string) => check.columns[headers.indexOf(header)]
  const owned = new Set(OWNED[kind].map(colOf))
  const headerRow = check.headerRow

  let sheet = target
  const links: Record<string, string> = { ...(target.links ?? {}) }
  const rowOf = (key: string) => {
    const id = Object.keys(links).find((rowId) => links[rowId] === key)
    return id ? sheet.rows.findIndex((r) => r.id === id) : -1
  }
  const totalIndex = () => {
    const ev = evalOf(sheet)
    for (let r = headerRow + 1; r < sheet.rows.length; r++) {
      const first = check.columns.map((c) => text(ev.value(name, r, c))).find((t) => t !== '')
      if (first && TOTAL.test(first)) return r
    }
    return sheet.rows.length
  }
  const isFree = (r: number) =>
    !links[sheet.rows[r].id] &&
    check.columns.every((c) => {
      const cell = getCell(sheet, r, c)
      return (
        cell?.f !== undefined ||
        cell?.v === undefined ||
        cell.v === null ||
        cell.v === '' ||
        cell.v === false
      )
    })

  let added = 0
  let updated = 0
  let removed = 0

  // Rows whose WFP row is gone.
  const wanted = new Set(items.map((i) => i.key))
  for (const [rowId, key] of Object.entries(links)) {
    if (wanted.has(key)) continue
    delete links[rowId]
    const r = sheet.rows.findIndex((x) => x.id === rowId)
    if (r < 0) continue
    const filledByUser = check.columns.some((c) => {
      const cell = getCell(sheet, r, c)
      return (
        !owned.has(c) &&
        cell?.f === undefined &&
        cell?.v !== undefined &&
        cell.v !== null &&
        cell.v !== ''
      )
    })
    if (!filledByUser) {
      sheet = deleteRows(sheet, r, 1, name)
      removed++
    }
  }

  for (const item of items) {
    let r = rowOf(item.key)
    const isNew = r < 0
    if (isNew) {
      const end = totalIndex()
      r = -1
      for (let i = headerRow + 1; i < end; i++) {
        if (isFree(i)) {
          r = i
          break
        }
      }
      if (r < 0) {
        // No free row: add one just above the last data row, so the totals still cover it.
        const at = Math.max(headerRow + 1, end - 1)
        sheet = insertRows(sheet, at, 1, name)
        const copies: CellUpdate[] = []
        sheet.cols.forEach((_, c) => {
          const below = getCell(sheet, at + 1, c)
          if (below?.f !== undefined)
            copies.push({ r: at, c, cell: { f: moveFormula(below.f, -1, 0), s: below.s } })
          else if (below?.s) copies.push({ r: at, c, cell: { s: below.s } })
        })
        sheet = setCells(sheet, copies)
        r = at
      }
      links[sheet.rows[r].id] = item.key
      added++
    }
    const updates: CellUpdate[] = []
    for (const [header, value] of Object.entries(item.values)) {
      const c = colOf(header)
      const cell = getCell(sheet, r, c)
      const next = value === '' ? null : value
      if (cell?.f === undefined && (cell?.v ?? null) === next) continue
      updates.push({ r, c, cell: { v: next } })
    }
    if (updates.length) {
      sheet = setCells(sheet, updates)
      if (!isNew) updated++
    }
  }

  return { sheet: { ...sheet, links }, added, updated, removed }
}
