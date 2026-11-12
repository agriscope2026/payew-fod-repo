import { describe, expect, it } from 'vitest'
import { createEvaluator, pasteText, typeInto, type Sheet } from './model'
import { reflectInto, reflectItems, wfpLines } from './reflect'
import { sheetFromTemplate } from './templates'

const tsv = (rows: (string | number)[][]) => rows.map((r) => r.join('\t')).join('\n')
const evalOf = (name: string, sheet: Sheet) => createEvaluator({ sheets: new Map([[name, sheet]]) })

function wfp() {
  let s = sheetFromTemplate('WFP')
  s = pasteText(
    s,
    { r: 3, c: 0 },
    tsv([
      ['Phase 1'],
      ['', 'Training on composting', '', 'Training', 1, 'Training Expense', 100000],
      ['', '', '', '', '', '', '', 60000, '', '', '256-1', 'GM Hotel', 'meals', 60000],
      ['', '', '', '', '', 'CO: Equipment', 50000],
      ['', '', '', '', '', '', '', 45000, '', '', '254-9', 'Agri Supply', 'shredder'],
    ]),
  ).sheet
  return typeInto(s, 5, 14, 'TRUE')
}

describe('reflecting the WFP into other sheets', () => {
  it('fills the ORS, DV, PPMP and APP with the rows that belong there', () => {
    const s = wfp()
    const lines = wfpLines(s, 'WFP', evalOf('WFP', s))
    const fill = (
      kind: 'obligations' | 'disbursements' | 'PPMP' | 'APP',
      name: string,
      cols: number[],
    ) => {
      const out = reflectInto(kind, sheetFromTemplate(kind), reflectItems(kind, lines))!
      const ev = evalOf(name, out.sheet)
      return [1, 2].map((r) => cols.map((c) => ev.value(name, r, c)))
    }
    expect(fill('obligations', 'ORS', [2, 3, 4, 6, 7])).toEqual([
      ['GM Hotel', 'meals · PO 256-1', 'Training on composting', 'Training Expense', 60000],
      ['Agri Supply', 'shredder · PO 254-9', 'Training on composting', 'CO: Equipment', 45000],
    ])
    expect(fill('disbursements', 'DV', [3, 5, 8])).toEqual([
      ['GM Hotel', 60000, 60000],
      [null, null, ''],
    ])
    expect(fill('PPMP', 'PPMP', [1, 5])).toEqual([
      ['Training Expense', 100000],
      ['CO: Equipment', 50000],
    ])
    expect(fill('APP', 'APP', [1, 9, 10, 11])).toEqual([
      ['Training on composting', 100000, 50000, 150000],
      [null, null, null, 0],
    ])
  })

  it('keeps typed details, follows WFP edits and drops rows that left the WFP', () => {
    let s = wfp()
    const items = (x: Sheet) => reflectItems('obligations', wfpLines(x, 'WFP', evalOf('WFP', x)))
    let ors = reflectInto('obligations', sheetFromTemplate('obligations'), items(s))!.sheet
    ors = typeInto(ors, 1, 1, 'ORS-2026-001')

    // The amount changes in the WFP; the second PO is removed.
    s = typeInto(s, 5, 7, '58000')
    s = typeInto(s, 7, 11, '')
    s = typeInto(s, 7, 10, '')
    const again = reflectInto('obligations', ors, items(s))!
    expect([again.added, again.updated, again.removed]).toEqual([0, 1, 1])
    const ev = evalOf('ORS', again.sheet)
    expect([ev.value('ORS', 1, 1), ev.value('ORS', 1, 7), ev.value('ORS', 2, 2)]).toEqual([
      'ORS-2026-001',
      58000,
      null,
    ])
    // The total row still adds up.
    const total = again.sheet.rows.findIndex((_, r) => ev.value('ORS', r, 0) === 'TOTAL')
    expect(ev.value('ORS', total, 7)).toBe(58000)
    // Nothing changes when the WFP has not changed.
    expect(reflectInto('obligations', again.sheet, items(s))).toMatchObject({
      added: 0,
      updated: 0,
      removed: 0,
    })
  })

  it('adds rows when the sheet is full, and skips sheets with another layout', () => {
    const s = wfp()
    const lines = wfpLines(s, 'WFP', evalOf('WFP', s))
    const many = Array.from({ length: 40 }, (_, i) => ({
      key: `k${i}`,
      values: { Payee: `P${i}`, Amount: 10 },
    }))
    const out = reflectInto('obligations', sheetFromTemplate('obligations'), many)!
    const ev = evalOf('ORS', out.sheet)
    const total = out.sheet.rows.findIndex((_, r) => ev.value('ORS', r, 0) === 'TOTAL')
    expect([out.added, ev.value('ORS', total, 7)]).toEqual([40, 400])
    expect(
      reflectInto('obligations', sheetFromTemplate('PPMP'), reflectItems('obligations', lines)),
    ).toBeNull()
  })
})
