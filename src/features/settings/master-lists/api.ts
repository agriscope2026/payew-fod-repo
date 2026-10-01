import type { SupabaseClient } from '@supabase/supabase-js'
import {
  queryOptions,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { MASTER_LIST_BY_KEY, type MasterListKey } from './config'

// The editor is generic over table names, so it uses the untyped client.
// RLS still applies: only superadmins (or program admins for their own categories) can write.
const db = supabase as unknown as SupabaseClient

export type MasterRow = Record<string, unknown> & { id: string; is_active: boolean }

/** program_id scope: undefined = not scoped, null = global rows, string = that program's rows. */
export type Scope = { programId?: string | null }

export const masterListKey = (list: MasterListKey, scope: Scope = {}) =>
  ['master', list, scope.programId ?? (scope.programId === null ? 'global' : 'all')] as const

export function masterListQuery(
  list: MasterListKey,
  scope: Scope = {},
  opts: { activeOnly?: boolean } = {},
) {
  return queryOptions({
    queryKey: [...masterListKey(list, scope), opts.activeOnly ? 'active' : 'any'],
    queryFn: async () => {
      const def = MASTER_LIST_BY_KEY[list]
      let q = db.from(list).select('*').is('deleted_at', null)
      if (scope.programId === null) q = q.is('program_id', null)
      else if (scope.programId) q = q.eq('program_id', scope.programId)
      if (opts.activeOnly) q = q.eq('is_active', true)
      for (const o of def.orderBy) {
        q = q.order(o.column, { ascending: o.ascending ?? true, nullsFirst: false })
      }
      const { data, error } = await q
      if (error) throw error
      return data as MasterRow[]
    },
    staleTime: 10 * 60_000,
  })
}

export function useMasterList(
  list: MasterListKey,
  scope: Scope = {},
  opts: { activeOnly?: boolean } = {},
) {
  return useQuery(masterListQuery(list, scope, opts))
}

/** Loads several lists at once (e.g. the option sources of a form). */
export function useMasterLists(lists: MasterListKey[]) {
  const unique = [...new Set(lists)]
  return useQueries({
    queries: unique.map((l) => masterListQuery(l)),
    combine: (results) =>
      Object.fromEntries(unique.map((l, i) => [l, results[i].data ?? []])) as Partial<
        Record<MasterListKey, MasterRow[]>
      >,
  })
}

export function useSaveMasterRow(list: MasterListKey, scope: Scope = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: Record<string, unknown> }) => {
      const payload =
        scope.programId !== undefined ? { ...values, program_id: scope.programId } : values
      const { error } = id
        ? await db.from(list).update(payload).eq('id', id)
        : await db.from(list).insert(payload)
      if (error) throw error
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['master', list] }),
        queryClient.invalidateQueries({ queryKey: ['locations'] }),
      ]),
  })
}

export function useDeleteMasterRow(list: MasterListKey) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Hard delete keeps unique names reusable; rows still referenced elsewhere
      // fail with 23503 and should be deactivated instead.
      const { error } = await db.from(list).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['master', list] }),
  })
}
