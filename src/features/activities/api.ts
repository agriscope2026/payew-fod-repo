import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ActivityBeneficiaryRow, ActivityRow, ActivityTaskRow } from '@/types/database'

export const activitiesKey = ['activities'] as const

export interface ActivityListFilters {
  programIds: string[]
  fiscalYearId: string | null
  trash?: boolean
}

/** Activities from the v_activities read model (status, delay and progress computed in SQL). */
export function useActivities(f: ActivityListFilters) {
  return useQuery({
    queryKey: [...activitiesKey, 'list', f],
    enabled: f.programIds.length > 0,
    queryFn: async () => {
      const rows = []
      const PAGE = 1000
      for (let from = 0; ; from += PAGE) {
        let q = supabase
          .from('v_activities')
          .select('*')
          .in('program_id', f.programIds)
          .order('due_date', { ascending: true, nullsFirst: false })
          .range(from, from + PAGE - 1)
        if (f.fiscalYearId) q = q.eq('fiscal_year_id', f.fiscalYearId)
        q = f.trash ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null)
        const { data, error } = await q
        if (error) throw error
        rows.push(...data)
        if (data.length < PAGE) break
      }
      return rows
    },
  })
}

export function useActivity(id: string | undefined) {
  return useQuery({
    queryKey: [...activitiesKey, 'one', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_activities')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useActivityStages(id: string | undefined) {
  return useQuery({
    queryKey: [...activitiesKey, 'stages', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_stage_progress')
        .select('*')
        .eq('activity_id', id!)
        .is('package_id', null)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

export function useTransitions(id: string | undefined) {
  return useQuery({
    queryKey: [...activitiesKey, 'transitions', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_stage_transitions')
        .select('*')
        .eq('activity_id', id!)
        .is('package_id', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useTasks(id: string | undefined) {
  return useQuery({
    queryKey: [...activitiesKey, 'tasks', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_tasks')
        .select('*')
        .eq('activity_id', id!)
        .is('package_id', null)
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useActivityBeneficiaries(id: string | undefined) {
  return useQuery({
    queryKey: [...activitiesKey, 'beneficiaries', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_beneficiaries')
        .select('*')
        .eq('activity_id', id!)
      if (error) throw error
      return data
    },
  })
}

export function useActivityHistory(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...activitiesKey, 'history', id],
    enabled: !!id && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('activity_history', { p_activity_id: id! })
      if (error) throw error
      return data
    },
  })
}

/** Activities a beneficiary took part in (only programs the caller can see, via RLS). */
export function useBeneficiaryAssistance(beneficiaryId: string | undefined) {
  return useQuery({
    queryKey: [...activitiesKey, 'by-beneficiary', beneficiaryId],
    enabled: !!beneficiaryId,
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from('activity_beneficiaries')
        .select('*')
        .eq('beneficiary_id', beneficiaryId!)
      if (error) throw error
      if (!links.length) return []
      const { data: acts, error: e2 } = await supabase
        .from('v_activities')
        .select('*')
        .in(
          'id',
          links.map((l) => l.activity_id),
        )
        .is('deleted_at', null)
      if (e2) throw e2
      const byId = new Map(acts.map((a) => [a.id, a]))
      return links
        .filter((l) => byId.has(l.activity_id))
        .map((l) => ({ link: l, activity: byId.get(l.activity_id)! }))
        .sort((a, b) => (b.activity.start_date ?? '').localeCompare(a.activity.start_date ?? ''))
    },
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
function useInvalidate() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: activitiesKey }),
      queryClient.invalidateQueries({ queryKey: ['packages'] }),
    ])
}

export type ActivityInput = Omit<
  ActivityRow,
  | 'id'
  | 'code'
  | 'current_stage_id'
  | 'status'
  | 'cancelled_reason'
  | 'completed_at'
  | 'created_at'
  | 'updated_at'
  | 'created_by'
  | 'deleted_at'
  | 'deleted_by'
>

export type BeneficiaryLink = Pick<
  ActivityBeneficiaryRow,
  'beneficiary_id' | 'participants' | 'quantity' | 'unit_id' | 'amount' | 'remarks'
>

/** Inserts or updates an activity and syncs its beneficiary links. */
export function useSaveActivity() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({
      id,
      input,
      links,
      previousLinks = [],
    }: {
      id?: string
      input: ActivityInput
      links?: BeneficiaryLink[]
      previousLinks?: string[]
    }) => {
      let activityId = id
      if (id) {
        // Program, FY and workflow are fixed after creation.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { program_id, fiscal_year_id, workflow_template_id, ...editable } = input
        const { error } = await supabase.from('activities').update(editable).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('activities')
          .insert(input)
          .select('id')
          .single()
        if (error) throw error
        activityId = data.id
      }
      if (links) await syncLinks(activityId!, links, previousLinks)
      return activityId!
    },
    onSuccess: invalidate,
  })
}

async function syncLinks(activityId: string, links: BeneficiaryLink[], previous: string[]) {
  const keep = new Set(links.map((l) => l.beneficiary_id))
  const removed = previous.filter((b) => !keep.has(b))
  if (removed.length) {
    const { error } = await supabase
      .from('activity_beneficiaries')
      .delete()
      .eq('activity_id', activityId)
      .in('beneficiary_id', removed)
    if (error) throw error
  }
  const added = links.filter((l) => !previous.includes(l.beneficiary_id))
  if (added.length) {
    const { error } = await supabase
      .from('activity_beneficiaries')
      .insert(added.map((l) => ({ ...l, activity_id: activityId })))
    if (error) throw error
  }
  for (const l of links.filter((x) => previous.includes(x.beneficiary_id))) {
    const { beneficiary_id, ...values } = l
    const { error } = await supabase
      .from('activity_beneficiaries')
      .update(values)
      .eq('activity_id', activityId)
      .eq('beneficiary_id', beneficiary_id)
    if (error) throw error
  }
}

export function useSaveLinks() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      activityId,
      links,
      previous,
    }: {
      activityId: string
      links: BeneficiaryLink[]
      previous: string[]
    }) => syncLinks(activityId, links, previous),
    onSuccess: invalidate,
  })
}

export type StageAction = 'start' | 'complete' | 'skip' | 'reopen'

export function useStageAction() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: {
      stageId: string
      action: StageAction
      note?: string
      date?: string
    }) => {
      const { error } = await supabase.rpc('activity_stage_action', {
        p_stage_id: v.stageId,
        p_action: v.action,
        p_note: v.note || null,
        p_date: v.date || null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useUpdateStagePlan() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: {
      stageId: string
      changes: {
        assigned_to?: string | null
        planned_start?: string | null
        planned_end?: string | null
        notes?: string | null
      }
    }) => {
      const { data, error } = await supabase
        .from('activity_stage_progress')
        .update(v.changes)
        .eq('id', v.stageId)
        .select('id')
      if (error) throw error
      if (!data.length) throw new Error('You cannot edit this stage.')
    },
    onSuccess: invalidate,
  })
}

