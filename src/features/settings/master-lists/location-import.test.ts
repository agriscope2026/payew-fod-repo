import { describe, expect, it } from 'vitest'
import { parseLocations, tidyName } from './location-import'

describe('tidyName', () => {
  it('title-cases ALL-CAPS names and leaves mixed case alone', () => {
    expect(tidyName('LA TRINIDAD')).toBe('La Trinidad')
    expect(tidyName('CITY OF BAGUIO')).toBe('City of Baguio')
    expect(tidyName('  Sto.  Niño ')).toBe('Sto. Niño')
    expect(tidyName('POBLACION (BONTOC)')).toBe('Poblacion (Bontoc)')
    expect(tidyName('LA TRINIDAD (Capital)')).toBe('La Trinidad')
  })
})

describe('parseLocations: simple layout', () => {
  it('reads province / municipality / barangay rows and skips duplicates', () => {
    const r = parseLocations([
      { Province: 'Benguet', 'Municipality/City': 'La Trinidad', Barangay: 'Balili' },
      { Province: 'Benguet', 'Municipality/City': 'La Trinidad', Barangay: 'Balili' },
      { Province: 'Benguet', 'Municipality/City': 'Tuba', Barangay: '' },
      { Province: 'Ifugao', 'Municipality/City': '', Barangay: 'Orphan' },
      { Province: '', 'Municipality/City': '', Barangay: '' },
    ])
    expect(r.format).toBe('simple')
    expect(r.rows).toHaveLength(2)
    expect(r.counts).toEqual({ provinces: 1, municipalities: 2, barangays: 1 })
    expect(r.errors).toEqual(['Row 5: barangay "Orphan" has no municipality/city.'])
  })

  it('asks for a Province column', () => {
    expect(parseLocations([{ Town: 'Sagada' }]).errors[0]).toMatch(/Province/)
  })
})

describe('parseLocations: PSA PSGC layout', () => {
  const psa = [
    {
      '10-digit PSGC': '1400000000',
      Name: 'Cordillera Administrative Region (CAR)',
      'Geographic Level': 'Reg',
    },
    { '10-digit PSGC': '1401100000', Name: 'BENGUET', 'Geographic Level': 'Prov' },
    { '10-digit PSGC': '1401110000', Name: 'LA TRINIDAD (Capital)', 'Geographic Level': 'Mun' },
    { '10-digit PSGC': '1401110001', Name: 'BALILI', 'Geographic Level': 'Bgy' },
    { '10-digit PSGC': '1430300000', Name: 'CITY OF BAGUIO', 'Geographic Level': 'City' },
    { '10-digit PSGC': '1430300001', Name: 'IRISAN', 'Geographic Level': 'Bgy' },
    { '10-digit PSGC': '0100000000', Name: 'Region I (Ilocos Region)', 'Geographic Level': 'Reg' },
    { '10-digit PSGC': '0102800000', Name: 'ILOCOS NORTE', 'Geographic Level': 'Prov' },
  ]

  it('asks for a region when the file covers several', () => {
    const r = parseLocations(psa)
    expect(r.format).toBe('psgc')
    expect(r.regions.map((x) => x.code)).toEqual(['14', '01'])
    expect(r.errors[0]).toMatch(/several regions/)
  })

  it('builds the hierarchy from PSGC codes; a highly urbanized city sits at province level', () => {
    const r = parseLocations(psa, { region: '14' })
    expect(r.errors).toEqual([])
    expect(r.counts).toEqual({ provinces: 2, municipalities: 2, barangays: 2 })
    expect(r.rows).toContainEqual(
      expect.objectContaining({
        province: 'Benguet',
        province_psgc: '1401100000',
        municipality: 'La Trinidad',
        barangay: 'Balili',
        barangay_psgc: '1401110001',
      }),
    )
    expect(r.rows).toContainEqual(
      expect.objectContaining({
        province: 'City of Baguio',
        province_is_city: true,
        municipality: 'City of Baguio',
        municipality_is_city: true,
        barangay: 'Irisan',
      }),
    )
    // Parents always come before children.
    const firstBarangay = r.rows.findIndex((x) => x.barangay)
    expect(r.rows.slice(firstBarangay).every((x) => x.barangay)).toBe(true)
  })
})
