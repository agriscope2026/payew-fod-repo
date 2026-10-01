import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { BeneficiaryRow, Json } from '@/types/database'

export type Beneficiary = BeneficiaryRow & { commodity_ids: string[] }

export const beneficiariesKey = ['beneficiaries'] as const

const PAGE = 1000

/** Loads the whole registry (paged under the hood) joined with commodity tags. */
export function useBeneficiaries({ trash = false }: { trash?: boolean } = {}) {
  return useQuery({
    queryKey: [...beneficiariesKey, 'list', { trash }],
    queryFn: async (): Promise<Beneficiary[]> => {
      const rows: BeneficiaryRow[] = []
      for (let from = 0; ; from += PAGE) {
        let q = supabase
          .from('beneficiaries')
          .select('*')
          .order('name')
          .range(from, from + PAGE - 1)
        q = trash ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null)
        const { data, error } = await q
        if (error) throw error
        rows.push(...data)
        if (data.length < PAGE) break
      }
      const tags = new Map<string, string[]>()
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('beneficiary_commodities')
          .select('beneficiary_id, commodity_id')
          .range(from, from + PAGE - 1)
        if (error) throw error
        for (const t of data)
          tags.set(t.beneficiary_id, [...(tags.get(t.beneficiary_id) ?? []), t.commodity_id])
        if (data.length < PAGE) break
      }
      return rows.map((r) => ({ ...r, commodity_ids: tags.get(r.id) ?? [] }))
    },
  })
}

export function useBeneficiary(id: string | undefined) {
  return useQuery({
    queryKey: [...beneficiariesKey, 'one', id],
    enabled: !!id,
    queryFn: async (): Promise<Beneficiary | null> => {
      const [b, c] = await Promise.all([
        supabase.from('beneficiaries').select('*').eq('id', id!).maybeSingle(),
        supabase.from('beneficiary_commodities').select('commodity_id').eq('beneficiary_id', id!),
      ])
      if (b.error) throw b.error
      if (c.error) throw c.error
      return b.data ? { ...b.data, commodity_ids: c.data.map((x) => x.commodity_id) } : null
    },
  })
}

export type BeneficiaryInput = Omit<
  BeneficiaryRow,
  | 'id'
  | 'name_key'
  | 'members_total'
  | 'created_at'
  | 'updated_at'
  | 'created_by'
  | 'deleted_at'
  | 'deleted_by'
>

export function useSaveBeneficiary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
      commodityIds,
      previousCommodityIds = [],
    }: {
      id?: string
      input: BeneficiaryInput
      commodityIds: string[]
      previousCommodityIds?: string[]
    }) => {
      // Ownership is fixed after creation (superadmin changes it via the DB guard).
      const { registered_by_program_id, ...editable } = input
      const res = id
        ? await supabase.from('beneficiaries').update(editable).eq('id', id).select('id').single()
        : await supabase
            .from('beneficiaries')
            .insert({ ...editable, registered_by_program_id })
            .select('id')
            .single()
      if (res.error) throw res.error
      const beneficiaryId = res.data.id

      const removed = previousCommodityIds.filter((c) => !commodityIds.includes(c))
      const added = commodityIds.filter((c) => !previousCommodityIds.includes(c))
      if (removed.length) {
        const { error } = await supabase
          .from('beneficiary_commodities')
          .delete()
          .eq('beneficiary_id', beneficiaryId)
          .in('commodity_id', removed)
        if (error) throw error
      }
      if (added.length) {
        const { error } = await supabase
          .from('beneficiary_commodities')
          .insert(added.map((commodity_id) => ({ beneficiary_id: beneficiaryId, commodity_id })))
        if (error) throw error
      }
      return beneficiaryId
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: beneficiariesKey }),
  })
}

export function useTrashBeneficiary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, restore }: { id: string; restore?: boolean }) => {
      const { data, error } = await supabase
        .from('beneficiaries')
        .update({ deleted_at: restore ? null : new Date().toISOString() })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data.length) throw new Error('You do not have permission to change this record.')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: beneficiariesKey }),
  })
}

export async function findSimilarBeneficiaries(
  name: string,
  municipalityId: string | null,
  excludeId?: string,
) {
  if (name.trim().length < 4) return []
  const { data, error } = await supabase.rpc('find_similar_beneficiaries', {
    p_name: name,
    p_municipality_id: municipalityId,
    p_exclude_id: excludeId ?? null,
    p_limit: 5,
  })
  if (error) throw error
  return data
}

export async function matchExisting(rows: { name: string; municipality_id: string | null }[]) {
  const { data, error } = await supabase.rpc('match_beneficiaries', {
    p_rows: rows as unknown as Json,
  })
  if (error) throw error
  return new Map(data.map((m) => [m.idx, m]))
}

/** Imports in chunks of 500 (each chunk is all-or-nothing on the server). */
export async function importBeneficiaries(
  programId: string | null,
  rows: Record<string, unknown>[],
  onProgress?: (done: number) => void,
) {
  let done = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { data, error } = await supabase.rpc('import_beneficiaries', {
      p_program_id: programId,
      p_rows: chunk as unknown as Json,
    })
    if (error) throw Object.assign(error, { importedBefore: done })
    done += data
    onProgress?.(done)
  }
  return done
}
