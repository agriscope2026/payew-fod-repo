// How cell values look on screen and in exported files.
import { isError, serialToDate, type Scalar } from './formula'
import type { NumberFormat } from './model'

const number2 = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const integer = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })
const general = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 10, useGrouping: false })
const dateFmt = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export function formatValue(v: Scalar, fmt: NumberFormat | undefined): string {
  if (v === null || v === undefined) return ''
  if (isError(v)) return v.code
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'string') return v
  switch (fmt) {
    case 'number':
      return number2.format(v)
    case 'integer':
      return integer.format(v)
    case 'peso':
      return v < 0 ? `-₱${number2.format(-v)}` : `₱${number2.format(v)}`
    case 'percent':
      return `${number2.format(v * 100)}%`
    case 'date':
      return Number.isFinite(v) ? dateFmt.format(serialToDate(v)) : String(v)
    case 'text':
      return String(v)
    default:
      return general.format(Number(v.toPrecision(12)))
  }
}

export const isNumeric = (v: Scalar) => typeof v === 'number'

/** Excel number format codes, for export. */
export const EXCEL_FORMAT: Record<NumberFormat, string | undefined> = {
  general: undefined,
  number: '#,##0.00;(#,##0.00);"-"',
  integer: '#,##0;(#,##0);"-"',
  peso: '"₱"#,##0.00;("₱"#,##0.00);"-"',
  percent: '0.00%',
  date: 'mmm d, yyyy',
  text: '@',
}

/** The closest PAYEW format for an Excel number format code. */
export function formatFromExcel(code: string | undefined): NumberFormat | undefined {
  if (!code || code === 'General') return undefined
  if (code === '@') return 'text'
  if (code.includes('%')) return 'percent'
  if (/[₱]|"P"|PHP|\[\$₱/.test(code)) return 'peso'
  if (/[dmy]{1,4}/i.test(code.replace(/"[^"]*"/g, '')) && !/#|0/.test(code.replace(/"[^"]*"/g, '')))
    return 'date'
  if (/0\.0/.test(code)) return 'number'
  if (/#,##0|^0$/.test(code)) return 'integer'
  return undefined
}
