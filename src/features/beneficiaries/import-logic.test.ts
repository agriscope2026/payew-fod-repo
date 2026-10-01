import { describe, expect, it } from 'vitest'
import { autoMapColumns, nameKey, validateRows, type Lookups } from './import-logic'

const lookups: Lookups = {
  types: [{ id: 't-fa', code: 'FA', name: "Farmers' Association", is_active: true }],
  provinces: [
    { id: 'p-ben', name: 'Benguet' },
    { id: 'p-bag', name: 'Baguio City' },
  ],
  municipalities: [
    { id: 'm-bug', name: 'Buguias', province_id: 'p-ben' },
    { id: 'm-bag', name: 'Baguio City', province_id: 'p-bag' },
  ],
  barangays: [{ id: 'b-aba', name: 'Abatan', municipality_id: 'm-bug' }],
  commodities: [{ id: 'c-veg', name: 'Highland Vegetables', is_active: true }],
}

describe('autoMapColumns', () => {
  it('matches headers by name and alias, ignoring case and punctuation', () => {
    const m = autoMapColumns([
      'NAME OF FA',
      'Type',
      'province',
      'Town',
      'Brgy.',
      'Male',
      'Crops',
      'Something else',
    ])
    expect(m).toMatchObject({
      name: 'NAME OF FA',
      type: 'Type',
      province: 'province',
      municipality: 'Town',
      barangay: 'Brgy.',
      members_male: 'Male',
      commodities: 'Crops',
      email: '',
    })
  })
})

describe('nameKey', () => {
  it('drops generic words and punctuation', () => {
    expect(nameKey('Buguias Highland Vegetable Growers Assn., Inc.')).toBe(
      'buguias highland vegetable',
    )
  })
})

describe('validateRows', () => {
  const mapping = autoMapColumns([
    'Name',
    'Type',
    'Province',
    'Municipality/City',
    'Barangay',
    'Male Members',
    'Female Members',
    'IP Members',
    'Commodities',
    'Latitude',
    'Longitude',
    'Status',
  ])

  it('resolves master-list names to ids and builds the payload', () => {
    const [row] = validateRows(
      [
        {
          Name: 'Abatan Growers',
          Type: 'fa',
          Province: 'BENGUET',
          'Municipality/City': 'buguias',
          Barangay: 'Abatan',
          'Male Members': '1,200',
          'Female Members': 3,
          'IP Members': 1000,
          Commodities: 'Highland Vegetables; Cabbage',
          Latitude: '16.7',
          Longitude: '120.8',
        },
      ],
      mapping,
      lookups,
    )
    expect(row.errors).toEqual([])
    expect(row.warnings).toEqual(['Commodity “Cabbage” not found; skipped'])
    expect(row.payload).toMatchObject({
      type_id: 't-fa',
      province_id: 'p-ben',
      municipality_id: 'm-bug',
      barangay_id: 'b-aba',
      members_male: 1200,
      members_female: 3,
      status: 'active',
      commodity_ids: ['c-veg'],
      latitude: 16.7,
    })
    expect(row.rowNumber).toBe(2)
  })

  it('accepts "City of Baguio" style names', () => {
    const [row] = validateRows(
      [
        {
          Name: 'Urban Gardeners',
          Type: 'FA',
          Province: 'City of Baguio',
          'Municipality/City': 'Baguio City',
        },
      ],
      mapping,
      lookups,
    )
    expect(row.errors).toEqual([])
    expect(row.payload.municipality_id).toBe('m-bag')
  })

  it('reports clear errors and skips blank lines', () => {
    const rows = validateRows(
      [
        { Name: '', Type: 'XYZ', Province: 'Nowhere' },
        {},
        {
          Name: 'Bad Numbers',
          Type: 'FA',
          Province: 'Benguet',
          'Municipality/City': 'Atok',
          'Male Members': '2.5',
          'IP Members': 9,
          Latitude: '16',
          Status: 'gone',
        },
      ],
      mapping,
      lookups,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].errors).toEqual([
      'Name is required',
      'Unknown type “XYZ”',
      'Unknown province “Nowhere”',
    ])
    expect(rows[1].rowNumber).toBe(4)
    expect(rows[1].errors).toEqual([
      '“Atok” is not a municipality of Benguet',
      'Male Members must be a whole number',
      'IP Members exceed total members (0)',
      'Give both latitude and longitude, or neither',
      'Status must be one of: active, inactive, dissolved',
    ])
  })

  it('flags duplicates within the same file', () => {
    const rows = validateRows(
      [
        {
          Name: 'Abatan Growers Association',
          Type: 'FA',
          Province: 'Benguet',
          'Municipality/City': 'Buguias',
        },
        {
          Name: 'ABATAN GROWERS ASSN.',
          Type: 'FA',
          Province: 'Benguet',
          'Municipality/City': 'Buguias',
        },
      ],
      mapping,
      lookups,
    )
    expect(rows[1].errors).toEqual(['Duplicate of row 2 in this file'])
  })
})
