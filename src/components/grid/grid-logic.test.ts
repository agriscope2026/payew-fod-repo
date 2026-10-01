import { describe, expect, it } from 'vitest'
import {
  applyPaste,
  clearRange,
  copyRange,
  move,
  parseCell,
  parseTsv,
  type GridColumnSpec,
} from './grid-logic'

const cols: GridColumnSpec[] = [
  { key: 'description', type: 'text' },
  {
    key: 'unit',
    type: 'select',
    options: [
      { value: 'u1', label: 'lot' },
      { value: 'u2', label: 'piece' },
    ],
  },
  { key: 'qty', type: 'number' },
  { key: 'amount', type: 'number', readOnly: true },
]
type Row = {
  description: string | null
  unit: string | null
  qty: number | null
  amount: number | null
}
const blank = (): Row => ({ description: null, unit: null, qty: null, amount: null })

describe('parseCell', () => {
  it('parses accounting-style numbers', () => {
    expect(parseCell('₱1,234.50', cols[2])).toBe(1234.5)
    expect(parseCell('(500)', cols[2])).toBe(-500)
    expect(parseCell('12%', cols[2])).toBe(12)
    expect(parseCell('', cols[2])).toBeNull()
    expect(parseCell('abc', cols[2])).toBeUndefined()
  })

  it('matches selects by value, label or label prefix', () => {
    expect(parseCell('u2', cols[1])).toBe('u2')
    expect(parseCell('LOT', cols[1])).toBe('u1')
    expect(parseCell('pie', cols[1])).toBe('u2')
    expect(parseCell('box', cols[1])).toBeUndefined()
  })
})

describe('TSV', () => {
  it('reads Excel clipboard text including quoted cells', () => {
    expect(parseTsv('a\tb\r\nc\t"d\te"\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd\te'],
    ])
    expect(parseTsv('"say ""hi"""')).toEqual([['say "hi"']])
  })

  it('copies a range as display text', () => {
    const rows: Row[] = [{ description: 'Meals', unit: 'u1', qty: 40, amount: 14000 }]
    expect(copyRange(rows, cols, { start: { row: 0, col: 0 }, end: { row: 0, col: 2 } })).toBe(
      'Meals\tlot\t40',
    )
  })
})

describe('applyPaste', () => {
  it('pastes a block, adds rows, skips read-only and reports bad cells', () => {
    const res = applyPaste<Row>(
      [blank()],
      cols,
      parseTsv('Meals\tlot\t40\t999\nPrinting\tbox\tx\n'),
      { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      blank,
    )
    expect(res.rows).toEqual([
      { description: 'Meals', unit: 'u1', qty: 40, amount: null },
      { description: 'Printing', unit: null, qty: null, amount: null },
    ])
    expect(res.rejected).toEqual([
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ])
    expect(res.range.end).toEqual({ row: 1, col: 3 })
  })

  it('fills a selected range with a single copied value', () => {
    const res = applyPaste<Row>(
      [blank(), blank(), blank()],
      cols,
      [['5']],
      { start: { row: 0, col: 2 }, end: { row: 2, col: 2 } },
      blank,
    )
    expect(res.rows.map((r) => r.qty)).toEqual([5, 5, 5])
  })
})

describe('clearRange / move', () => {
  it('clears editable cells only and clamps movement', () => {
    const rows: Row[] = [{ description: 'Meals', unit: 'u1', qty: 40, amount: 14000 }]
    expect(clearRange(rows, cols, { start: { row: 0, col: 0 }, end: { row: 0, col: 3 } })).toEqual([
      { description: null, unit: null, qty: null, amount: 14000 },
    ])
    expect(move({ row: 0, col: 0 }, -1, -1, 3, 4)).toEqual({ row: 0, col: 0 })
    expect(move({ row: 2, col: 3 }, 1, 1, 3, 4)).toEqual({ row: 2, col: 3 })
  })
})
