import { TZDate } from '@date-fns/tz'
import { format, formatDistanceToNowStrict } from 'date-fns'

export const TIMEZONE = 'Asia/Manila'

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
})

const compactPeso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** ₱1,234,567.89 */
export function formatPeso(value: number | string | null | undefined) {
  const n = typeof value === 'string' ? Number(value) : value
  return n == null || Number.isNaN(n) ? '—' : pesoFormatter.format(n)
}

/** ₱1.2M */
export function formatPesoCompact(value: number | null | undefined) {
  return value == null || Number.isNaN(value) ? '—' : compactPeso.format(value)
}

function toManila(value: Date | string | number) {
  return new TZDate(new Date(value), TIMEZONE)
}

/** Oct 01, 2026 (Asia/Manila) */
export function formatDate(value: Date | string | number | null | undefined) {
  return value == null ? '—' : format(toManila(value), 'MMM dd, yyyy')
}

/** Oct 01, 2026 3:05 PM (Asia/Manila) */
export function formatDateTime(value: Date | string | number | null | undefined) {
  return value == null ? '—' : format(toManila(value), 'MMM dd, yyyy h:mm a')
}

/** "5 minutes ago" */
export function formatRelative(value: Date | string | number | null | undefined) {
  return value == null ? '—' : formatDistanceToNowStrict(new Date(value), { addSuffix: true })
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  return value == null || Number.isNaN(value) ? '—' : `${value.toFixed(digits)}%`
}

/** 1.2 MB */
export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}

/** Today's date in Asia/Manila as YYYY-MM-DD (for date inputs and comparisons). */
export function todayManila() {
  return format(new TZDate(new Date(), TIMEZONE), 'yyyy-MM-dd')
}
