import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'
import type {
  Json,
  SupplierBankAccountRow,
  SupplierDocumentRow,
  SupplierRow,
} from '@/types/database'

export const suppliersKey = ['suppliers'] as const

/** Superadmins and program admins create/edit suppliers (mirrors SQL can_manage_suppliers). */
export function useCanManageSuppliers() {
  const { role } = useAuth()
  return role === 'superadmin' || role === 'program_admin'
}

export function useSuppliers({ trash = false }: { trash?: boolean } = {}) {
  return useQuery({
    queryKey: [...suppliersKey, 'list', { trash }],
    queryFn: async () => {
      let q = supabase.from('v_suppliers').select('*').order('business_name').range(0, 4999)
      q = trash ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null)
      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}

export function useSupplier(id: string | undefined) {
  return useQuery({
    queryKey: [...suppliersKey, 'one', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_suppliers')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useSupplierDocuments(id: string | undefined) {
  return useQuery({
    queryKey: [...suppliersKey, 'documents', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_documents')
        .select('*')
        .eq('supplier_id', id!)
        .order('expires_on', { nullsFirst: false })
      if (error) throw error
      return data
    },
  })
}

/** Admin-only (RLS returns nothing for staff). */
export function useSupplierBank(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...suppliersKey, 'bank', id],
    enabled: !!id && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_bank_accounts')
        .select('*')
        .eq('supplier_id', id!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useSupplierRatings(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...suppliersKey, 'ratings', id],
    enabled: !!id && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_ratings')
        .select('*')
        .eq('supplier_id', id!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Packages awarded to a supplier (only programs the caller can see). */
export function useSupplierPackages(id: string | undefined) {
  return useQuery({
    queryKey: [...suppliersKey, 'packages', id],
    enabled: !!id,
    queryFn: async () => {
      const [current, history] = await Promise.all([
        supabase.from('v_packages').select('*').eq('supplier_id', id!).is('deleted_at', null),
        supabase.from('package_supplier_history').select('package_id').eq('supplier_id', id!),
      ])
      if (current.error) throw current.error
      if (history.error) throw history.error
      // Packages later re-awarded to someone else still belong to this supplier's record.
      const formerIds = [...new Set(history.data.map((h) => h.package_id))].filter(
        (pid) => !current.data.some((p) => p.id === pid),
      )
      let former: typeof current.data = []
      if (formerIds.length) {
        const { data, error } = await supabase.from('v_packages').select('*').in('id', formerIds)
        if (error) throw error
        former = data
      }
      return {
        current: current.data.sort((a, b) =>
          (b.award_date ?? '').localeCompare(a.award_date ?? ''),
        ),
        former,
      }
    },
  })
}

export async function findSimilarSuppliers(name: string, tin: string | null, excludeId?: string) {
  const { data, error } = await supabase.rpc('find_similar_suppliers', {
    p_name: name,
    p_tin: tin,
    p_exclude_id: excludeId ?? null,
    p_limit: 5,
  })
  if (error) throw error
  return data
}

export async function supplierAwardCheck(supplierId: string, on?: string) {
  const { data, error } = await supabase.rpc('supplier_award_check', {
    p_supplier_id: supplierId,
    p_on: on ?? null,
  })
  if (error) throw error
  return data
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: suppliersKey })
}

export type SupplierInput = Omit<
  SupplierRow,
  | 'id'
  | 'name_key'
  | 'tin_key'
  | 'created_at'
  | 'updated_at'
  | 'created_by'
  | 'deleted_at'
  | 'deleted_by'
>

export function useSaveSupplier() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SupplierInput }) => {
      if (id) {
        const { data, error } = await supabase
          .from('suppliers')
          .update(input)
          .eq('id', id)
          .select('id')
        if (error) throw error
        if (!data.length) throw new Error('You cannot edit suppliers.')
        return id
      }
      const { data, error } = await supabase.from('suppliers').insert(input).select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: invalidate,
  })
}

export function useTrashSupplier() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, restore }: { id: string; restore?: boolean }) => {
      const { data, error } = await supabase
        .from('suppliers')
        .update({ deleted_at: restore ? null : new Date().toISOString() })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data.length) throw new Error('You cannot change this supplier.')
    },
    onSuccess: invalidate,
  })
}

export function useSupplierDocumentMutations(supplierId: string) {
  const invalidate = useInvalidate()
  const save = useMutation({
    mutationFn: async (
      doc: Pick<
        SupplierDocumentRow,
        'doc_type' | 'doc_no' | 'issued_on' | 'expires_on' | 'remarks'
      > & {
        id?: string
      },
    ) => {
      const { id, ...fields } = doc
      const { error } = id
        ? await supabase.from('supplier_documents').update(fields).eq('id', id)
        : await supabase.from('supplier_documents').insert({ ...fields, supplier_id: supplierId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('supplier_documents').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  return { save, remove }
}

export function useSaveBank(supplierId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (
      bank: Pick<
        SupplierBankAccountRow,
        'bank_name' | 'branch' | 'account_name' | 'account_no'
      > | null,
    ) => {
      const { error } = bank
        ? await supabase
            .from('supplier_bank_accounts')
            .upsert({ ...bank, supplier_id: supplierId }, { onConflict: 'supplier_id' })
        : await supabase.from('supplier_bank_accounts').delete().eq('supplier_id', supplierId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useAddRating() {
  const invalidate = useInvalidate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (r: {
      packageId: string
      supplierId?: string
      rating: number | null
      remark: string
    }) => {
      const { error } = await supabase.from('supplier_ratings').insert({
        package_id: r.packageId,
        supplier_id: r.supplierId,
        rating: r.rating,
        remark: r.remark.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      void invalidate()
      void queryClient.invalidateQueries({ queryKey: ['packages'] })
    },
  })
}

export async function importSuppliers(rows: Record<string, unknown>[]) {
  const { data, error } = await supabase.rpc('import_suppliers', {
    p_rows: rows as unknown as Json,
  })
  if (error) throw error
  return data
}
