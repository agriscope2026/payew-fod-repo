import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'

const keys = {
  all: ['notifications'] as const,
  list: (filter: NotificationFilter) => ['notifications', 'list', filter] as const,
  unread: ['notifications', 'unread-count'] as const,
}

export interface NotificationFilter {
  unreadOnly?: boolean
  type?: string
  programId?: string
  limit?: number
}

export function useNotifications(filter: NotificationFilter = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.list(filter),
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filter.limit ?? 50)
      if (filter.unreadOnly) q = q.eq('is_read', false)
      if (filter.type) q = q.eq('type', filter.type)
      if (filter.programId) q = q.eq('program_id', filter.programId)
      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}

export function useUnreadCount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.unread,
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useMarkRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useMarkAllRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('mark_all_notifications_read')
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

/** Subscribes to the user's notification inserts/updates and refreshes the bell. */
export function useNotificationsRealtime(onNew?: (title: string) => void) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          void queryClient.invalidateQueries({ queryKey: keys.all })
          const type = (payload.new as { type?: string } | null)?.type ?? ''
          if (type.startsWith('directive') || type === 'escalation') {
            void queryClient.invalidateQueries({ queryKey: ['directives'] })
          }
          if (payload.eventType === 'INSERT' && onNew) {
            onNew((payload.new as { title: string }).title)
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, queryClient, onNew])
}

/** Types a user may mute (directives, escalations and system notices always arrive). */
export const MUTABLE_TYPES = [
  ['comment', 'Comments and replies on records you follow'],
  ['mention', '@mentions'],
  ['assignment', 'Assignments (responsible person, stages, checklist items)'],
  ['stage', 'Stage moves and activity completion'],
  ['stage_due', 'Stage deadline reminders'],
  ['task_due', 'Checklist due-date reminders'],
  ['delivery', 'Delivery schedules and late deliveries'],
  ['progress', 'Progress update reminders'],
] as const

export function useSaveNotificationPrefs() {
  const { user, refreshProfile } = useAuth()
  return useMutation({
    mutationFn: async (muted: string[]) => {
      const { error } = await supabase
        .from('profiles')
        .update({ notification_prefs: { muted } })
        .eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => refreshProfile(),
  })
}

/** Superadmin: run the daily reminder/escalation sweep now. */
export function useRunSweep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const results = await Promise.all([
        supabase.rpc('run_notification_sweep', {}),
        supabase.rpc('run_finance_reminders', {}),
        supabase.rpc('run_monitoring_reminders', {}),
      ])
      const merged: Record<string, number | string> = {}
      for (const r of results) {
        if (r.error) throw r.error
        Object.assign(merged, r.data as Record<string, number | string>)
      }
      return merged
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}
