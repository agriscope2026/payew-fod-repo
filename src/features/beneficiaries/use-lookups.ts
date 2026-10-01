import { useMemo } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { useLocations } from '@/features/locations/api'
import { useMasterList } from '@/features/settings/master-lists/api'
import type { Lookups } from './import-logic'

/** Master lists the beneficiaries module needs, with id → label helpers. */
export function useBeneficiaryLookups() {
  const { programs } = useAuth()
  const { data: locations } = useLocations()
  const { data: types = [] } = useMasterList('beneficiary_types')
  const { data: commodities = [] } = useMasterList('commodities')

  return useMemo(() => {
    const lookups: Lookups = {
      types: types.map((t) => ({
        id: t.id,
        code: String(t.code),
        name: String(t.name),
        is_active: t.is_active,
      })),
      provinces: locations?.provinces ?? [],
      municipalities: locations?.municipalities ?? [],
      barangays: locations?.barangays ?? [],
      commodities: commodities.map((c) => ({
        id: c.id,
        name: String(c.name),
        is_active: c.is_active,
      })),
    }
    const typeById = new Map(lookups.types.map((t) => [t.id, t]))
    const commodityById = new Map(commodities.map((c) => [c.id, c]))
    const programById = new Map(programs.map((p) => [p.id, p]))
    const province = new Map(lookups.provinces.map((p) => [p.id, p.name]))
    const municipality = new Map(lookups.municipalities.map((m) => [m.id, m.name]))
    const barangay = new Map(lookups.barangays.map((b) => [b.id, b.name]))
    return {
      lookups,
      loaded: !!locations && types.length > 0,
      commodityOptions: commodities.map((c) => ({
        id: c.id,
        name: String(c.name),
        category: (c.category as string | null) ?? 'Other',
        is_active: c.is_active,
      })),
      names: {
        type: (id: string) => typeById.get(id)?.name ?? '—',
        typeCode: (id: string) => typeById.get(id)?.code ?? '—',
        province: (id: string | null) => (id ? (province.get(id) ?? '') : ''),
        municipality: (id: string | null) => (id ? (municipality.get(id) ?? '') : ''),
        barangay: (id: string | null) => (id ? (barangay.get(id) ?? '') : ''),
        commodity: (id: string) => String(commodityById.get(id)?.name ?? ''),
        program: (id: string | null) => (id ? (programById.get(id)?.code ?? '') : 'FOD'),
      },
      programById,
    }
  }, [locations, types, commodities, programs])
}
