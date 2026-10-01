import { describe, expect, it } from 'vitest'
import {
  expiryState,
  formatTin,
  parseDate,
  supplierNameKey,
  tinKey,
  validateSuppliers,
  type SupplierLookups,
} from './supplier-logic'

describe('keys', () => {
  it('normalizes names like SQL supplier_name_key()', () => {
    expect(supplierNameKey('Benguet Highland Trading & General Merchandise, Inc.')).toBe(
      'benguet highland',
    )
    expect(supplierNameKey('Kabayan Catering Services')).toBe('kabayan catering')
  })

  it('compares TINs by their first 9 digits', () => {
    expect(tinKey('123-456-789-000')).toBe('123456789')
    expect(tinKey('123456789')).toBe('123456789')
    expect(tinKey('')).toBeNull()
    expect(formatTin('123456789000')).toBe('123-456-789-000')
  })
})

describe('expiryState', () => {
  it('flags expired, expiring within 30 days, valid and missing', () => {
    const today = '2026-10-01'
    expect(expiryState('2026-09-30', today)).toBe('expired')
    expect(expiryState('2026-10-31', today)).toBe('expiring')
    expect(expiryState('2026-11-01', today)).toBe('valid')
    expect(expiryState(null, today)).toBe('missing')
  })
})

describe('parseDate', () => {
  it('accepts ISO and m/d/yyyy', () => {
    expect(parseDate('2027-3-1')).toBe('2027-03-01')
    expect(parseDate('3/1/2027')).toBe('2027-03-01')
    expect(parseDate('')).toBeNull()
    expect(parseDate('next year')).toBe('invalid')
  })
})

describe('validateSuppliers', () => {
  const lookups: SupplierLookups = {
    provinces: [{ id: 'p1', name: 'Benguet' }],
    municipalities: [{ id: 'm1', name: 'La Trinidad', province_id: 'p1' }],
    barangays: [{ id: 'b1', name: 'Betag', municipality_id: 'm1' }],
    categories: [
      { code: 'MEALS', name: 'Meals / Catering' },
      { code: 'VENUE', name: 'Venue' },
    ],
    existing: [{ id: 'x', business_name: 'Kabayan Catering Services', tin: '111-222-333-000' }],
  }
  const row = (o: Record<string, string>) => ({ 'Business name': 'New Store', ...o })

  it('maps locations and categories into a payload', () => {
    const [r] = validateSuppliers(
      [
        row({
          TIN: '444555666',
          Province: 'benguet',
          'Municipality/City': 'La Trinidad',
          Barangay: 'Betag',
          Categories: 'meals; Venue; Fireworks',
          'Permit expiry': '12/31/2026',
        }),
      ],
      lookups,
    )
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual(['Unknown category "Fireworks" ignored'])
    expect(r.payload).toMatchObject({
      tin: '444-555-666',
      province_id: 'p1',
      municipality_id: 'm1',
      barangay_id: 'b1',
      categories: ['MEALS', 'VENUE'],
      permit_expiry: '2026-12-31',
      supplier_type: 'individual',
    })
  })

  it('blocks duplicate TINs and bad values; warns on similar names', () => {
    const rows = validateSuppliers(
      [
        row({ TIN: '111-222-333', 'Business name': 'Kabayan Catering Services, Inc.' }),
        row({ TIN: '777-888-999' }),
        row({ TIN: '777888999', Type: 'alien', Email: 'nope' }),
      ],
      lookups,
    )
    expect(rows[0].errors).toEqual(['TIN already registered to Kabayan Catering Services'])
    expect(rows[0].warnings).toEqual(['Looks like existing supplier Kabayan Catering Services'])
    expect(rows[1].errors).toEqual([])
    expect(rows[2].errors).toEqual([
      'Unknown type "alien"',
      'Same TIN as row 3',
      'Email is not valid',
    ])
    expect(rows[2].warnings).toEqual(['Same name as row 3'])
  })
})
