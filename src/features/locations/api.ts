import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { BarangayRow, MunicipalityRow, ProvinceRow } from '@/types/database'

export interface Locations {
  provinces: ProvinceRow[]
  municipalities: MunicipalityRow[]
  barangays: BarangayRow[]
}

/**
 * The full Cordillera location tree (7 provinces, ~77 LGUs, ~1,200 barangays) is
 * small enough to load once and cache; every cascading dropdown reads from it.
 * Inactive entries are kept so old records still display their names.
 */
export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Locations> => {
      const [p, m, b] = await Promise.all([
        supabase
          .from('provinces')
          .select('*')
          .is('deleted_at', null)
          .order('sort_order')
          .order('name'),
        supabase.from('municipalities').select('*').is('deleted_at', null).order('name'),
        supabase.from('barangays').select('*').is('deleted_at', null).order('name').range(0, 9999),
      ])
      if (p.error) throw p.error
      if (m.error) throw m.error
      if (b.error) throw b.error
      return { provinces: p.data, municipalities: m.data, barangays: b.data }
    },
  })
}

export interface LocationIds {
  province_id: string | null
  municipality_id: string | null
  barangay_id: string | null
}

/** id → name lookups plus a "Barangay, Municipality, Province" formatter. */
export function useLocationLookup() {
  const { data } = useLocations()
  return useMemo(() => {
    const province = new Map(data?.provinces.map((x) => [x.id, x]) ?? [])
    const municipality = new Map(data?.municipalities.map((x) => [x.id, x]) ?? [])
    const barangay = new Map(data?.barangays.map((x) => [x.id, x]) ?? [])
    const format = (ids: Partial<LocationIds>, opts: { short?: boolean } = {}) => {
      const parts = [
        opts.short ? null : ids.barangay_id ? barangay.get(ids.barangay_id)?.name : null,
        ids.municipality_id ? municipality.get(ids.municipality_id)?.name : null,
        ids.province_id ? province.get(ids.province_id)?.name : null,
      ].filter((p, i, all): p is string => !!p && all.indexOf(p) === i) // "Baguio City, Baguio City" → once
      return parts.join(', ') || '—'
    }
    return { province, municipality, barangay, format, loaded: !!data }
  }, [data])
}

/** Case/punctuation-insensitive key for matching imported names to master lists. */
export function locationKey(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(city of|municipality of|province of|city)\b/g, '') // "Baguio City" = "City of Baguio"
    .replace(/[^a-z0-9]+/g, '')
}
