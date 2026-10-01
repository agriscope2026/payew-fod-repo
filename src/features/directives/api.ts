import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'
import type { DirectiveKind, DirectivePriority, DirectiveStatus } from '@/types/database'

export const directivesKey = ['directives'] as const

export type DirectiveBox = 'inbox' | 'issued' | 'all'

export interface DirectiveFilter {
  box: DirectiveBox
  status?: DirectiveStatus | ''
  programId?: string
  kind?: DirectiveKind | ''
}

export function useDirectives(filter: DirectiveFilter) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...directivesKey, 'list', filter],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from('v_directives')
        .select('*')
        .order('issued_at', { ascending: false })
        .limit(500)
      if (filter.box === 'inbox') q = q.not('my_status', 'is', null)
      if (filter.box === 'issued') q = q.eq('issued_by', user!.id)
      if (filter.status) q = q.eq('status', filter.status)
      if (filter.programId) q = q.eq('program_id', filter.programId)
      if (filter.kind) q = q.eq('kind', filter.kind)
      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}

/** Open directives waiting for the caller's response (badge in the nav / My Tasks). */
export function useMyPendingDirectives() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...directivesKey, 'pending-mine'],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('v_directives')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .in('my_status', ['pending', 'acknowledged'])
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useEntityDirectives(
  entityType: 'activity' | 'package' | 'beneficiary',
  entityId: string,
) {
  return useQuery({
    queryKey: [...directivesKey, 'entity', entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_directives')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('issued_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useDirective(id: string | undefined) {
  return useQuery({
    queryKey: [...directivesKey, 'one', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_directives')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useDirectiveRecipients(id: string | undefined) {
  return useQuery({
    queryKey: [...directivesKey, 'recipients', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('directive_recipients')
        .select('*')
        .eq('directive_id', id!)
      if (error) throw error
      return data
    },
  })
}

export function useOverdueDraft(activityId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...directivesKey, 'overdue-draft', activityId],
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('overdue_notice_draft', {
        p_activity_id: activityId,
      })
      if (error) throw error
      return data
    },
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: directivesKey })
}

export interface IssueDirectiveInput {
  programId: string
  title: string
  body: string
  recipients: string[]
  responseDue: string | null
  priority: DirectivePriority
  entityType?: 'activity' | 'package' | 'beneficiary' | null
  entityId?: string | null
}

export function useIssueDirective() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (input: IssueDirectiveInput) => {
      const { data, error } = await supabase.rpc('issue_directive', {
        p_program_id: input.programId,
        p_title: input.title.trim(),
        p_body: input.body.trim(),
        p_recipients: input.recipients,
        p_response_due: input.responseDue,
        p_priority: input.priority,
        p_entity_type: input.entityType ?? null,
        p_entity_id: input.entityId ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useSendOverdueNotice() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (input: {
      activityId: string
      recipients: string[]
      title: string
      body: string
      responseDue: string | null
      priority: DirectivePriority
    }) => {
      const { data, error } = await supabase.rpc('send_overdue_notice', {
        p_activity_id: input.activityId,
        p_recipients: input.recipients,
        p_title: input.title,
        p_body: input.body,
        p_response_due: input.responseDue,
        p_priority: input.priority,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useDirectiveActions(id: string) {
  const invalidate = useInvalidate()
  const acknowledge = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('acknowledge_directive', { p_directive_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const respond = useMutation({
    mutationFn: async (input: { response: string; proposedDate: string | null }) => {
      const { error } = await supabase.rpc('respond_to_directive', {
        p_directive_id: id,
        p_response: input.response,
        p_proposed_date: input.proposedDate,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const close = useMutation({
    mutationFn: async (input: { note: string; withdraw: boolean }) => {
      const { error } = await supabase.rpc('close_directive', {
        p_directive_id: id,
        p_note: input.note || null,
        p_withdraw: input.withdraw,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  return { acknowledge, respond, close }
}
