import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { CommentEntity, CommentVisibility, NoteRow, NoteVisibility } from '@/types/database'

export const discussionKeys = {
  comments: (type: CommentEntity, id: string) => ['comments', type, id] as const,
  notes: (type: NoteRow['entity_type'], id: string) => ['notes', type, id] as const,
}

export function useComments(type: CommentEntity, entityId: string) {
  return useQuery({
    queryKey: discussionKeys.comments(type, entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('entity_type', type)
        .eq('entity_id', entityId)
        .is('deleted_at', null)
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

/** Live updates for one record's thread (RLS still applies to what arrives). */
export function useCommentsRealtime(type: CommentEntity, entityId: string) {
  const queryClient = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel(`comments:${type}:${entityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `entity_id=eq.${entityId}` },
        () =>
          void queryClient.invalidateQueries({
            queryKey: discussionKeys.comments(type, entityId),
          }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [type, entityId, queryClient])
}

export function useCommentMutations(type: CommentEntity, entityId: string) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: discussionKeys.comments(type, entityId) })

  const add = useMutation({
    mutationFn: async (input: {
      body: string
      mentions: string[]
      parentId?: string | null
      visibility?: CommentVisibility
    }) => {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          entity_type: type,
          entity_id: entityId,
          body: input.body.trim(),
          mentions: input.mentions,
          parent_id: input.parentId ?? null,
          visibility: input.visibility ?? 'program',
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: invalidate,
  })

  const edit = useMutation({
    mutationFn: async (input: { id: string; body: string; mentions: string[] }) => {
      const { data, error } = await supabase
        .from('comments')
        .update({ body: input.body.trim(), mentions: input.mentions })
        .eq('id', input.id)
        .select('id')
      if (error) throw error
      if (!data.length) throw new Error('You can only edit your own comments.')
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('comments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data.length) throw new Error('You cannot delete this comment.')
    },
    onSuccess: invalidate,
  })

  return { add, edit, remove }
}

/** Comment counts per record id, for tab badges. */
export function useCommentCount(type: CommentEntity, entityId: string) {
  return useQuery({
    queryKey: [...discussionKeys.comments(type, entityId), 'count'],
    enabled: !!entityId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', type)
        .eq('entity_id', entityId)
        .is('deleted_at', null)
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useNotes(type: NoteRow['entity_type'], entityId: string) {
  return useQuery({
    queryKey: discussionKeys.notes(type, entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('entity_type', type)
        .eq('entity_id', entityId)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useNoteMutations(type: NoteRow['entity_type'], entityId: string) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: discussionKeys.notes(type, entityId) })

  const save = useMutation({
    mutationFn: async (input: {
      id?: string
      body: string
      visibility: NoteVisibility
      is_pinned?: boolean
    }) => {
      const fields = {
        body: input.body.trim(),
        visibility: input.visibility,
        ...(input.is_pinned !== undefined && { is_pinned: input.is_pinned }),
      }
      const { error } = input.id
        ? await supabase.from('notes').update(fields).eq('id', input.id)
        : await supabase.from('notes').insert({ entity_type: type, entity_id: entityId, ...fields })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const pin = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase.from('notes').update({ is_pinned: pinned }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('notes').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data.length) throw new Error('You cannot delete this note.')
    },
    onSuccess: invalidate,
  })

  return { save, pin, remove }
}
