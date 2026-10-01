import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { invokeFunction, supabase } from '@/lib/supabase'
import type { AppRole, Json, ProfileRow } from '@/types/database'

export type UserListItem = ProfileRow & { program_ids: string[] }

export const usersKey = ['users'] as const

/** Profiles visible to the caller (RLS-scoped) joined with their program memberships. */
export function useUsers() {
  return useQuery({
    queryKey: usersKey,
    queryFn: async (): Promise<UserListItem[]> => {
      const [profiles, memberships] = await Promise.all([
        supabase.from('profiles').select('*').is('deleted_at', null).order('full_name'),
        supabase.from('program_memberships').select('program_id, user_id'),
      ])
      if (profiles.error) throw profiles.error
      if (memberships.error) throw memberships.error
      const byUser = new Map<string, string[]>()
      for (const m of memberships.data) {
        byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), m.program_id])
      }
      return profiles.data.map((p) => ({ ...p, program_ids: byUser.get(p.id) ?? [] }))
    },
  })
}

export interface CreateUserInput {
  email: string
  full_name: string
  position?: string
  office?: string
  contact_no?: string
  role: AppRole
  program_id?: string | null
  program_ids?: string[]
  can_edit_activities?: boolean
  password?: string
  send_reset_email?: boolean
}

export interface CreateUserResult {
  user_id: string
  temporary_password: string
  email_sent: boolean
}

const redirectTo = () => `${window.location.origin}/reset-password`

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      invokeFunction<CreateUserResult>('admin-users', {
        action: 'create',
        ...input,
        redirect_to: redirectTo(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  })
}

export type UserChanges = Partial<
  Pick<
    ProfileRow,
    | 'full_name'
    | 'position'
    | 'office'
    | 'contact_no'
    | 'province_id'
    | 'can_edit_activities'
    | 'is_active'
    | 'role'
    | 'program_id'
  > & { program_ids: string[] }
>

export function useUpdateUser() {
  const queryClient = useQueryClient()
  const { user, refreshProfile } = useAuth()
  return useMutation({
    mutationFn: async ({ userId, changes }: { userId: string; changes: UserChanges }) => {
      const { data, error } = await supabase.rpc('admin_update_user', {
        p_user_id: userId,
        p_changes: changes as Json,
      })
      if (error) throw error
      return data
    },
    onSuccess: async (_data, { userId }) => {
      await queryClient.invalidateQueries({ queryKey: usersKey })
      if (userId === user?.id) await refreshProfile()
    },
  })
}

export function useResetPassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { userId: string; mode: 'temporary' | 'email' }) =>
      invokeFunction<{ temporary_password?: string; email_sent?: boolean }>('admin-users', {
        action: 'reset_password',
        user_id: input.userId,
        mode: input.mode,
        redirect_to: redirectTo(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  })
}

export function useForceLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('admin_force_logout', { p_user_id: userId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  })
}

/** id → full name for every profile the caller can see (uploaders, authors, assignees). */
export function useProfileNames() {
  return useQuery({
    queryKey: ['profile-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name')
      if (error) throw error
      return new Map(data.map((p) => [p.id, p.full_name]))
    },
    staleTime: 10 * 60_000,
  })
}
