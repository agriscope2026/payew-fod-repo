import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { getFileUrl, uploadFile } from '@/features/files/api'
import { compressSquareJpeg } from '@/lib/image'
import { supabase } from '@/lib/supabase'

export type ProfileInput = {
  full_name: string
  position: string | null
  office: string | null
  province_id: string | null
  contact_no: string | null
}

/** Signed URL of an avatar (attachment id in profiles.avatar_key); refreshed before it expires. */
export function useAvatarUrl(attachmentId: string | null | undefined) {
  return useQuery({
    queryKey: ['avatar', attachmentId],
    enabled: !!attachmentId,
    staleTime: 8 * 60_000,
    refetchInterval: 8 * 60_000,
    queryFn: () => getFileUrl(attachmentId!, 'inline'),
  })
}

export function useMyRecentActivity() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-recent-activity', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_recent_activity', { p_limit: 30 })
      if (error) throw error
      return data
    },
  })
}

export function useProfileMutations() {
  const { user, profile, refreshProfile } = useAuth()
  const queryClient = useQueryClient()
  const done = async () => {
    await refreshProfile()
    void queryClient.invalidateQueries({ queryKey: ['profile-names'] })
    void queryClient.invalidateQueries({ queryKey: ['my-recent-activity'] })
  }

  const save = useMutation({
    mutationFn: async (input: ProfileInput) => {
      const { error } = await supabase.from('profiles').update(input).eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: done,
  })

  /**
   * Compresses the photo to a 512 px square JPEG, uploads it as a personal file,
   * points the profile at it and trashes the old one.
   */
  const setAvatar = useMutation({
    mutationFn: async (file: File | null) => {
      const previous = profile?.avatar_key ?? null
      let next: string | null = null
      if (file) {
        const row = await uploadFile(await compressSquareJpeg(file), {
          program_id: null,
          entity_type: 'profile',
          entity_id: user!.id,
          description: 'Profile photo',
        })
        next = row.id
      }
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_key: next })
        .eq('id', user!.id)
      if (error) throw error
      if (previous && previous !== next) {
        await supabase
          .from('attachments')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', previous)
      }
    },
    onSuccess: done,
  })

  return { save, setAvatar }
}
