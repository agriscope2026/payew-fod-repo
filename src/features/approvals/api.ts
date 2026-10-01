import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'
import type { ApprovalEntity, ApprovalStatus, ApprovalType, Json } from '@/types/database'

export const approvalsKey = ['approvals'] as const

export type ApprovalBox = 'decide' | 'mine' | 'all'

export function useApprovals(f: {
  box: ApprovalBox
  status: ApprovalStatus | ''
  programIds: string[]
}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...approvalsKey, 'list', f],
    enabled: !!user && f.programIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from('v_approval_requests')
        .select('*')
        .in('program_id', f.programIds)
        .order('requested_at', { ascending: false })
        .limit(500)
      if (f.status) q = q.eq('status', f.status)
      if (f.box === 'decide') q = q.eq('can_decide', true)
      if (f.box === 'mine') q = q.eq('requested_by', user!.id)
      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}

/** Requests waiting for the caller's decision (sidebar badge). */
export function usePendingDecisions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...approvalsKey, 'pending-count'],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('v_approval_requests')
        .select('id', { count: 'exact', head: true })
        .eq('can_decide', true)
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useApproval(id: string | undefined) {
  return useQuery({
    queryKey: [...approvalsKey, 'one', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_approval_requests')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useEntityApprovals(activityId: string | undefined, packageId?: string) {
  return useQuery({
    queryKey: [...approvalsKey, 'entity', activityId, packageId],
    enabled: !!activityId,
    queryFn: async () => {
      let q = supabase
        .from('v_approval_requests')
        .select('*')
        .eq('activity_id', activityId!)
        .order('requested_at', { ascending: false })
      if (packageId) q = q.eq('package_id', packageId)
      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}

function useInvalidateAll() {
  const queryClient = useQueryClient()
  // Approving changes activities, packages, finance and workflows.
  return () => queryClient.invalidateQueries()
}

export function useSubmitApproval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      type: ApprovalType
      entityType: ApprovalEntity
      entityId: string
      justification: string
      payload?: Record<string, unknown>
      fiscalYearId?: string | null
    }) => {
      const { data, error } = await supabase.rpc('submit_approval', {
        p_type: v.type,
        p_entity_type: v.entityType,
        p_entity_id: v.entityId,
        p_justification: v.justification,
        p_payload: (v.payload ?? {}) as Json,
        p_fiscal_year_id: v.fiscalYearId ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: approvalsKey }),
  })
}

export function useApprovalActions() {
  const invalidate = useInvalidateAll()
  const decide = useMutation({
    mutationFn: async (v: { id: string; decision: 'approved' | 'rejected'; note?: string }) => {
      const { error } = await supabase.rpc('decide_approval', {
        p_id: v.id,
        p_decision: v.decision,
        p_note: v.note ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const withdraw = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('withdraw_approval', { p_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  return { decide, withdraw }
}
