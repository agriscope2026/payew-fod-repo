// Reading activities out of a WFP sheet. A row with an activity and a unit of
// measure is an activity; the rows under it, up to the next heading or activity,
// hold its sub-activities, line items, purchase orders and payments.
//
// The template has separate Phase, Activity and Sub-activity columns. Sheets that
// keep everything in one column (the original AWFP form) work too: there a row is a
// phase when it says "Phase…", "PMO" or carries its own subtotal.
import { isError, type Scalar } from './formula'
import { getCell, type ColumnRole, type Evaluator, type Sheet } from './model'

export const ROLE_LABEL: Record<ColumnRole, string> = {
  phase: 'Phase / component',
  pap: 'Activity (PAP)',
  sub: 'Sub-activity',
  unit: 'Unit of measure',
  target: 'Physical target',
  object: 'Object of expenditure',
  budget: 'Budget (annual total)',
  for_obligation: 'Amount for obligation',
  obligated: 'Total obligation',
  for_disbursement: 'For disbursement',
  paid: 'Paid (checkbox)',
  disbursed: 'Total disbursement',
  status: 'Status',
  remarks: 'Remarks',
}

/** Rows above the data: the frozen rows, or the first rows with several labels. */
export function headerRowCount(sheet: Sheet) {
  if (sheet.freeze.rows > 0) return sheet.freeze.rows
  for (let r = 0; r < Math.min(15, sheet.rows.length); r++) {
    const labels = sheet.cols.filter((_, c) => typeof getCell(sheet, r, c)?.v === 'string').length
    if (labels >= 3) return r + 1
  }
  return 1
}

/** Header text of each column, from the header rows that look like table headers. */
export function headerLabels(sheet: Sheet): string[] {
  const rows = headerRowCount(sheet)
  const tableRows: number[] = []
  for (let r = 0; r < rows; r++) {
    const labels = sheet.cols.filter((_, c) => typeof getCell(sheet, r, c)?.v === 'string').length
    if (labels >= 2) tableRows.push(r)
  }
  return sheet.cols.map((_, c) => {
    const parts: string[] = []
    for (const r of tableRows) {
      // A merged header labels every column it covers.
      const m = sheet.merges.find((x) => r >= x.r && r < x.r + x.rs && c >= x.c && c < x.c + x.cs)
      const v = getCell(sheet, m ? m.r : r, m ? m.c : c)?.v
      if (typeof v === 'string' && v.trim()) {
        const text = v.replace(/\s+/g, ' ').trim()
        if (parts[parts.length - 1] !== text) parts.push(text)
      }
    }
    return parts.join(' › ').toLowerCase()
  })
}

/** Finds columns by their headers, for sheets that came from a file. */
export function detectRoles(sheet: Sheet): Partial<Record<ColumnRole, string>> {
  const labels = headerLabels(sheet)
  const out: Partial<Record<ColumnRole, string>> = {}
  const take = (role: ColumnRole, test: (l: string, c: number) => boolean) => {
    if (out[role]) return
    const used = new Set(Object.values(out))
    const c = labels.findIndex((l, i) => !used.has(sheet.cols[i].id) && test(l, i))
    if (c >= 0) out[role] = sheet.cols[c].id
  }
  take('phase', (l) => /(^|› )(phase|component)\b/.test(l))
  take('sub', (l) => /sub-?\s*activit/.test(l))
  take('pap', (l) => /program|activit|project|mfo|\bpap/.test(l))
  take('unit', (l) => /unit of measure|^unit\b|› unit\b/.test(l))
  take('object', (l) => /object of expenditure|expense class|uacs/.test(l))
  const objectAt = sheet.cols.findIndex((c) => c.id === out.object)
  take(
    'target',
    (l, c) =>
      /physical/.test(l) || (/annual\s*total|target/.test(l) && (objectAt < 0 || c < objectAt)),
  )
  take('budget', (l, c) => /annual\s*total|total budget|\bbudget\b/.test(l) && c > objectAt)
  take('for_obligation', (l) => /amount for obligation|for obligation/.test(l))
  take('obligated', (l) => /total obligation|obligated/.test(l))
  take('for_disbursement', (l) => /for disbursement/.test(l))
  take('paid', (l) => /\bpaid\b/.test(l))
  take('disbursed', (l) => /total disbursement|disbursed/.test(l))
  take('status', (l) => /\bstatus\b/.test(l))
  take('remarks', (l) => /remark/.test(l))
  return out
}

