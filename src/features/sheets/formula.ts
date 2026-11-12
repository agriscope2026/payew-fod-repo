// Formula language: tokenizer, parser, evaluator and reference rewriting.
// Excel syntax: =SUM(A1:B5)*2, =IF(C2>0,"Yes","No"), =SUM(ORS!H:H), $A$1 absolute refs.
// No React here, so it is unit-tested.
import * as formulajs from '@formulajs/formulajs'

export type ErrorCode =
  '#VALUE!' | '#REF!' | '#DIV/0!' | '#NAME?' | '#N/A' | '#NUM!' | '#NULL!' | '#CIRC!' | '#ERROR!'

const ERROR_CODES: ErrorCode[] = [
  '#VALUE!',
  '#REF!',
  '#DIV/0!',
  '#NAME?',
  '#N/A',
  '#NUM!',
  '#NULL!',
  '#CIRC!',
  '#ERROR!',
]

/** A spreadsheet error value. Extends Error so formula.js recognizes it. */
export class SheetError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode) {
    super(code)
    this.code = code
  }
}

export type Scalar = number | string | boolean | null | SheetError
export type Matrix = Scalar[][]
type Value = Scalar | Matrix

export const isError = (v: unknown): v is SheetError => v instanceof SheetError

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------
export function colName(index: number) {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

export function colIndex(letters: string) {
  return (
    letters
      .toUpperCase()
      .split('')
      .reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0) - 1
  )
}

export const cellName = (r: number, c: number) => `${colName(c)}${r + 1}`

/** A reference as written: a cell, a cell range, whole columns or whole rows (0-based). */
export interface RefParts {
  sheet?: string
  kind: 'cells' | 'cols' | 'rows'
  r1: number
  c1: number
  r2: number
  c2: number
  abs: { r1: boolean; c1: boolean; r2: boolean; c2: boolean }
  /** A single cell, not a range. */
  single: boolean
}

const SHEET_PREFIX = /^(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))!/
const CELL = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/
const COL = /^(\$?)([A-Za-z]{1,3})/
const ROW = /^(\$?)(\d{1,7})/

