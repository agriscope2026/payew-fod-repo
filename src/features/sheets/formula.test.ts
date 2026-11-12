import { describe, expect, it } from 'vitest'
import {
  evaluate,
  moveFormula,
  shiftFormula,
  SheetError,
  type EvalContext,
  type Scalar,
} from './formula'
import {
  blankSheet,
  createEvaluator,
  deleteRows,
  fillRange,
  insertRows,
  mergeRange,
  parseInput,
  pasteText,
  removeEmptyRows,
  setCells,
  textToNumbers,
  typeInto,
  type Sheet,
} from './model'

/** A context over a plain grid, A1 at [0][0]. */
const grid = (rows: Scalar[][], others: Record<string, Scalar[][]> = {}): EvalContext => ({
  cell: (sheet, r, c) => (sheet ? others[sheet] : rows)?.[r]?.[c] ?? null,
  size: (sheet) => {
    const g = sheet ? others[sheet] : rows
    return g ? { rows: g.length, cols: Math.max(...g.map((x) => x.length)) } : null
  },
})

const code = (v: Scalar) => (v instanceof SheetError ? v.code : v)

describe('formulas', () => {
  const g = grid([
    [10, 'Training', 2],
    [20, 'Supplies', 3],
    [null, 'Travel', 4],
  ])
  it('does arithmetic with Excel precedence', () => {
    expect(evaluate('1+2*3^2', g)).toBe(19)
    expect(evaluate('-A1+A2', g)).toBe(10)
    expect(evaluate('50%*A2', g)).toBe(10)
    expect(evaluate('(A1+A2)/C1', g)).toBe(15)
  })
  it('sums ranges and whole columns, skipping text and blanks', () => {
    expect(evaluate('SUM(A1:A3)', g)).toBe(30)
    expect(evaluate('SUM(A:A, C:C)', g)).toBe(39)
    expect(evaluate('SUM(A1:C3)', g)).toBe(39)
  })
  it('uses the function library', () => {
    expect(evaluate('ROUND(10/3, 2)', g)).toBe(3.33)
    expect(evaluate('VLOOKUP("Supplies", B1:C3, 2, FALSE)', g)).toBe(3)
    expect(evaluate('SUMIF(C1:C3, ">2", A1:A3)', g)).toBe(20)
    expect(evaluate('COUNTA(B:B)', g)).toBe(3)
    expect(evaluate('TEXT(1234.5, "#,##0.00")', g)).toBe('1,234.50')
  })
  it('handles conditional sums the Excel way', () => {
    const paid = grid([
      [100, true, 'Training'],
      [50, false, 'Travel'],
      [25, true, 'Training'],
      ['n/a', true, ''],
    ])
    expect(evaluate('SUMIF(B1:B4, TRUE, A1:A4)', paid)).toBe(125)
    expect(evaluate('SUMIF(A1:A4, ">=50")', paid)).toBe(150)
    expect(evaluate('SUMIFS(A1:A4, C1:C4, "Train*", B1:B4, TRUE)', paid)).toBe(125)
    expect(evaluate('COUNTIF(C1:C4, "<>")', paid)).toBe(3)
    expect(evaluate('COUNTIFS(B1:B4, TRUE)', paid)).toBe(3)
    // A referenced text cell is skipped, not an error.
    expect(evaluate('SUM(A1, A4, C1)', paid)).toBe(100)
  })
  it('compares and joins text', () => {
    expect(evaluate('IF(A1>15, "big", "small")', g)).toBe('small')
    expect(evaluate('B1&" - "&A1', g)).toBe('Training - 10')
    expect(evaluate('A3=0', g)).toBe(true)
    expect(evaluate('"abc"="ABC"', g)).toBe(true)
  })
  it('reports errors the Excel way', () => {
    expect(code(evaluate('A1/0', g))).toBe('#DIV/0!')
    expect(code(evaluate('B1+1', g))).toBe('#VALUE!')
    expect(code(evaluate('NOSUCH(1)', g))).toBe('#NAME?')
    expect(code(evaluate('SUM(1,', g))).toBe('#ERROR!')
    expect(evaluate('IFERROR(A1/0, 0)', g)).toBe(0)
    // IF evaluates only the branch it takes.
    expect(evaluate('IF(TRUE, 1, 1/0)', g)).toBe(1)
  })
  it('reads other sheets by name', () => {
    const ctx = grid([[1]], { ORS: [[100], [250]], "Budget '26": [[7]] })
    expect(evaluate('SUM(ORS!A:A)+A1', ctx)).toBe(351)
    expect(evaluate("'Budget ''26'!A1", ctx)).toBe(7)
    expect(code(evaluate('Missing!A1', ctx))).toBe('#REF!')
  })
})