/** The sheet's roles, filling gaps from the headers, as column positions. */
export function resolveRoles(sheet: Sheet): Partial<Record<ColumnRole, number>> {
  const ids = { ...detectRoles(sheet), ...(sheet.roles ?? {}) }
  const out: Partial<Record<ColumnRole, number>> = {}
  for (const [role, id] of Object.entries(ids) as [ColumnRole, string][]) {
    const c = sheet.cols.findIndex((x) => x.id === id)
    if (c >= 0) out[role] = c
  }
  return out
}

export interface WfpActivity {
  rowId: string
  row: number
  title: string
  unit: string | null
  target: number | null
  budget: number | null
  obligated: number | null
  disbursed: number | null
  phase: string | null
  status: string | null
  /** Monthly targets carried in from an uploaded BED 2 tab. */
  targets: number[] | null
  /** Last row of its block. */
  lastRow: number
}

const text = (v: Scalar) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const num = (v: Scalar) => (typeof v === 'number' && !isError(v) ? v : 0)
const TOTAL = /^\s*(grand\s+|sub-?\s*)?total\b/i
// A bare "Approved" also appears inside data rows, so only the "… by" forms count.
const SIGNATORIES = /^(prepared|reviewed|noted|certified|submitted)\s+by\b|^recommending approval/i
const PHASE_WORD = /^(phase\b|pmo\b|program management|cross-?cutting)/i

/** Where the table ends: the signature block, or the last row. */
function tableEnd(sheet: Sheet, name: string, ev: Evaluator, start: number) {
  for (let r = start; r < sheet.rows.length; r++) {
    for (let c = 0; c < sheet.cols.length; c++) {
      if (SIGNATORIES.test(text(ev.value(name, r, c)))) return r
    }
  }
  return sheet.rows.length
}

export function wfpActivities(sheet: Sheet, name: string, ev: Evaluator): WfpActivity[] {
  const roles = resolveRoles(sheet)
  if (roles.pap === undefined || roles.unit === undefined) return []
  const at = (r: number, role: ColumnRole) =>
    roles[role] === undefined ? null : ev.value(name, r, roles[role]!)
  const start = headerRowCount(sheet)
  const stop = tableEnd(sheet, name, ev, start)
  const separate = roles.phase !== undefined

  const isActivity = (r: number) => {
    const pap = text(at(r, 'pap'))
    return pap.length >= 3 && !TOTAL.test(pap) && text(at(r, 'unit')) !== ''
  }
  // Rows that start a new block: phases and other headings.
  const isHeading = (r: number) => {
    if (separate)
      return text(at(r, 'phase')) !== '' || (text(at(r, 'pap')) !== '' && !isActivity(r))
    return (
      text(at(r, 'pap')) !== '' &&
      !isActivity(r) &&
      num(at(r, 'budget')) > 0 &&
      text(at(r, 'object')) === ''
    )
  }
  const phaseOf = (r: number) => {
    if (separate) return text(at(r, 'phase'))
    const pap = text(at(r, 'pap'))
    return pap && !isActivity(r) && (PHASE_WORD.test(pap) || isHeading(r)) ? pap : ''
  }

  const out: WfpActivity[] = []
  let phase: string | null = null
  for (let r = start; r < stop; r++) {
    const p = phaseOf(r)
    if (p) phase = p
    if (!isActivity(r)) continue
    let end = r
    while (end + 1 < stop && !isActivity(end + 1) && !isHeading(end + 1)) end++

    let lines = 0
    let obligated = 0
    let disbursed = 0
    let status = ''
    for (let i = r; i <= end; i++) {
      if (text(at(i, 'object')) !== '') lines += num(at(i, 'budget'))
      obligated += num(at(i, 'obligated'))
      if (roles.paid !== undefined && roles.for_disbursement !== undefined) {
        if (at(i, 'paid') === true) disbursed += num(at(i, 'for_disbursement'))
      } else {
        disbursed += num(at(i, 'disbursed'))
      }
      status ||= text(at(i, 'status'))
    }
    const round = (n: number) => Math.round(n * 100) / 100
    // Line items carry the money; an activity row without one may hold a subtotal.
    const budget = lines > 0 ? lines : num(at(r, 'budget'))
    const target = at(r, 'target')
    out.push({
      rowId: sheet.rows[r].id,
      row: r,
      title: text(at(r, 'pap')),
      unit: text(at(r, 'unit')) || null,
      target: typeof target === 'number' ? target : null,
      budget: budget > 0 ? round(budget) : null,
      obligated: roles.obligated === undefined ? null : round(obligated),
      disbursed:
        roles.paid === undefined && roles.disbursed === undefined ? null : round(disbursed),
      phase,
      status: status || null,
      targets: sheet.physical?.[sheet.rows[r].id] ?? null,
      lastRow: end,
    })
    r = end
  }
  return out
}

