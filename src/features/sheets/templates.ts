// Starting layouts for each finance sheet. Editing the header row or adding or
// removing columns turns a sheet into a custom one.
import { colName } from './formula'
import {
  blankSheet,
  getCell,
  setCells,
  styleRange,
  type CellUpdate,
  type NumberFormat,
  type Sheet,
  type SheetKind,
} from './model'

interface TemplateColumn {
  header: string
  width: number
  fmt?: NumberFormat
  /** Summed in the total row. */
  total?: boolean
  /** Formula for each data row; {r} is the row number. */
  each?: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const money = (header: string, extra: Partial<TemplateColumn> = {}): TemplateColumn => ({
  header,
  width: 120,
  fmt: 'number',
  total: true,
  ...extra,
})
const text = (header: string, width = 140): TemplateColumn => ({ header, width })
const date = (header: string): TemplateColumn => ({ header, width: 104, fmt: 'date' })

export interface SheetTemplate {
  key: string
  name: string
  columns: TemplateColumn[]
}

const TEMPLATES: Record<SheetKind, SheetTemplate> = {
  // The DA-CAR AWFP monitoring layout with Phase, Activity and Sub-activity in
  // their own columns; see wfpTemplate() for its two-row header.
  WFP: {
    key: 'wfp-awfp-v3',
    name: 'DA-CAR AWFP',
    columns: [
      text('Phase / Component', 260),
      text('Activity (Programs, Projects, Activities)', 380),
      text('Sub-activity', 300),
      text('Unit of Measure', 120),
      { header: 'Annual Target', width: 100, fmt: 'integer' },
      text('Object of Expenditure', 260),
      money('Annual Budget', { width: 150 }),
      money('Amount for Obligation', { width: 150 }),
      money('Total Obligation', { width: 150 }),
      money('Balance', { each: 'IF(G{r}="","",G{r}-I{r})', width: 140 }),
      text('PO No.', 120),
      text('Supplier', 240),
      text('Particulars', 260),
      money('For Disbursement', { width: 150 }),
      { header: 'Paid', width: 70 },
      money('Total Disbursement', { each: 'IF(O{r}=TRUE,N{r},"")', width: 150 }),
      text('Status', 170),
      text('Remarks (include name of beneficiary)', 320),
    ],
  },
  PPMP: {
    key: 'ppmp-v1',
    name: 'PPMP',
    columns: [
      text('Code', 90),
      text('General description', 280),
      { header: 'Quantity', width: 80, fmt: 'integer' },
      text('Unit', 80),
      money('Unit cost'),
      money('Estimated budget', { each: 'C{r}*E{r}', width: 130 }),
      text('Mode of procurement', 160),
      ...MONTHS.map((m) => ({ header: m, width: 64 })),
      text('Remarks', 200),
    ],
  },
  APP: {
    key: 'app-v1',
    name: 'APP',
    columns: [
      text('Code', 90),
      text('Procurement project', 280),
      text('PMO / end-user', 140),
      text('Mode of procurement', 160),
      date('Advertisement'),
      date('Bid opening'),
      date('Notice of award'),
      date('Contract signing'),
      text('Source of funds', 120),
      money('MOOE'),
      money('CO'),
      money('Total', { each: 'J{r}+K{r}', width: 130 }),
      text('Remarks', 200),
    ],
  },
  allotments: {
    key: 'allotments-v1',
    name: 'Allotments',
    columns: [
      date('Date'),
      text('SARO / SAA No.', 140),
      text('Kind', 110),
      text('Expense class', 100),
      text('Object of expenditure', 200),
      text('Fund source', 120),
      money('Amount', { width: 140 }),
      text('Remarks', 220),
    ],
  },
  obligations: {
    key: 'ors-v1',
    name: 'ORS register',
    columns: [
      date('Date'),
      text('ORS No.', 130),
      text('Payee', 200),
      text('Particulars', 260),
      text('Activity', 200),
      text('Expense class', 100),
      text('Object of expenditure', 180),
      money('Amount', { width: 140 }),
      text('Remarks', 200),
    ],
  },
  disbursements: {
    key: 'dv-v1',
    name: 'DV register',
    columns: [
      date('Date'),
      text('DV No.', 130),
      text('ORS No.', 130),
      text('Payee', 200),
      text('Particulars', 240),
      money('Gross amount', { width: 130 }),
      money('Tax withheld'),
      money('Other deductions'),
      money('Net amount', { each: 'IF(F{r}="","",F{r}-G{r}-H{r})', width: 130 }),
      text('Check / ADA No.', 130),
      text('Remarks', 200),
    ],
  },
}

export const templateFor = (kind: SheetKind) => TEMPLATES[kind]

const DEFAULT_DATA_ROWS = 30
export const HEADER_FILL = '#e2e8f0'

/** A new sheet laid out from the template: header, empty rows, a total row. */
export function sheetFromTemplate(kind: SheetKind, dataRows?: number): Sheet {
  if (kind === 'WFP') return wfpTemplate(dataRows)
  const DATA_ROWS = Math.max(dataRows ?? DEFAULT_DATA_ROWS, 5)
  const t = TEMPLATES[kind]
  const totalRow = DATA_ROWS + 1
  let sheet = blankSheet(totalRow + 10, t.columns.length)
  sheet = {
    ...sheet,
    cols: sheet.cols.map((c, i) => ({ ...c, w: t.columns[i].width })),
    freeze: { rows: 1, cols: 1 },
  }

  const updates: CellUpdate[] = t.columns.map((col, c) => ({ r: 0, c, cell: { v: col.header } }))
  t.columns.forEach((col, c) => {
    if (col.each) {
      for (let r = 1; r <= DATA_ROWS; r++) {
        updates.push({ r, c, cell: { f: col.each.replace(/\{r\}/g, String(r + 1)) } })
      }
    }
    if (col.total) {
      const letter = colName(c)
      updates.push({ r: totalRow, c, cell: { f: `SUM(${letter}2:${letter}${totalRow})` } })
    }
  })
  updates.push({ r: totalRow, c: 0, cell: { v: 'TOTAL' } })
  sheet = setCells(sheet, updates)

  const last = t.columns.length - 1
  sheet = styleRange(
    sheet,
    { r1: 0, c1: 0, r2: 0, c2: last },
    {
      b: true,
      bg: HEADER_FILL,
      wrap: true,
      valign: 'middle',
      border: { b: true },
    },
  )
  sheet = { ...sheet, rows: sheet.rows.map((row, i) => (i === 0 ? { ...row, h: 40 } : row)) }
  sheet = styleRange(
    sheet,
    { r1: totalRow, c1: 0, r2: totalRow, c2: last },
    { b: true, border: { t: true } },
  )
  t.columns.forEach((col, c) => {
    if (col.fmt)
      sheet = styleRange(sheet, { r1: 1, c1: c, r2: totalRow, c2: c }, (old) => ({
        ...old,
        fmt: col.fmt,
      }))
  })
  return sheet
}

/** Where the data rows of a kind's template start, and its column headers. */
export const templateDataStart = (kind: SheetKind) => (kind === 'WFP' ? 3 : 1)
export const templateHeaders = (kind: SheetKind) => TEMPLATES[kind].columns.map((c) => c.header)

/** The parts of a layout that make it the template: column count and header texts. */
export function layoutSignature(sheet: Sheet) {
  return JSON.stringify([
    sheet.cols.length,
    sheet.cols.map((_, c) => String(getCell(sheet, 0, c)?.v ?? '').trim()),
  ])
}

const signatures = new Map<SheetKind, string>()
export function matchesTemplate(kind: SheetKind, sheet: Sheet) {
  if (!signatures.has(kind)) signatures.set(kind, layoutSignature(sheetFromTemplate(kind)))
  return layoutSignature(sheet) === signatures.get(kind)
}

/** Choices of the WFP Status column; users can change them (Dropdown in the toolbar). */
export const WFP_STATUSES = [
  'Accomplished',
  'Ongoing',
  'Obligated',
  'For procurement',
  'To be conducted',
  'Delayed',
  'Cancelled',
]

const WFP_GROUPS: { label: string; from: number; to: number }[] = [
  { label: 'Programs, Projects, Activities', from: 0, to: 2 },
  { label: 'Physical Target', from: 3, to: 4 },
  { label: 'Financial Target', from: 5, to: 6 },
  { label: 'Obligation', from: 7, to: 9 },
  { label: 'Procurement', from: 10, to: 12 },
  { label: 'Disbursement', from: 13, to: 15 },
]

/**
 * The AWFP monitoring layout: grouped two-row header, the grand total on top, and
 * rows below. Put a phase in the first column, an activity (with its unit of measure)
 * in the second, and its sub-activities in the third. Rows under an activity hold its
 * line items (object of expenditure), purchase orders and payments.
 */
export function wfpTemplate(dataRows = DEFAULT_DATA_ROWS + 10): Sheet {
  const t = TEMPLATES.WFP
  const last = t.columns.length - 1
  const statusCol = last - 1
  const totalRow = 2
  const first = 3
  const end = first + dataRows - 1
  let sheet = blankSheet(end + 1, t.columns.length)
  sheet = {
    ...sheet,
    cols: sheet.cols.map((c, i) => ({ ...c, w: t.columns[i].width })),
    freeze: { rows: 3, cols: 2 },
    merges: [
      { r: 0, c: statusCol, rs: 2, cs: 1 },
      { r: 0, c: last, rs: 2, cs: 1 },
      ...WFP_GROUPS.map((g) => ({ r: 0, c: g.from, rs: 1, cs: g.to - g.from + 1 })),
    ],
  }
  const updates: CellUpdate[] = [
    { r: 0, c: statusCol, cell: { v: t.columns[statusCol].header } },
    { r: 0, c: last, cell: { v: t.columns[last].header } },
    ...WFP_GROUPS.map((g) => ({ r: 0, c: g.from, cell: { v: g.label } })),
    ...t.columns.slice(0, statusCol).map((col, c) => ({ r: 1, c, cell: { v: col.header } })),
    { r: totalRow, c: 0, cell: { v: 'GRAND TOTAL' } },
  ]
  t.columns.forEach((col, c) => {
    if (col.total) {
      const letter = colName(c)
      updates.push({
        r: totalRow,
        c,
        cell: { f: `SUM(${letter}${first + 1}:${letter}${end + 1})` },
      })
    }
    for (let r = first; r <= end; r++) {
      if (col.each) updates.push({ r, c, cell: { f: col.each.replace(/{r}/g, String(r + 1)) } })
      if (col.header === 'Paid') updates.push({ r, c, cell: { v: false } })
    }
  })
  sheet = setCells(sheet, updates)
  sheet = styleRange(
    sheet,
    { r1: 0, c1: 0, r2: 1, c2: last },
    {
      b: true,
      bg: HEADER_FILL,
      wrap: true,
      align: 'center',
      valign: 'middle',
      border: { b: true },
    },
  )
  sheet = styleRange(
    sheet,
    { r1: totalRow, c1: 0, r2: totalRow, c2: last },
    { b: true, bg: '#f1f5f9', border: { b: true } },
  )
  for (const c of [0, 1, 2, 5, 12, last]) {
    sheet = styleRange(sheet, { r1: first, c1: c, r2: end, c2: c }, (old) => ({
      ...old,
      wrap: true,
      valign: 'top',
    }))
  }
  sheet = styleRange(sheet, { r1: first, c1: 0, r2: end, c2: 0 }, (old) => ({ ...old, b: true }))
  t.columns.forEach((col, c) => {
    if (col.fmt)
      sheet = styleRange(sheet, { r1: totalRow, c1: c, r2: end, c2: c }, (old) => ({
        ...old,
        fmt: col.fmt,
      }))
  })
  const id = (c: number) => sheet.cols[c].id
  return {
    ...sheet,
    rows: sheet.rows.map((row, i) => (i === 1 ? { ...row, h: 48 } : row)),
    lists: { [id(statusCol)]: WFP_STATUSES },
    roles: {
      phase: id(0),
      pap: id(1),
      sub: id(2),
      unit: id(3),
      target: id(4),
      object: id(5),
      budget: id(6),
      for_obligation: id(7),
      obligated: id(8),
      for_disbursement: id(13),
      paid: id(14),
      disbursed: id(15),
      status: id(statusCol),
      remarks: id(last),
    },
  }
}
