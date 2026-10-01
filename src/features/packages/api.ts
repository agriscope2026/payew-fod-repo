import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DirectivePriority, ObligationTiming, PackageRow } from '@/types/database'

export const packagesKey = ['packages'] as const

export function useActivityPackages(activityId: string | undefined) {
  return useQuery({
    queryKey: [...packagesKey, 'by-activity', activityId],
    enabled: !!activityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_packages')
        .select('*')
        .eq('activity_id', activityId!)
        .is('deleted_at', null)
        .order('package_no')
      if (error) throw error
      return data
    },
  })
}

export function usePackage(id: string | undefined) {
  return useQuery({
    queryKey: [...packagesKey, 'one', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_packages')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Stage rows of every package of an activity (for steppers, board and timeline). */
export function useActivityPackageStages(activityId: string | undefined) {
  return useQuery({
    queryKey: [...packagesKey, 'stages-by-activity', activityId],
    enabled: !!activityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_stage_progress')
        .select('*')
        .eq('activity_id', activityId!)
        .not('package_id', 'is', null)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

export function usePackageStages(id: string | undefined) {
  return useQuery({
    queryKey: [...packagesKey, 'stages', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_stage_progress')
        .select('*')
        .eq('package_id', id!)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

export function usePackageTasks(id: string | undefined) {
  return useQuery({
    queryKey: [...packagesKey, 'tasks', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_tasks')
        .select('*')
        .eq('package_id', id!)
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function usePackageTransitions(id: string | undefined) {
  return useQuery({
    queryKey: [...packagesKey, 'transitions', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_stage_transitions')
        .select('*')
        .eq('package_id', id!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useSupplierHistory(packageId: string | undefined) {
  return useQuery({
    queryKey: [...packagesKey, 'supplier-history', packageId],
    enabled: !!packageId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('package_supplier_history')
        .select('*, supplier:suppliers(business_name)')
        .eq('package_id', packageId!)
        .order('created_at')
      if (error) throw error
      return data as ((typeof data)[number] & { supplier: { business_name: string } | null })[]
    },
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: packagesKey }),
      queryClient.invalidateQueries({ queryKey: ['activities'] }),
      queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
    ])
}

export type PackageInput = Pick<
  PackageRow,
  | 'title'
  | 'description'
  | 'category_id'
  | 'procurement_mode_id'
  | 'expense_class_id'
  | 'uacs_code_id'
  | 'abc_amount'
  | 'responsible_user_id'
  | 'start_date'
  | 'due_date'
  | 'remarks'
> & { contract_no?: string | null; award_date?: string | null }

export function useSavePackage() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: {
      id?: string
      activityId: string
      input: PackageInput
      obligationTiming?: ObligationTiming
      workflowTemplateId?: string | null
    }) => {
      if (v.id) {
        const { data, error } = await supabase
          .from('procurement_packages')
          .update(v.input)
          .eq('id', v.id)
          .select('id')
        if (error) throw error
        if (!data.length) throw new Error('You cannot edit this package.')
        return v.id
      }
      const { data, error } = await supabase
        .from('procurement_packages')
        .insert({
          ...v.input,
          activity_id: v.activityId,
          obligation_timing: v.obligationTiming ?? 'after_delivery',
          workflow_template_id: v.workflowTemplateId ?? null,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: invalidate,
  })
}

export function useAwardPackage() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: {
      packageId: string
      supplierId: string
      contractAmount: number
      awardDate: string | null
      contractNo: string | null
      procurementModeId: string | null
      reason: string | null
      reaward: boolean
    }) => {
      const { data, error } = v.reaward
        ? await supabase.rpc('reaward_package', {
            p_package_id: v.packageId,
            p_supplier_id: v.supplierId,
            p_contract_amount: v.contractAmount,
            p_reason: v.reason ?? '',
            p_award_date: v.awardDate,
            p_contract_no: v.contractNo,
          })
        : await supabase.rpc('award_package', {
            p_package_id: v.packageId,
            p_supplier_id: v.supplierId,
            p_contract_amount: v.contractAmount,
            p_award_date: v.awardDate,
            p_contract_no: v.contractNo,
            p_procurement_mode_id: v.procurementModeId,
            p_reason: v.reason,
          })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function usePackageActions() {
  const invalidate = useInvalidate()
  const cancel = useMutation({
    mutationFn: async (v: { id: string; cancelled: boolean; reason?: string }) => {
      const { error } = await supabase.rpc('set_package_cancelled', {
        p_package_id: v.id,
        p_cancelled: v.cancelled,
        p_reason: v.reason ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const timing = useMutation({
    mutationFn: async (v: { id: string; timing: ObligationTiming }) => {
      const { error } = await supabase.rpc('set_package_obligation_timing', {
        p_package_id: v.id,
        p_timing: v.timing,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const applyWorkflow = useMutation({
    mutationFn: async (v: { id: string; templateId: string }) => {
      const { error } = await supabase.rpc('apply_workflow_to_package', {
        p_package_id: v.id,
        p_template_id: v.templateId,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const split = useMutation({
    mutationFn: async (v: {
      id: string
      parts: { title: string; abc_amount: number }[]
      reason: string
    }) => {
      const { data, error } = await supabase.rpc('split_package', {
        p_package_id: v.id,
        p_parts: v.parts,
        p_reason: v.reason,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
  const merge = useMutation({
    mutationFn: async (v: { ids: string[]; title: string; reason: string }) => {
      const { data, error } = await supabase.rpc('merge_packages', {
        p_package_ids: v.ids,
        p_title: v.title,
        p_reason: v.reason,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
  const trash = useMutation({
    mutationFn: async (v: { id: string; restore?: boolean }) => {
      const { data, error } = await supabase
        .from('procurement_packages')
        .update({ deleted_at: v.restore ? null : new Date().toISOString() })
        .eq('id', v.id)
        .select('id')
      if (error) throw error
      if (!data.length) throw new Error('Only program admins can delete packages.')
    },
    onSuccess: invalidate,
  })
  return { cancel, timing, applyWorkflow, split, merge, trash }
}

export function usePackageOverdueDraft(packageId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...packagesKey, 'overdue-draft', packageId],
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('package_overdue_notice_draft', {
        p_package_id: packageId,
      })
      if (error) throw error
      return data
    },
  })
}

export function useSendPackageOverdueNotice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      packageId: string
      recipients: string[]
      title: string
      body: string
      responseDue: string | null
      priority: DirectivePriority
    }) => {
      const { data, error } = await supabase.rpc('send_package_overdue_notice', {
        p_package_id: v.packageId,
        p_recipients: v.recipients,
        p_title: v.title,
        p_body: v.body,
        p_response_due: v.responseDue,
        p_priority: v.priority,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['directives'] }),
  })
}