export interface WfpTotals {
  budget: number
  forObligation: number
  obligated: number
  forDisbursement: number
  disbursed: number
}

/** Column totals of a WFP in the template layout (no subtotal rows in the data). */
export function wfpTotals(sheet: Sheet, name: string, ev: Evaluator): WfpTotals | null {
  const roles = resolveRoles(sheet)
  if (roles.budget === undefined) return null
  const at = (r: number, role: ColumnRole) =>
    roles[role] === undefined ? null : ev.value(name, r, roles[role]!)
  const start = headerRowCount(sheet)
  const stop = tableEnd(sheet, name, ev, start)
  const out: WfpTotals = {
    budget: 0,
    forObligation: 0,
    obligated: 0,
    forDisbursement: 0,
    disbursed: 0,
  }
  for (let r = start; r < stop; r++) {
    const label = sheet.cols.map((_, c) => text(ev.value(name, r, c))).find((t) => t !== '')
    if (label && TOTAL.test(label)) continue
    out.budget += num(at(r, 'budget'))
    out.forObligation += num(at(r, 'for_obligation'))
    out.obligated += num(at(r, 'obligated'))
    out.forDisbursement += num(at(r, 'for_disbursement'))
    if (roles.paid !== undefined && roles.for_disbursement !== undefined) {
      if (at(r, 'paid') === true) out.disbursed += num(at(r, 'for_disbursement'))
    } else out.disbursed += num(at(r, 'disbursed'))
  }
  const round = (n: number) => Math.round(n * 100) / 100
  return {
    budget: round(out.budget),
    forObligation: round(out.forObligation),
    obligated: round(out.obligated),
    forDisbursement: round(out.forDisbursement),
    disbursed: round(out.disbursed),
  }
}

/**
 * Outline level of each row, for expanding and collapsing: 0 a phase, 1 a heading or
 * activity, 2 anything under it; null for header rows. Empty unless the sheet has
 * Phase and Activity columns.
 */
export function wfpOutline(sheet: Sheet, name: string, ev: Evaluator): (number | null)[] {
  const roles = resolveRoles(sheet)
  if (roles.phase === undefined || roles.pap === undefined) return []
  const start = headerRowCount(sheet)
  return sheet.rows.map((_, r) => {
    if (r < start) return null
    if (text(ev.value(name, r, roles.phase!)) !== '') return 0
    if (text(ev.value(name, r, roles.pap!)) !== '') return 1
    return 2
  })
}
