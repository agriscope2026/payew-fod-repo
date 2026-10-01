import { describe, expect, it } from 'vitest'
import { toCsv } from './export'

describe('toCsv', () => {
  it('escapes quotes, commas and newlines and prefixes a BOM', () => {
    const csv = toCsv(
      [
        { name: 'Farmers, Inc.', note: 'say "hi"', n: 5 },
        { name: 'Line\nbreak', note: null, n: 0 },
      ],
      [
        { key: 'name', label: 'Name' },
        { key: 'note', label: 'Note' },
        { key: 'n', label: 'Count' },
      ],
    )
    expect(csv).toBe('﻿Name,Note,Count\r\n"Farmers, Inc.","say ""hi""",5\r\n"Line\nbreak",,0')
  })
})
