import { describe, expect, it } from 'vitest'
import { isAllowedSheetHost, parseSheetId } from '@shared/sheets-core'
import {
  autoMapColumns,
  checkRows,
  columnIndex,
  columnLabels,
  columnLetter,
  detectLayout,
  extractRows,
  fitTemplate,
  matchOption,
  parseDate,
  rowToPayload,
  standardTemplate,
  type ImportField,
  type ImportTemplate,
  type OptionLists,
  type SheetTab,
} from './import-core'

const options: OptionLists = {
  expense_classes: [
    { value: 'ec-co', label: 'CO', keys: ['CO', 'Capital Outlay'] },
    { value: 'ec-mooe', label: 'MOOE', keys: ['MOOE', 'Maintenance and Other Operating Expenses'] },
  ],
}

const fields: ImportField[] = [
  { key: 'description', label: 'Particulars *', type: 'text', required: true },
  { key: 'expense_class_id', label: 'Expense class', type: 'select', options: 'expense_classes' },
  { key: 'amount', label: 'Amount', type: 'number' },
  { key: 'remarks', label: 'Remarks', type: 'text' },
]

const template: ImportTemplate = {
  target: 'WFP',
  name: 't',
  header_row: 1,
  data_row: 2,
  columns: [
    { field: 'description', label: 'Particulars *', source: 'A', fillDown: true, mustHave: true },
    {
      field: 'expense_class_id',
      label: 'Expense class',
      source: 'B',
      fallback: 'MOOE',
      mustHave: true,
    },
    { field: 'amount', label: 'Amount', source: 'C', multiplier: 1000, mustHave: true },
    { field: 'custom:Source', label: 'Source', source: 'D' },
  ],
}

const tab = (rows: unknown[][], merges: SheetTab['merges'] = []): SheetTab => ({
  name: 'S',
  hidden: false,
  rows,
  merges,
})

describe('sheet links', () => {
  const id = '1AWoNwmteIqgWtMohDzdCTBiMT858jFCde6jh1PyMRp0'
  it('reads the id from normal share links', () => {
    expect(parseSheetId(`https://docs.google.com/spreadsheets/d/${id}/edit?gid=1#gid=1`)).toBe(id)
    expect(parseSheetId(`https://docs.google.com/spreadsheets/u/0/d/${id}/edit`)).toBe(id)
  })
  it('refuses anything that is not a Google Sheets https link', () => {
    expect(parseSheetId(`http://docs.google.com/spreadsheets/d/${id}`)).toBeNull()
    expect(parseSheetId(`https://docs.google.com.evil.test/spreadsheets/d/${id}`)).toBeNull()
    expect(
      parseSheetId(`https://evil.test/?u=https://docs.google.com/spreadsheets/d/${id}`),
    ).toBeNull()
    expect(parseSheetId('not a link')).toBeNull()
  })
  it('only follows redirects through Google hosts', () => {
    expect(isAllowedSheetHost('doc-0-sheets.googleusercontent.com')).toBe(true)
    expect(isAllowedSheetHost('googleusercontent.com.evil.test')).toBe(false)
    expect(isAllowedSheetHost('169.254.169.254')).toBe(false)
  })
})

describe('columns', () => {
  it('converts letters both ways', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(26)).toBe('AA')
    expect(columnIndex('AW')).toBe(48)
    expect(columnLetter(columnIndex('AQ'))).toBe('AQ')
  })
  it('combines multi-row headers and repeats merged cells', () => {
    const t = tab(
      [
        ['Title', 'Budget', '', ''],
        ['', 'MOOE', 'CO', 'Total'],
        ['A row', 1, 2, 3],
      ],
      [{ s: { r: 0, c: 1 }, e: { r: 0, c: 3 } }],
    )
    expect(detectLayout(t)).toEqual({ header_row: 1, data_row: 3 })
    expect(columnLabels(t, 1, 3).map((c) => c.label)).toEqual([
      'Title',
      'Budget › MOOE',
      'Budget › CO',
      'Budget › Total',
    ])
  })
  it('maps columns from header names and aliases', () => {
    const mapped = autoMapColumns(fields, [
      { letter: 'A', label: 'Particulars' },
      { letter: 'C', label: 'Budget › Remarks' },
    ])
    expect(mapped.map((c) => [c.field, c.source, !!c.mustHave])).toEqual([
      ['description', 'A', true],
      ['remarks', 'C', false],
    ])
  })
  it('finds columns by name in a downloaded template, even when reordered', () => {
    const standard = standardTemplate('WFP', fields)
    const fitted = fitTemplate(
      standard,
      tab([['Amount', 'Remarks', 'Particulars', 'Expense class']]),
    )
    expect(fitted.columns.find((c) => c.field === 'amount')?.source).toBe('A')
    expect(fitted.columns.find((c) => c.field === 'description')?.source).toBe('C')
  })
  it('keeps column letters for a form whose headers differ', () => {
    expect(fitTemplate(template, tab([['MFO', 'x', 'y', 'z']]))).toBe(template)
  })
})

