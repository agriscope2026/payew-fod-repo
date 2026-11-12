import { describe, expect, it } from 'vitest'
import { convertAwfp, readBed, statusChoice, canConvertAwfp } from './convert'
import { matchActivity } from './match'
import { blankSheet, createEvaluator, listFor, pasteText, typeInto, type Sheet } from './model'
import { sheetFromTemplate, WFP_STATUSES } from './templates'
import { renumberWfp } from './numbering'
import { detectRoles, wfpActivities, wfpOutline, wfpTotals } from './wfp'

const tsv = (rows: (string | number)[][]) => rows.map((r) => r.join('\t')).join('\n')
const evalOf = (name: string, sheet: Sheet) => createEvaluator({ sheets: new Map([[name, sheet]]) })
const read = (sheet: Sheet) => wfpActivities(sheet, 'WFP', evalOf('WFP', sheet))

describe('WFP activities', () => {
  it('reads phases, activities and the rows under them in the template', () => {
    let s = sheetFromTemplate('WFP')
    s = pasteText(
      s,
      { r: 3, c: 0 },
      tsv([
        ['Phase 2: Testing CRA technologies'],
        [
          '',
          'a. Training-workshop on vermi-composting',
          '',
          'Training',
          1,
          'Training Expense',
          100000,
          100000,
          98000,
        ],
        ['', '', 'Field day', '', '', 'Supplies', 20000],
        ['PMO'],
        ['', 'Mid-year assessment', '', 'Assessment', 1, 'Representation', 109500],
      ]),
    ).sheet
    s = typeInto(s, 5, 13, '50000')
    s = typeInto(s, 5, 14, 'TRUE')
    s = typeInto(s, 4, 16, 'Ongoing')

    expect(
      read(s).map((a) => [
        a.title,
        a.phase,
        a.unit,
        a.target,
        a.budget,
        a.obligated,
        a.disbursed,
        a.status,
      ]),
    ).toEqual([
      [
        'a. Training-workshop on vermi-composting',
        'Phase 2: Testing CRA technologies',
        'Training',
        1,
        120000,
        98000,
        50000,
        'Ongoing',
      ],
      ['Mid-year assessment', 'PMO', 'Assessment', 1, 109500, 0, 0, null],
    ])
  })

  it('gives the Status column a dropdown that users can change', () => {
    const s = sheetFromTemplate('WFP')
    expect(listFor(s, 16)).toEqual(WFP_STATUSES)
    expect(listFor(s, 0)).toBeNull()
  })

  it('finds the columns of an uploaded sheet by their headers', () => {
    const s = pasteText(
      blankSheet(5, 9),
      { r: 0, c: 0 },
      tsv([
        [
          'PROGRAM / ACTIVITY',
          'Unit of Measure',
          'Physical Target',
          'Object of Expenditure',
          'Annual Total',
          'TOTAL OBLIGATION',
          'PAID',
          'FOR DISBURSEMENT',
          'Status',
        ],
      ]),
    ).sheet
    const roles = detectRoles(s)
    const at = (id?: string) => s.cols.findIndex((c) => c.id === id)
    expect(
      [
        roles.pap,
        roles.unit,
        roles.target,
        roles.object,
        roles.budget,
        roles.obligated,
        roles.paid,
        roles.for_disbursement,
        roles.status,
      ].map(at),
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('converting a one-column AWFP', () => {
  const awfp = pasteText(
    blankSheet(20, 12),
    { r: 0, c: 0 },
    tsv([
      [
        'MFO / PROGRAM, PROJECT, ACTIVITY',
        'Unit of Measure',
        'Annual Total',
        'Object of Expenditure',
        'Annual Budget',
        'TOTAL OBLIGATION',
        'PO #',
        'SUPPLIER',
        'PARTICULAR',
        'FOR DISBURSEMENT',
        'PAID',
        'REMARKS',
      ],
      ['LFP-CRA', '', '', '', 300000],
      ['Phase 2: Testing', '', '', '', 300000],
      ['2.1. No. of villages assisted'],
      ['2.1.4. Field school', 'Number', 5],
      ['2.1.4.1. Field school in Abra', '', '', 'Training Expense', 200000, 150000],
      ['', '', '', '', '', '', '256-1', 'GM Hotel', 'meals', 90000, 'TRUE'],
      ['a. Training on composting', 'Number', 1, 'Training Expense', 100000, 100000],
      ['Prepared by:'],
      ['JUAN DELA CRUZ', 'Agriculturist II'],
    ]),
  ).sheet
  const bed = pasteText(
    blankSheet(8, 16),
    { r: 0, c: 0 },
    tsv([
      [
        'PROGRAMS/ACTIVITY',
        'Unit of Measure',
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
        'STATUS',
      ],
      ['2.1.4. Field School', 'Site', 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 'Accomplished'],
      [
        'a. Training on composting production',
        'Training',
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        'To be conducted in June',
      ],
    ]),
  ).sheet

  it('puts each level in its own column and keeps the money', () => {
    expect(canConvertAwfp(awfp)).toBe(true)
    const rows = readBed(bed, 'BED', evalOf('BED', bed))
    const out = convertAwfp(awfp, 'A', evalOf('A', awfp), { targets: rows, statuses: rows })
    const ev = evalOf('WFP', out)
    const cell = (r: number, c: number) => ev.value('WFP', r, c)
    expect([cell(3, 0), cell(4, 0), cell(5, 1), cell(6, 1), cell(7, 2)]).toEqual([
      'LFP-CRA',
      'Phase 2: Testing',
      '2.1. No. of villages assisted',
      '2.1.4. Field school',
      '2.1.4.1. Field school in Abra',
    ])
    expect([cell(8, 10), cell(8, 11), cell(8, 12), cell(8, 14)]).toEqual([
      '256-1',
      'GM Hotel',
      'meals',
      true,
    ])
    // Subtotals on headings are dropped; the grand total is recalculated.
    expect([cell(2, 6), cell(2, 8), cell(2, 15)]).toEqual([300000, 250000, 90000])
    expect(
      read(out).map((a) => [
        a.title,
        a.phase,
        a.budget,
        a.obligated,
        a.disbursed,
        a.status,
        a.targets?.[4],
      ]),
    ).toEqual([
      ['2.1.4. Field school', 'Phase 2: Testing', 200000, 150000, 90000, 'Accomplished', 5],
      ['a. Training on composting', 'Phase 2: Testing', 100000, 100000, 0, 'To be conducted', 1],
    ])
  })

  it('matches titles worded differently and maps status sentences', () => {
    const list = [{ id: '1', title: 'b. Training course training on miki production' }]
    expect(matchActivity('b. Training course on miki production', list)?.id).toBe('1')
    expect(matchActivity('Janitorial Services', list)).toBeUndefined()
    expect(statusChoice('Obligated, PO document under assessment')).toBe('Obligated')
    expect(statusChoice('Accomplished')).toBe('Accomplished')
    expect(statusChoice('')).toBeNull()
  })
})

describe('numbering', () => {
  it('renumbers phases, activities, sub-activities and letters in order', () => {
    let s = sheetFromTemplate('WFP')
    s = pasteText(
      s,
      { r: 3, c: 0 },
      tsv([
        ['LFP-CRA'],
        ['Phase I: Initiation'],
        ['Phase 3: Testing'],
        ['', '2.1. No. of villages'],
        ['', '2.1.1.Expansion of composting', '', 'unit'],
        ['', '2.1.4. Field school', '', 'Number'],
        ['', '', '2.1.4.1. School in Abra'],
        ['', '', '3 grass cutter'],
        ['', '', '2.1.4.5. School in Apayao'],
        ['', 'New activity typed plainly', '', 'lot'],
        ['', '2.1.3. Trainings'],
        ['', 'a. Composting', '', 'Number'],
        ['', 'c. Potato', '', 'Number'],
        ['PMO'],
        ['', 'Office supplies', '', 'lot'],
      ]),
    ).sheet
    const out = renumberWfp(s, 'WFP', evalOf('WFP', s))
    const ev = evalOf('WFP', out)
    const col = (c: number) =>
      Array.from({ length: 15 }, (_, i) => ev.value('WFP', 3 + i, c)).filter(Boolean)
    expect(col(0)).toEqual(['LFP-CRA', 'Phase 1: Initiation', 'Phase 2: Testing', 'PMO'])
    expect(col(1)).toEqual([
      '2.1. No. of villages',
      '2.1.1. Expansion of composting',
      '2.1.2. Field school',
      '2.1.3. New activity typed plainly',
      '2.1.4. Trainings',
      'a. Composting',
      'b. Potato',
      'Office supplies',
    ])
    expect(col(2)).toEqual([
      '2.1.2.1. School in Abra',
      '3 grass cutter',
      '2.1.2.2. School in Apayao',
    ])
    // Running it again changes nothing.
    expect(renumberWfp(out, 'WFP', ev).cells).toEqual(out.cells)
  })

  it('totals the template columns and gives rows outline levels', () => {
    let s = sheetFromTemplate('WFP')
    s = pasteText(
      s,
      { r: 3, c: 0 },
      tsv([
        ['Phase 1'],
        ['', 'Training', '', 'Number', 1, 'Training Expense', 100000, 100000, 90000],
        ['', '', 'Day two', '', '', 'Supplies', 20000],
      ]),
    ).sheet
    s = typeInto(s, 5, 13, '5000')
    s = typeInto(s, 5, 14, 'TRUE')
    const ev = evalOf('WFP', s)
    expect(wfpTotals(s, 'WFP', ev)).toEqual({
      budget: 120000,
      forObligation: 100000,
      obligated: 90000,
      forDisbursement: 5000,
      disbursed: 5000,
    })
    expect(wfpOutline(s, 'WFP', ev).slice(0, 7)).toEqual([null, null, null, 0, 1, 2, 2])
  })
})
