import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'
import type { WorkItem } from '@/types/database'

export const tasksKey = ['my-tasks'] as const

/** The caller's inbox: stages, checklist tasks, directives, approvals and issues. */
export function useMyWorkItems() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...tasksKey, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_work_items')
      if (error) throw error
      return data
    },
  })
}

/** Ticks a checklist task from the inbox. */
export function useCompleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('activity_tasks').update({ is_done: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKey })
      void queryClient.invalidateQueries({ queryKey: ['activities'] })
      void queryClient.invalidateQueries({ queryKey: ['packages'] })
    },
  })
}

/** Where an inbox row opens. */
export function workItemHref(i: WorkItem) {
  const base = i.activity_id
    ? i.package_id
      ? `/activities/${i.activity_id}/packages/${i.package_id}`
      : `/activities/${i.activity_id}`
    : null
  switch (i.kind) {
    case 'stage':
      return `${base}?tab=workflow`
    case 'task':
      return `${base}?tab=checklist`
    case 'issue':
      return `/activities/${i.activity_id}?tab=issues`
    case 'directive':
      return `/directives/${i.item_id}`
    case 'approval':
      return `/approvals/${i.item_id}`
  }
}
