import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { IssueRow, ProgressUpdateRow } from '@/types/database'

export const monitoringKey = ['monitoring'] as const

export function useProgressUpdates(activityId: string | undefined) {
  return useQuery({
    queryKey: [...monitoringKey, 'progress', activityId],
    enabled: !!activityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('progress_updates')
        .select('*')
        .eq('activity_id', activityId!)
        .order('as_of_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useActivityIssues(activityId: string | undefined) {
  return useQuery({
    queryKey: [...monitoringKey, 'issues', activityId],
    enabled: !!activityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_issues')
        .select('*')
        .eq('activity_id', activityId!)
        .order('risk_score', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: monitoringKey }),
      queryClient.invalidateQueries({ queryKey: ['activities'] }),
    ])
}

export type ProgressInput = Pick<
  ProgressUpdateRow,
  | 'as_of_date'
  | 'physical_pct'
  | 'quantity_accomplished'
  | 'participants_male'
  | 'participants_female'
  | 'status_flag'
  | 'narrative'
  | 'next_steps'
>

export function useProgressMutations(activityId: string) {
  const invalidate = useInvalidate()
  const save = useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ProgressInput }) => {
      const { error } = id
        ? await supabase.from('progress_updates').update(input).eq('id', id)
        : await supabase.from('progress_updates').insert({ ...input, activity_id: activityId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('progress_updates')
        .delete()
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data.length) throw new Error('You can only delete your own updates.')
    },
    onSuccess: invalidate,
  })
  return { save, remove }
}

export type IssueInput = Pick<
  IssueRow,
  | 'kind'
  | 'title'
  | 'description'
  | 'category'
  | 'severity'
  | 'likelihood'
  | 'status'
  | 'owner_id'
  | 'due_date'
  | 'mitigation'
  | 'resolution'
  | 'package_id'
>

export function useIssueMutations(activityId: string) {
  const invalidate = useInvalidate()
  const save = useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: IssueInput }) => {
      if (id) {
        const { data, error } = await supabase
          .from('issues')
          .update(input)
          .eq('id', id)
          .select('id')
        if (error) throw error
        if (!data.length)
          throw new Error(
            'Only the owner, the person who raised it, or program writers can edit this.',
          )
        return
      }
      const { error } = await supabase.from('issues').insert({ ...input, activity_id: activityId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('issues').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data.length) throw new Error('Only program admins can delete issues.')
    },
    onSuccess: invalidate,
  })
  return { save, remove }
}