describe('rewriting references', () => {
  it('moves relative parts only', () => {
    expect(moveFormula('A1+$B$1+$C1+D$1', 2, 1)).toBe('B3+$B$1+$C3+E$1')
    expect(moveFormula('SUM(A1:A9)', 1, 0)).toBe('SUM(A2:A10)')
    expect(moveFormula('A1', -1, 0)).toBe('#REF!')
    expect(moveFormula('"A1"&A1', 1, 0)).toBe('"A1"&A2')
  })
  it('follows inserted and deleted rows', () => {
    expect(shiftFormula('SUM(G2:G30)', 'row', 5, 2, 'WFP', true)).toBe('SUM(G2:G32)')
    expect(shiftFormula('G40', 'row', 5, 2, 'WFP', true)).toBe('G42')
    expect(shiftFormula('G3', 'row', 5, 2, 'WFP', true)).toBe('G3')
    expect(shiftFormula('G6+G9', 'row', 5, -2, 'WFP', true)).toBe('#REF!+G7')
    expect(shiftFormula('SUM(G2:G30)', 'row', 5, -2, 'WFP', true)).toBe('SUM(G2:G28)')
    expect(shiftFormula('ORS!H9', 'row', 5, 2, 'WFP', true)).toBe('ORS!H9')
    expect(shiftFormula('WFP!H9', 'row', 5, 2, 'WFP', false)).toBe('WFP!H11')
  })
})

describe('sheet edits', () => {
  const name = 'WFP'
  const at = (s: Sheet, r: number, c: number) =>
    createEvaluator({ sheets: new Map([[name, s]]) }).value(name, r, c)

  it('reads typed values', () => {
    expect(parseInput('1,234.50')).toEqual({ v: 1234.5 })
    expect(parseInput('₱ 500')).toEqual({ v: 500, fmt: 'peso' })
    expect(parseInput('12%')).toEqual({ v: 0.12, fmt: 'percent' })
    expect(parseInput('=A1*2')).toEqual({ f: 'A1*2' })
    expect(parseInput("'007")).toEqual({ v: '007', fmt: 'text' })
    expect(parseInput('2026-03-05').fmt).toBe('date')
    expect(parseInput('Training')).toEqual({ v: 'Training' })
  })
  it('keeps totals right when rows are inserted or deleted', () => {
    let s = blankSheet(6, 3)
    s = pasteText(s, { r: 0, c: 0 }, '10\n20\n30').sheet
    s = typeInto(s, 4, 0, '=SUM(A1:A3)')
    expect(at(s, 4, 0)).toBe(60)
    s = insertRows(s, 1, 1, name)
    s = typeInto(s, 1, 0, '5')
    expect(at(s, 5, 0)).toBe(65)
    s = deleteRows(s, 0, 1, name)
    expect(at(s, 4, 0)).toBe(55)
  })
  it('detects circular references', () => {
    const s = setCells(blankSheet(2, 2), [
      { r: 0, c: 0, cell: { f: 'B1' } },
      { r: 0, c: 1, cell: { f: 'A1+1' } },
    ])
    expect(code(at(s, 0, 0))).toBe('#CIRC!')
  })
  it('fills formulas and number series down', () => {
    let s = pasteText(blankSheet(6, 3), { r: 0, c: 0 }, '1\t5\n2\t6').sheet
    s = typeInto(s, 0, 2, '=A1*B1')
    s = fillRange(s, { r1: 0, c1: 0, r2: 1, c2: 1 }, { r1: 0, c1: 0, r2: 3, c2: 1 })
    s = fillRange(s, { r1: 0, c1: 2, r2: 0, c2: 2 }, { r1: 0, c1: 2, r2: 3, c2: 2 })
    expect([at(s, 3, 0), at(s, 3, 1), at(s, 3, 2)]).toEqual([4, 8, 32])
  })
  it('cleans up an uploaded table', () => {
    let s = pasteText(blankSheet(5, 2), { r: 0, c: 0 }, 'a\t"1,500.00"\n\t\nb\t₱ 20').sheet
    s = removeEmptyRows(s, name).sheet
    s = textToNumbers(s, { r1: 0, c1: 0, r2: 10, c2: 1 })
    expect(s.rows).toHaveLength(2)
    expect([at(s, 0, 1), at(s, 1, 1)]).toEqual([1500, 20])
  })
  it('keeps only the top-left value when merging', () => {
    let s = pasteText(blankSheet(2, 2), { r: 0, c: 0 }, 'Title\tx').sheet
    s = mergeRange(s, { r1: 0, c1: 0, r2: 0, c2: 1 })
    expect(s.merges).toHaveLength(1)
    expect([at(s, 0, 0), at(s, 0, 1)]).toEqual(['Title', null])
    expect(mergeRange(s, { r1: 0, c1: 0, r2: 0, c2: 0 }).merges).toHaveLength(0)
  })
})