/** Reads a reference at the start of `s`; returns it and its length. */
function readRef(s: string): { ref: RefParts; length: number } | null {
  let rest = s
  let sheet: string | undefined
  const prefix = SHEET_PREFIX.exec(rest)
  if (prefix) {
    sheet = prefix[1] !== undefined ? prefix[1].replace(/''/g, "'") : prefix[2]
    rest = rest.slice(prefix[0].length)
  }
  const used = () => s.length - rest.length
  const a = CELL.exec(rest)
  if (a) {
    rest = rest.slice(a[0].length)
    const r1 = Number(a[4]) - 1
    const c1 = colIndex(a[2])
    const b = rest.startsWith(':') ? CELL.exec(rest.slice(1)) : null
    if (b) rest = rest.slice(1 + b[0].length)
    if (/^[\w(.]/.test(rest)) return null
    if (r1 < 0) return null
    const r2 = b ? Number(b[4]) - 1 : r1
    const c2 = b ? colIndex(b[2]) : c1
    return {
      ref: {
        sheet,
        kind: 'cells',
        r1,
        c1,
        r2,
        c2,
        single: !b,
        abs: { c1: !!a[1], r1: !!a[3], c2: b ? !!b[1] : !!a[1], r2: b ? !!b[3] : !!a[3] },
      },
      length: used(),
    }
  }
  const col = COL.exec(rest)
  if (col && rest[col[0].length] === ':') {
    const col2 = COL.exec(rest.slice(col[0].length + 1))
    const after = col2 ? rest.slice(col[0].length + 1 + col2[0].length) : ''
    if (col2 && !/^[\w(.]/.test(after)) {
      rest = after
      return {
        ref: {
          sheet,
          kind: 'cols',
          r1: 0,
          r2: 0,
          c1: colIndex(col[2]),
          c2: colIndex(col2[2]),
          single: false,
          abs: { c1: !!col[1], c2: !!col2[1], r1: false, r2: false },
        },
        length: used(),
      }
    }
  }
  const row = ROW.exec(rest)
  if (row && rest[row[0].length] === ':') {
    const row2 = ROW.exec(rest.slice(row[0].length + 1))
    const after = row2 ? rest.slice(row[0].length + 1 + row2[0].length) : ''
    if (row2 && !/^[\w(.]/.test(after) && Number(row[2]) > 0 && Number(row2[2]) > 0) {
      rest = after
      return {
        ref: {
          sheet,
          kind: 'rows',
          r1: Number(row[2]) - 1,
          r2: Number(row2[2]) - 1,
          c1: 0,
          c2: 0,
          single: false,
          abs: { r1: !!row[1], r2: !!row2[1], c1: false, c2: false },
        },
        length: used(),
      }
    }
  }
  return null
}

const quoteSheet = (name: string) =>
  /^[A-Za-z_][\w.]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`

export function refToString(ref: RefParts) {
  const sheet = ref.sheet ? `${quoteSheet(ref.sheet)}!` : ''
  const d = (abs: boolean) => (abs ? '$' : '')
  if (ref.kind === 'cols') {
    return `${sheet}${d(ref.abs.c1)}${colName(ref.c1)}:${d(ref.abs.c2)}${colName(ref.c2)}`
  }
  if (ref.kind === 'rows') {
    return `${sheet}${d(ref.abs.r1)}${ref.r1 + 1}:${d(ref.abs.r2)}${ref.r2 + 1}`
  }
  const first = `${d(ref.abs.c1)}${colName(ref.c1)}${d(ref.abs.r1)}${ref.r1 + 1}`
  if (ref.single) return sheet + first
  return `${sheet}${first}:${d(ref.abs.c2)}${colName(ref.c2)}${d(ref.abs.r2)}${ref.r2 + 1}`
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
type Token =
  | { t: 'num'; v: number; s: number; e: number }
  | { t: 'str'; v: string; s: number; e: number }
  | { t: 'bool'; v: boolean; s: number; e: number }
  | { t: 'err'; v: ErrorCode; s: number; e: number }
  | { t: 'ref'; v: RefParts; s: number; e: number }
  | { t: 'func'; v: string; s: number; e: number }
  | { t: 'op'; v: string; s: number; e: number }
  | { t: 'paren'; v: '(' | ')'; s: number; e: number }
  | { t: 'sep'; v: ','; s: number; e: number }

export function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    const rest = src.slice(i)
    if (ch === '"') {
      let j = i + 1
      let v = ''
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            v += '"'
            j += 2
            continue
          }
          break
        }
        v += src[j++]
      }
      if (j >= src.length) throw new SheetError('#ERROR!')
      out.push({ t: 'str', v, s: i, e: j + 1 })
      i = j + 1
      continue
    }
    if (ch === '#') {
      const code = ERROR_CODES.find((c) => rest.toUpperCase().startsWith(c))
      if (!code) throw new SheetError('#ERROR!')
      out.push({ t: 'err', v: code, s: i, e: i + code.length })
      i += code.length
      continue
    }
    const ref = readRef(rest)
    if (ref) {
      out.push({ t: 'ref', v: ref.ref, s: i, e: i + ref.length })
      i += ref.length
      continue
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(rest)
    if (num) {
      out.push({ t: 'num', v: Number(num[0]), s: i, e: i + num[0].length })
      i += num[0].length
      continue
    }
    const word = /^[A-Za-z_][\w.]*/.exec(rest)
    if (word) {
      const upper = word[0].toUpperCase()
      const end = i + word[0].length
      if (src.slice(end).trimStart().startsWith('(')) {
        out.push({ t: 'func', v: upper, s: i, e: end })
      } else if (upper === 'TRUE' || upper === 'FALSE') {
        out.push({ t: 'bool', v: upper === 'TRUE', s: i, e: end })
      } else {
        throw new SheetError('#NAME?')
      }
      i = end
      continue
    }
    const op = /^(<>|<=|>=|[-+*/^&=<>%])/.exec(rest)
    if (op) {
      out.push({ t: 'op', v: op[0], s: i, e: i + op[0].length })
      i += op[0].length
      continue
    }
    if (ch === '(' || ch === ')') {
      out.push({ t: 'paren', v: ch, s: i, e: i + 1 })
      i++
      continue
    }
    if (ch === ',' || ch === ';') {
      out.push({ t: 'sep', v: ',', s: i, e: i + 1 })
      i++
      continue
    }
    throw new SheetError('#ERROR!')
  }
  return out
}

/** Rewrites every reference in a formula (without the "="); null makes it #REF!. */
export function rewriteRefs(formula: string, fn: (ref: RefParts) => RefParts | null) {
  let tokens: Token[]
  try {
    tokens = tokenize(formula)
  } catch {
    return formula
  }
  let out = ''
  let at = 0
  for (const tok of tokens) {
    if (tok.t !== 'ref') continue
    const next = fn(tok.v)
    out += formula.slice(at, tok.s) + (next ? refToString(next) : '#REF!')
    at = tok.e
  }
  return out + formula.slice(at)
}

/** Shifts relative parts of references, as when copying a formula dr rows and dc columns away. */
export function moveFormula(formula: string, dr: number, dc: number) {
  if (!dr && !dc) return formula
  return rewriteRefs(formula, (ref) => {
    const next = { ...ref, abs: { ...ref.abs } }
    if (ref.kind !== 'cols') {
      if (!ref.abs.r1) next.r1 += dr
      if (!ref.abs.r2) next.r2 += dr
    }
    if (ref.kind !== 'rows') {
      if (!ref.abs.c1) next.c1 += dc
      if (!ref.abs.c2) next.c2 += dc
    }
    if (next.r1 < 0 || next.r2 < 0 || next.c1 < 0 || next.c2 < 0) return null
    return next
  })
}

/**
 * Adjusts references after rows or columns are inserted (count > 0) or deleted
 * (count < 0) at `at`, for references into the sheet named `sheetName`.
 */
export function shiftFormula(
  formula: string,
  axis: 'row' | 'col',
  at: number,
  count: number,
  sheetName: string,
  ownSheet: boolean,
) {
  return rewriteRefs(formula, (ref) => {
    const sameSheet = ref.sheet ? ref.sheet.toLowerCase() === sheetName.toLowerCase() : ownSheet
    if (!sameSheet) return ref
    if ((axis === 'row' && ref.kind === 'cols') || (axis === 'col' && ref.kind === 'rows'))
      return ref
    const [k1, k2] = axis === 'row' ? (['r1', 'r2'] as const) : (['c1', 'c2'] as const)
    let a = ref[k1]
    let b = ref[k2]
    if (count > 0) {
      if (a >= at) a += count
      if (b >= at) b += count
    } else {
      const n = -count
      const end = at + n
      const fix = (v: number, isEnd: boolean) =>
        v < at ? v : v >= end ? v - n : isEnd ? at - 1 : at
      if (a >= at && b < end) return null
      a = fix(a, false)
      b = fix(b, true)
      if (b < a) return null
    }
    return { ...ref, [k1]: a, [k2]: b }
  })
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------
type Node =
  | { k: 'lit'; v: Scalar }
  | { k: 'ref'; ref: RefParts }
  | { k: 'call'; name: string; args: Node[] }
  | { k: 'un'; op: string; x: Node }
  | { k: 'pct'; x: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }

const PRECEDENCE: Record<string, number> = {
  '=': 1,
  '<>': 1,
  '<': 1,
  '>': 1,
  '<=': 1,
  '>=': 1,
  '&': 2,
  '+': 3,
  '-': 3,
  '*': 4,
  '/': 4,
  '^': 5,
}

export function parse(formula: string): Node {
  const tokens = tokenize(formula)
  let i = 0
  const peek = () => tokens[i]
  const fail = (): never => {
    throw new SheetError('#ERROR!')
  }

  const primary = (): Node => {
    const tok = tokens[i++]
    if (!tok) return fail()
    switch (tok.t) {
      case 'num':
      case 'str':
      case 'bool':
        return { k: 'lit', v: tok.v }
      case 'err':
        return { k: 'lit', v: new SheetError(tok.v) }
      case 'ref':
        return { k: 'ref', ref: tok.v }
      case 'op':
        if (tok.v === '-' || tok.v === '+') return { k: 'un', op: tok.v, x: postfix(primary()) }
        return fail()
      case 'paren': {
        if (tok.v !== '(') return fail()
        const x = expr(0)
        if (peek()?.t !== 'paren' || peek()?.v !== ')') return fail()
        i++
        return x
      }
      case 'func': {
        i++ // "("
        const args: Node[] = []
        if (peek()?.t === 'paren' && peek()?.v === ')') {
          i++
          return { k: 'call', name: tok.v, args }
        }
        for (;;) {
          // An empty argument, as in IF(A1,,1), is a blank.
          if (peek()?.t === 'sep' || (peek()?.t === 'paren' && peek()?.v === ')')) {
            args.push({ k: 'lit', v: null })
          } else {
            args.push(expr(0))
          }
          const next = tokens[i++]
          if (next?.t === 'sep') continue
          if (next?.t === 'paren' && next.v === ')') break
          return fail()
        }
        return { k: 'call', name: tok.v, args }
      }
      default:
        return fail()
    }
  }
  const postfix = (x: Node): Node => {
    let node = x
    while (peek()?.t === 'op' && peek()?.v === '%') {
      i++
      node = { k: 'pct', x: node }
    }
    return node
  }
  const expr = (min: number): Node => {
    let left = postfix(primary())
    for (;;) {
      const tok = peek()
      if (tok?.t !== 'op' || tok.v === '%') break
      const p = PRECEDENCE[tok.v]
      if (p === undefined || p < min) break
      i++
      // ^ is left-associative in Excel, like the others.
      const right = expr(p + 1)
      left = { k: 'bin', op: tok.v, a: left, b: right }
    }
    return left
  }

  const node = expr(0)
  if (i < tokens.length) fail()
  return node
}

const parseCache = new Map<string, Node | SheetError>()
function parseCached(formula: string) {
  let hit = parseCache.get(formula)
  if (!hit) {
    try {
      hit = parse(formula)
    } catch (e) {
      hit = e instanceof SheetError ? e : new SheetError('#ERROR!')
    }
    if (parseCache.size > 5000) parseCache.clear()
    parseCache.set(formula, hit)
  }
  return hit
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------
export interface EvalContext {
  /** Value of a cell; `sheet` is undefined for the formula's own sheet. */
  cell(sheet: string | undefined, r: number, c: number): Scalar
  /** Rows and columns in use, for whole-row and whole-column ranges. */
  size(sheet: string | undefined): { rows: number; cols: number } | null
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
export const dateToSerial = (d: Date) =>
  (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EXCEL_EPOCH) / 86400000 +
  (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400
export const serialToDate = (n: number) => new Date(EXCEL_EPOCH + Math.round(n * 86400000))

function toNumber(v: Scalar): number {
  if (v instanceof SheetError) throw v
  if (v === null || v === '') return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = Number(v.replace(/[,₱\s]/g, ''))
  if (v.trim() === '' || !Number.isFinite(n)) throw new SheetError('#VALUE!')
  return n
}

export function toText(v: Scalar): string {
  if (v instanceof SheetError) throw v
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(Number(v.toPrecision(15)))
  return v
}

function toBool(v: Scalar): boolean {
  if (v instanceof SheetError) throw v
  if (typeof v === 'string') {
    const u = v.trim().toUpperCase()
    if (u === 'TRUE') return true
    if (u === 'FALSE') return false
    throw new SheetError('#VALUE!')
  }
  return !!v
}

function compare(a: Scalar, b: Scalar): number {
  if (a instanceof SheetError) throw a
  if (b instanceof SheetError) throw b
  const rank = (v: Scalar) => (typeof v === 'boolean' ? 2 : typeof v === 'string' ? 1 : 0)
  // A blank equals 0, "" and FALSE depending on the other side.
  const x = a === null ? (typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0) : a
  const y = b === null ? (typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0) : b
  if (rank(x) !== rank(y)) return rank(x) - rank(y)
  if (typeof x === 'string' && typeof y === 'string') {
    return x.localeCompare(y, undefined, { sensitivity: 'accent' })
  }
  return Number(x) - Number(y)
}

const scalar = (v: Value): Scalar => {
  if (!Array.isArray(v)) return v
  return v[0]?.[0] ?? null
}

function fromLibrary(result: unknown): Value {
  if (result instanceof SheetError) return result
  if (result instanceof Error) {
    const code = ERROR_CODES.find((c) => c === result.message)
    return new SheetError(code ?? '#VALUE!')
  }
  if (result instanceof Date) {
    return Number.isNaN(result.getTime()) ? new SheetError('#VALUE!') : dateToSerial(result)
  }
  if (typeof result === 'number') return Number.isFinite(result) ? result : new SheetError('#NUM!')
  if (Array.isArray(result)) {
    return (Array.isArray(result[0]) ? result : [result]).map((row: unknown[]) =>
      row.map((x) => scalar(fromLibrary(x))),
    )
  }
  if (result === undefined) return null
  if (typeof result === 'string' || typeof result === 'boolean' || result === null) return result
  return new SheetError('#VALUE!')
}

const library = formulajs as unknown as Record<string, unknown>
function libraryFunction(name: string): ((...a: unknown[]) => unknown) | undefined {
  let fn: unknown = library[name]
  if (fn === undefined && name.includes('.')) {
    fn = name
      .split('.')
      .reduce<unknown>((o, part) => (o as Record<string, unknown>)?.[part], library)
  }
  if (fn === undefined) fn = library[name.replace(/\./g, '')]
  return typeof fn === 'function' ? (fn as (...a: unknown[]) => unknown) : undefined
}

/** Functions PAYEW knows, for autocomplete and help. */
export function functionNames() {
  return [
    ...new Set([
      ...Object.keys(OWN),
      ...Object.keys(library).filter(
        (k) => /^[A-Z][A-Z0-9.]*$/.test(k) && typeof library[k] === 'function',
      ),
    ]),
  ].sort()
}

type Evaluate = (node: Node) => Value

const asMatrix = (v: Value): Matrix => (Array.isArray(v) ? v : [[v]])

/** Excel criteria such as 5, TRUE, ">=1000", "<>", "Train*". */
function criteria(c: Scalar): (v: Scalar) => boolean {
  if (c instanceof SheetError) return () => false
  if (typeof c === 'number' || typeof c === 'boolean') {
    return (v) =>
      typeof c === 'boolean' ? v === c : typeof v === 'number' ? v === c : toNumberSafe(v) === c
  }
  const text = c ?? ''
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(text)!
  const op = m[1] ?? '='
  const operand = m[2]
  const n = operand.trim() === '' ? NaN : Number(operand.replace(/,/g, ''))
  if (op !== '=' && op !== '<>' && Number.isNaN(n)) {
    return (v) =>
      typeof v === 'string' &&
      cmp(op, v.localeCompare(operand, undefined, { sensitivity: 'accent' }))
  }
  if (!Number.isNaN(n)) {
    return (v) => {
      const x = typeof v === 'number' ? v : toNumberSafe(v)
      if (x === null) return op === '<>'
      return cmp(op, x - n)
    }
  }
  const upper = operand.toUpperCase()
  if (upper === 'TRUE' || upper === 'FALSE') {
    const want = upper === 'TRUE'
    return (v) => (op === '<>' ? v !== want : v === want)
  }
  if (operand === '') return (v) => (op === '<>' ? v !== null && v !== '' : v === null || v === '')
  // * matches any text, ? one character, and ~ makes the next one literal.
  let source = ''
  for (let i = 0; i < operand.length; i++) {
    const ch = operand[i]
    if (ch === '~' && i + 1 < operand.length) source += escapeRegex(operand[++i])
    else if (ch === '*') source += '.*'
    else if (ch === '?') source += '.'
    else source += escapeRegex(ch)
  }
  const pattern = new RegExp(`^${source}$`, 'is')
  return (v) => {
    const hit = v !== null && !(v instanceof SheetError) && pattern.test(toText(v))
    return op === '<>' ? !hit : hit
  }
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function toNumberSafe(v: Scalar): number | null {
  if (typeof v === 'number') return v
  if (typeof v !== 'string' || v.trim() === '') return null
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

const cmp = (op: string, d: number) =>
  op === '='
    ? d === 0
    : op === '<>'
      ? d !== 0
      : op === '<'
        ? d < 0
        : op === '>'
          ? d > 0
          : op === '<='
            ? d <= 0
            : d >= 0

/** SUMIFS/COUNTIFS: pairs of range and criteria after `offset` value arguments. */
function conditional(
  args: Node[],
  ev: Evaluate,
  offset: number,
  reduce: (values: number[]) => Value,
): Value {
  const values = offset ? asMatrix(ev(args[0])) : null
  const pairs: { range: Matrix; test: (v: Scalar) => boolean }[] = []
  for (let i = offset; i + 1 < args.length; i += 2) {
    pairs.push({ range: asMatrix(ev(args[i])), test: criteria(scalar(ev(args[i + 1]))) })
  }
  if (!pairs.length) return new SheetError('#N/A')
  const base = pairs[0].range
  const out: number[] = []
  base.forEach((row, i) =>
    row.forEach((_, j) => {
      if (!pairs.every((p) => p.test(p.range[i]?.[j] ?? null))) return
      if (values) {
        const v = values[i]?.[j]
        if (typeof v === 'number') out.push(v)
      } else out.push(1)
    }),
  )
  return reduce(out)
}

// Functions that must not evaluate every argument, or that formula.js handles differently.
const OWN: Record<string, (args: Node[], ev: Evaluate) => Value> = {
  IF: (args, ev) => {
    if (args.length < 2 || args.length > 3) return new SheetError('#N/A')
    const cond = scalar(ev(args[0]))
    if (cond instanceof SheetError) return cond
    if (toBool(cond)) return ev(args[1])
    return args[2] ? ev(args[2]) : false
  },
  IFERROR: (args, ev) => {
    const v = scalar(ev(args[0]))
    return v instanceof SheetError ? ev(args[1] ?? { k: 'lit', v: '' }) : v
  },
  IFNA: (args, ev) => {
    const v = scalar(ev(args[0]))
    return v instanceof SheetError && v.code === '#N/A' ? ev(args[1] ?? { k: 'lit', v: '' }) : v
  },
  IFS: (args, ev) => {
    for (let i = 0; i + 1 < args.length; i += 2) {
      const cond = scalar(ev(args[i]))
      if (cond instanceof SheetError) return cond
      if (toBool(cond)) return ev(args[i + 1])
    }
    return new SheetError('#N/A')
  },
  SUMIF: (args, ev) => {
    const range = asMatrix(ev(args[0]))
    const sums = args[2] ? asMatrix(ev(args[2])) : range
    const test = criteria(scalar(ev(args[1])))
    let total = 0
    range.forEach((row, i) =>
      row.forEach((x, j) => {
        const v = sums[i]?.[j]
        if (test(x) && typeof v === 'number') total += v
      }),
    )
    return total
  },
  SUMIFS: (args, ev) => conditional(args, ev, 1, (values) => values.reduce((a, b) => a + b, 0)),
  AVERAGEIFS: (args, ev) =>
    conditional(args, ev, 1, (values) =>
      values.length ? values.reduce((a, b) => a + b, 0) / values.length : new SheetError('#DIV/0!'),
    ),
  AVERAGEIF: (args, ev) => {
    const range = asMatrix(ev(args[0]))
    const avg = args[2] ? asMatrix(ev(args[2])) : range
    const test = criteria(scalar(ev(args[1])))
    const values: number[] = []
    range.forEach((row, i) =>
      row.forEach((x, j) => {
        const v = avg[i]?.[j]
        if (test(x) && typeof v === 'number') values.push(v)
      }),
    )
    return values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : new SheetError('#DIV/0!')
  },
  COUNTIF: (args, ev) => {
    const test = criteria(scalar(ev(args[1])))
    return asMatrix(ev(args[0])).flat().filter(test).length
  },
  COUNTIFS: (args, ev) => conditional(args, ev, 0, (values) => values.length),
  SUM: (args, ev) => {
    let total = 0
    for (const arg of args) {
      // Text in a referenced cell is skipped; text typed into the formula must be a number.
      const v = arg.k === 'ref' ? asMatrix(ev(arg)) : ev(arg)
      if (Array.isArray(v)) {
        for (const row of v)
          for (const x of row) {
            if (x instanceof SheetError) return x
            if (typeof x === 'number') total += x
          }
      } else {
        total += toNumber(v)
      }
    }
    return total
  },
  TODAY: () => Math.floor(dateToSerial(new Date())),
  NOW: () => dateToSerial(new Date()),
}

export function evaluate(formula: string, ctx: EvalContext): Scalar {
  const root = parseCached(formula)
  if (root instanceof SheetError) return root

  const rangeOf = (ref: RefParts): Matrix => {
    const size = ctx.size(ref.sheet)
    if (!size) throw new SheetError('#REF!')
    const r1 = ref.kind === 'cols' ? 0 : Math.min(ref.r1, ref.r2)
    const r2 = ref.kind === 'cols' ? size.rows - 1 : Math.max(ref.r1, ref.r2)
    const c1 = ref.kind === 'rows' ? 0 : Math.min(ref.c1, ref.c2)
    const c2 = ref.kind === 'rows' ? size.cols - 1 : Math.max(ref.c1, ref.c2)
    if ((r2 - r1 + 1) * (c2 - c1 + 1) > 2_000_000) throw new SheetError('#NUM!')
    const out: Matrix = []
    for (let r = r1; r <= r2; r++) {
      const row: Scalar[] = []
      for (let c = c1; c <= c2; c++) row.push(ctx.cell(ref.sheet, r, c))
      out.push(row)
    }
    return out
  }

  const ev: Evaluate = (node) => {
    switch (node.k) {
      case 'lit':
        return node.v
      case 'ref':
        if (ref1(node.ref)) {
          if (!ctx.size(node.ref.sheet)) return new SheetError('#REF!')
          return ctx.cell(node.ref.sheet, node.ref.r1, node.ref.c1)
        }
        return rangeOf(node.ref)
      case 'un': {
        const x = toNumber(scalar(ev(node.x)))
        return node.op === '-' ? -x : x
      }
      case 'pct':
        return toNumber(scalar(ev(node.x))) / 100
      case 'bin': {
        const a = scalar(ev(node.a))
        const b = scalar(ev(node.b))
        switch (node.op) {
          case '+':
            return toNumber(a) + toNumber(b)
          case '-':
            return toNumber(a) - toNumber(b)
          case '*':
            return toNumber(a) * toNumber(b)
          case '/': {
            const d = toNumber(b)
            const n = toNumber(a)
            if (d === 0) return new SheetError('#DIV/0!')
            return n / d
          }
          case '^': {
            const p = Math.pow(toNumber(a), toNumber(b))
            return Number.isFinite(p) ? p : new SheetError('#NUM!')
          }
          case '&':
            return toText(a) + toText(b)
          case '=':
            return compare(a, b) === 0
          case '<>':
            return compare(a, b) !== 0
          case '<':
            return compare(a, b) < 0
          case '>':
            return compare(a, b) > 0
          case '<=':
            return compare(a, b) <= 0
          case '>=':
            return compare(a, b) >= 0
        }
        return new SheetError('#ERROR!')
      }
      case 'call': {
        const own = OWN[node.name]
        if (own) return own(node.args, ev)
        const fn = libraryFunction(node.name)
        if (!fn) return new SheetError('#NAME?')
        const args = node.args.map((a) => {
          const v = ev(a)
          return v
        })
        try {
          return fromLibrary(fn(...args))
        } catch (e) {
          return e instanceof SheetError ? e : new SheetError('#VALUE!')
        }
      }
    }
  }

  try {
    const result = scalar(ev(root))
    if (typeof result === 'number' && !Number.isFinite(result)) return new SheetError('#NUM!')
    return result
  } catch (e) {
    return e instanceof SheetError ? e : new SheetError('#ERROR!')
  }
}

const ref1 = (ref: RefParts) =>
  ref.kind === 'cells' && (ref.single || (ref.r1 === ref.r2 && ref.c1 === ref.c2))

/** References in a formula, for highlighting. */
export function formulaRefs(formula: string): RefParts[] {
  try {
    return tokenize(formula).flatMap((t) => (t.t === 'ref' ? [t.v] : []))
  } catch {
    return []
  }
}
