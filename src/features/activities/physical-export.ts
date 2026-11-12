// Activities (Physical) as a BED 2 style workbook: each activity has a target line
// and an accomplishment line, with quarter and year totals as formulas.
import {
  createEvaluator,
  setCells,
  styleRange,
  blankSheet,
  type CellUpdate,
} from '@/features/sheets/model'
import { colName } from '@/features/sheets/formula'
import { downloadXlsx } from '@/features/sheets/xlsx-io'
import { formatDate } from '@/lib/format'
import type { ActivityPhysicalRow, ActivityView } from '@/types/database'
import { MONTH_LABELS, QUARTER_LABELS, twelve } from './physical'

const FIRST_VALUE_COL = 4 // E

/** Column of month m (0-11) in the BED layout, where every fourth column is a quarter. */
const monthCol = (m: number) => FIRST_VALUE_COL + Math.floor(m / 3) * 4 + (m % 3)
const quarterCol = (q: number) => FIRST_VALUE_COL + q * 4 + 3
const totalCol = FIRST_VALUE_COL + 16

export function buildPhysicalSheet(
  rows: ActivityView[],
  physical: Map<string, ActivityPhysicalRow>,
  unitOf: (a: ActivityView) => string,
) {
  const headers = [
    'Programs / Activities / Projects (MFO)',
    'Unit of Measure',
    'Annual Target',
    '',
    ...Array.from({ length: 4 }, (_, q) => [
      ...MONTH_LABELS.slice(q * 3, q * 3 + 3),
      QUARTER_LABELS[q],
    ]).flat(),
    'Total',
    'Status / Remarks',
    'Workflow Stage',
  ]
  const n = headers.length
  const dataStart = 1
  const lastData = dataStart + rows.length * 2 - 1
  const totalRows = lastData + 1
  let sheet = blankSheet(totalRows + 3, n)
  const widths = [340, 90, 70, 96, ...Array(16).fill(54), 60, 240, 180]
  sheet = {
    ...sheet,
    cols: sheet.cols.map((c, i) => ({ ...c, w: widths[i] })),
    freeze: { rows: 1, cols: 1 },
  }

  const updates: CellUpdate[] = headers.map((h, c) => ({ r: 0, c, cell: { v: h } }))
  const merges = []
  rows.forEach((a, i) => {
    const p = physical.get(a.id)
    const r = dataStart + i * 2
    updates.push(
      { r, c: 0, cell: { v: `${a.code ? `${a.code} · ` : ''}${a.title}` } },
      { r, c: 1, cell: { v: unitOf(a) || null } },
      { r, c: 2, cell: { v: a.target_quantity === null ? null : Number(a.target_quantity) } },
      { r, c: n - 2, cell: { v: p?.status_note ?? null } },
      {
        r,
        c: n - 1,
        cell: { v: a.current_stage_name ?? (a.status === 'completed' ? 'Completed' : null) },
      },
    )
    ;(['Target', 'Accomplished'] as const).forEach((line, k) => {
      const values = twelve(k === 0 ? p?.monthly_targets : p?.monthly_done)
      const row = r + k
      updates.push({ r: row, c: 3, cell: { v: line } })
      values.forEach((v, m) => updates.push({ r: row, c: monthCol(m), cell: { v: v || null } }))
      for (let q = 0; q < 4; q++) {
        const from = colName(monthCol(q * 3))
        const to = colName(monthCol(q * 3 + 2))
        updates.push({
          r: row,
          c: quarterCol(q),
          cell: { f: `SUM(${from}${row + 1}:${to}${row + 1})` },
        })
      }
      const qs = [0, 1, 2, 3].map((q) => `${colName(quarterCol(q))}${row + 1}`).join('+')
      updates.push({ r: row, c: totalCol, cell: { f: qs } })
    })
    for (const c of [0, 1, 2, n - 2, n - 1]) merges.push({ r, c, rs: 2, cs: 1 })
  })
  updates.push({ r: totalRows, c: 0, cell: { v: 'TOTAL' } })
  ;(['Target', 'Accomplished'] as const).forEach((line, k) => {
    const row = totalRows + k
    updates.push({ r: row, c: 3, cell: { v: line } })
    for (let c = FIRST_VALUE_COL; c <= totalCol; c++) {
      const L = colName(c)
      updates.push({
        r: row,
        c,
        cell: {
          f: `SUMIF($D$${dataStart + 1}:$D$${lastData + 1},"${line}",${L}${dataStart + 1}:${L}${lastData + 1})`,
        },
      })
    }
  })
  merges.push({ r: totalRows, c: 0, rs: 2, cs: 1 })
  sheet = setCells(sheet, updates)
  sheet = { ...sheet, merges }
  sheet = styleRange(sheet, { r1: 0, c1: 0, r2: 0, c2: n - 1 }, { wrap: true })
  sheet = styleRange(sheet, { r1: dataStart, c1: 0, r2: lastData, c2: 0 }, { wrap: true })
  for (let q = 0; q < 4; q++) {
    sheet = styleRange(
      sheet,
      { r1: dataStart, c1: quarterCol(q), r2: totalRows + 1, c2: quarterCol(q) },
      { b: true },
    )
  }
  sheet = styleRange(
    sheet,
    { r1: dataStart, c1: totalCol, r2: totalRows + 1, c2: totalCol },
    { b: true },
  )
  sheet = { ...sheet, rows: sheet.rows.map((row, i) => (i === 0 ? { ...row, h: 40 } : row)) }
  return sheet
}

export async function exportPhysicalSheet(v: {
  rows: ActivityView[]
  physical: Map<string, ActivityPhysicalRow>
  unitOf: (a: ActivityView) => string
  programLabel: string
  fiscalYear: string
}) {
  const sheet = buildPhysicalSheet(v.rows, v.physical, v.unitOf)
  await downloadXlsx({
    sheet,
    sheetName: 'Physical',
    evaluator: createEvaluator({ sheets: new Map([['Physical', sheet]]) }),
    title: `${v.fiscalYear} Monthly Physical Targets and Accomplishments`,
    subtitle: `${v.programLabel} · exported ${formatDate(new Date().toISOString())}`,
    fileName: `PAYEW-Physical-${v.programLabel}-${v.fiscalYear}.xlsx`.replace(/\s+/g, '-'),
  })
}
