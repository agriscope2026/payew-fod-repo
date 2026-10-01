import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'
import type { AnnouncementPriority } from '@/types/database'

export const announcementsKey = ['announcements'] as const

/**
 * Announcements for everyone plus the selected programs. Readers only receive
 * live posts (RLS); posters also get their scheduled, expired ones.
 */
export function useAnnouncements(programIds: string[]) {
  return useQuery({
    queryKey: [...announcementsKey, 'list', programIds],
    queryFn: async () => {
      const filter = programIds.length
        ? `program_id.is.null,program_id.in.(${programIds.join(',')})`
        : 'program_id.is.null'
      const { data, error } = await supabase
        .from('v_announcements')
        .select('*')
        .is('deleted_at', null)
        .or(filter)
        .order('pinned', { ascending: false })
        .order('publish_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data
    },
  })
}

export function useAnnouncement(id: string | undefined) {
  return useQuery({
    queryKey: [...announcementsKey, 'one', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_announcements')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Live announcements the signed-in user hasn't opened (sidebar badge). */
export function useUnreadAnnouncements() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...announcementsKey, 'unread', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('v_announcements')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('is_live', true)
        .eq('is_read', false)
      if (error) throw error
      return count ?? 0
    },
  })
}

export interface AnnouncementInput {
  program_id: string | null
  title: string
  body: string
  priority: AnnouncementPriority
  pinned: boolean
  publish_at: string
  expires_at: string | null
}

export function useAnnouncementMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: announcementsKey })

  const save = useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: AnnouncementInput }) => {
      if (id) {
        const { error } = await supabase.from('announcements').update(input).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await supabase
        .from('announcements')
        .insert(input)
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: invalidate,
  })
  const trash = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('announcements')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('mark_announcement_read', { p_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  return { save, trash, markRead }
}
