import { describe, expect, it } from 'vitest'
import { buildFromUpload, checkUpload } from './intake'
import { blankSheet, createEvaluator, pasteText, typeInto, type Sheet } from './model'
import { sheetFromTemplate, templateHeaders } from './templates'
import { wfpActivities } from './wfp'
import { buildXlsx, readSpreadsheet } from './xlsx-io'

const evalOf = (name: string, sheet: Sheet) => createEvaluator({ sheets: new Map([[name, sheet]]) })
const tsv = (rows: (string | number)[][]) => rows.map((r) => r.join('\t')).join('\n')

describe('accepting uploads', () => {
  it('accepts a downloaded template that was filled in, and rebuilds it in the template', async () => {
    let filled = sheetFromTemplate('WFP')
    filled = pasteText(
      filled,
      { r: 3, c: 0 },
      tsv([
        ['Phase 2'],
        [
          '',
          'Training on composting',
          '',
          'Training',
          2,
          'Training Expense',
          100000,
          100000,
          90000,
        ],
      ]),
    ).sheet
    filled = typeInto(filled, 4, 13, '40000')
    filled = typeInto(filled, 4, 14, 'TRUE')
    filled = typeInto(filled, 4, 16, 'Ongoing')
    const file = await buildXlsx({
      sheet: filled,
      sheetName: 'WFP',
      evaluator: evalOf('WFP', filled),
      title: 'FY 2026 Work and Financial Plan',
      subtitle: 'AMIA',
      fileName: 'x.xlsx',
    })
    const [tab] = await readSpreadsheet(file, 'x.xlsx')
    const ev = evalOf(tab.name, tab.sheet)
    const check = checkUpload('WFP', tab.sheet, tab.name, ev)
    expect(check.kind).toBe('template')
    if (check.kind !== 'template') return
    const out = buildFromUpload('WFP', tab.sheet, tab.name, ev, check)
    const acts = wfpActivities(out, 'WFP', evalOf('WFP', out))
    expect(
      acts.map((a) => [a.title, a.phase, a.target, a.budget, a.obligated, a.disbursed, a.status]),
    ).toEqual([['Training on composting', 'Phase 2', 2, 100000, 90000, 40000, 'Ongoing']])
    // The template's own total row and formulas are back.
    expect(evalOf('WFP', out).value('WFP', 2, 6)).toBe(100000)
  })

  it('accepts the columns in another order and ignores extra ones', () => {
    const headers = templateHeaders('allotments')
    const shuffled = ['Extra', ...[...headers].reverse()]
    const amount = shuffled.indexOf('Amount')
    const row = shuffled.map((_, i) =>
      i === amount ? 5000 : i === shuffled.indexOf('Kind') ? 'SARO' : '',
    )
    const s = pasteText(
      blankSheet(6, shuffled.length),
      { r: 0, c: 0 },
      tsv([shuffled, row, ['TOTAL']]),
    ).sheet
    const ev = evalOf('A', s)
    const check = checkUpload('allotments', s, 'A', ev)
    expect(check.kind).toBe('template')
    if (check.kind !== 'template') return
    const out = evalOf('Allotments', buildFromUpload('allotments', s, 'A', ev, check))
    expect([out.value('Allotments', 1, 2), out.value('Allotments', 1, 6)]).toEqual(['SARO', 5000])
  })

  it('refuses a tab without the template columns and says what is missing', () => {
    const s = pasteText(
      blankSheet(4, 4),
      { r: 0, c: 0 },
      tsv([
        ['Date', 'Amount', 'Notes'],
        ['x', 1, 'y'],
      ]),
    ).sheet
    const check = checkUpload('allotments', s, 'A', evalOf('A', s))
    expect(check.kind).toBe('mismatch')
    if (check.kind === 'mismatch') expect(check.missing).toContain('SARO / SAA No.')
    expect(checkUpload('WFP', s, 'A', evalOf('A', s)).kind).toBe('mismatch')
  })
})