describe('reading rows', () => {
  it('keeps line items only: no subtotals, totals or signature blocks', () => {
    const rows = extractRows(
      tab([
        ['header'],
        ['Phase 2 subtotal', '', 1000, ''],
        ['2.1 Heading only', '', '', ''],
        ['Vermi-composting', 'CO: Other Structure', 1000, 'LFP'],
        ['', 'Travelling Expenses', 72, 'LFP'],
        ['Prepared by :', 'Reviewed by:', '', ''],
        ['JUAN DELA CRUZ', '', '', ''],
        ['TOTAL', 'MOOE', 1072, ''],
        ['Phase 3 item', 'Training Expense', 40.5, ''],
      ]),
      template,
      fields,
      options,
    )
    expect(rows.map((r) => [r.description, r.expense_class_id, r.amount])).toEqual([
      ['Vermi-composting', 'ec-co', 1000000],
      ['Vermi-composting', 'ec-mooe', 72000],
      ['Phase 3 item', 'ec-mooe', 40500],
    ])
    expect(rows[0]._row).toBe(4)
  })
  it('rolls detail and heading amounts into line items, counting only ticked rows', () => {
    const fields: ImportField[] = [
      { key: 'description', label: 'Particulars *', type: 'text', required: true },
      { key: 'object', label: 'Object', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'obligated', label: 'Obligated', type: 'number' },
      { key: 'disbursed', label: 'Disbursed', type: 'number' },
    ]
    const monitoring: ImportTemplate = {
      target: 'WFP',
      name: 'm',
      header_row: 1,
      data_row: 2,
      columns: [
        { field: 'description', label: 'P', source: 'A', fillDown: true, mustHave: true },
        { field: 'object', label: 'O', source: 'B', mustHave: true, notNumber: true },
        { field: 'amount', label: 'A', source: 'C', mustHave: true },
        { field: 'obligated', label: 'K', source: 'D', rollUp: true },
        { field: 'disbursed', label: 'D', source: 'E', rollUp: true, whenTrue: 'F' },
      ],
    }
    const rows = extractRows(
      tab([
        ['header'],
        ['Item one', 'Training', 100, 90, 10, true],
        ['', 500, '', '', 20, 'TRUE'],
        ['', '', '', '', 40, false],
        ['', '', '', '', 5, true, 'Approved'],
        ['Parent with subtotal', 777, 300, 250, '', ''],
        ['', 'Travel', 200, '', '', ''],
      ]),
      monitoring,
      fields,
      {},
    )
    expect(rows.map((r) => [r.amount, r.obligated, r.disbursed])).toEqual([
      [100, 90, 35],
      [200, 250, null],
    ])
  })
  it('matches codes at the start of a value but not inside a word', () => {
    expect(matchOption('CO: Other Structure', options.expense_classes)?.value).toBe('ec-co')
    expect(matchOption('Cooperative support', options.expense_classes)).toBeUndefined()
  })
  it('reads dates in the common formats', () => {
    expect(parseDate('2026-03-05')).toBe('2026-03-05')
    expect(parseDate('3/5/2026')).toBe('2026-03-05')
    expect(parseDate('March 5, 2026')).toBe('2026-03-05')
    expect(parseDate(46086)).toBe('2026-03-05')
    expect(parseDate('')).toBeNull()
    expect(parseDate('2026-13-01')).toBeUndefined()
  })
})

describe('checking and saving', () => {
  const row = (extra: Record<string, unknown>) => ({ _key: 'k', _raw: {}, ...extra })
  it('requires required fields and reports unrecognized values', () => {
    const [missing, unknown] = checkRows(
      [
        row({ description: null }),
        row({ description: 'x', expense_class_id: null, _raw: { expense_class_id: 'XX' } }),
      ],
      fields,
    )
    expect(missing.errors).toEqual(['Particulars is required'])
    expect(unknown.errors).toEqual([])
    expect(unknown.warnings[0]).toContain('"XX"')
  })
  it('flags duplicates in the batch and against existing records', () => {
    const unique: ImportField[] = [
      { key: 'ors_no', label: 'ORS No. *', type: 'text', required: true, unique: 'error' },
    ]
    const res = checkRows(
      [row({ ors_no: 'A-1' }), row({ ors_no: 'a 1' }), row({ ors_no: 'B-2' })],
      unique,
      { ors_no: new Set(['b 2']) },
    )
    expect(res[0].errors).toEqual([])
    expect(res[1].errors[0]).toContain('repeats row 1')
    expect(res[2].errors[0]).toContain('already exists')
  })
  it('writes extra columns into the notes field', () => {
    const payload = rowToPayload(
      row({ description: 'x', remarks: 'Awarded', 'custom:Source': 'LFP-CRA', amount: 5 }),
      fields,
      template.columns,
      'remarks',
    )
    expect(payload).toEqual({ description: 'x', amount: 5, remarks: 'Awarded · Source: LFP-CRA' })
  })
})
