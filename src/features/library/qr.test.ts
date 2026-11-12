import { describe, expect, it } from 'vitest'
import { qrMatrix } from './qr'

describe('QR code for a link', () => {
  it('is a square with the three finder patterns', () => {
    const m = qrMatrix('https://docs.google.com/presentation/d/1AbC-x_9/edit?usp=sharing')
    const n = m.length
    expect(n).toBeGreaterThanOrEqual(21)
    expect(m.every((row) => row.length === n)).toBe(true)
    const finder = (r: number, c: number) =>
      [0, 6].every((i) => m[r + i].slice(c, c + 7).every(Boolean)) &&
      m[r + 1].slice(c + 1, c + 6).every((x) => !x) &&
      m[r + 3][c + 3]
    expect(finder(0, 0) && finder(0, n - 7) && finder(n - 7, 0)).toBe(true)
  })
  it('grows with longer links', () => {
    expect(qrMatrix('https://a.ph/' + 'x'.repeat(300)).length).toBeGreaterThan(
      qrMatrix('https://a.ph/x').length,
    )
  })
})