export function useCancelActivity() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { id: string; cancelled: boolean; reason?: string }) => {
      const { error } = await supabase.rpc('set_activity_cancelled', {
        p_activity_id: v.id,
        p_cancelled: v.cancelled,
        p_reason: v.reason ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useApplyWorkflow() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { activityId: string; templateId: string }) => {
      const { error } = await supabase.rpc('apply_workflow_to_activity', {
        p_activity_id: v.activityId,
        p_template_id: v.templateId,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useTrashActivities() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ ids, restore }: { ids: string[]; restore?: boolean }) => {
      const { data, error } = await supabase
        .from('activities')
        .update({ deleted_at: restore ? null : new Date().toISOString() })
        .in('id', ids)
        .select('id')
      if (error) throw error
      if (data.length < ids.length)
        throw new Error('Some activities could not be changed (permission).')
    },
    onSuccess: invalidate,
  })
}

/** Checklist of an activity's own track, or of one package when `packageId` is given. */
export function useTaskMutations(activityId: string, packageId: string | null = null) {
  const invalidate = useInvalidate()
  const add = useMutation({
    mutationFn: async (
      t: Pick<
        ActivityTaskRow,
        'title' | 'stage_progress_id' | 'is_required' | 'due_date' | 'assigned_to'
      >,
    ) => {
      const { error } = await supabase
        .from('activity_tasks')
        .insert({ ...t, activity_id: activityId, package_id: packageId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const toggle = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from('activity_tasks').update({ is_done: done }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('activity_tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  return { add, toggle, remove }
}
