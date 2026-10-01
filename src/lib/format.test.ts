import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatPeso, formatPercent } from './format'

describe('format', () => {
  it('formats pesos', () => {
    expect(formatPeso(1234567.891)).toBe('₱1,234,567.89')
    expect(formatPeso('2500')).toBe('₱2,500.00')
    expect(formatPeso(null)).toBe('—')
  })

  it('formats dates as MMM dd, yyyy in Asia/Manila', () => {
    // 2026-09-30 17:30 UTC is already Oct 01 in Manila (UTC+8)
    expect(formatDate('2026-09-30T17:30:00Z')).toBe('Oct 01, 2026')
    expect(formatDateTime('2026-09-30T17:30:00Z')).toBe('Oct 01, 2026 1:30 AM')
    expect(formatDate(undefined)).toBe('—')
  })

  it('formats percentages', () => {
    expect(formatPercent(83.456)).toBe('83.5%')
  })
})
