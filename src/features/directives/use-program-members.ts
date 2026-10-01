import { useCallback } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { useUsers } from '@/features/users/api'

/** Active people (other than you) who can receive directives for a program. */
export function useProgramMembers() {
  const { user } = useAuth()
  const { data: people = [], isPending } = useUsers()
  const membersOf = useCallback(
    (programId: string) =>
      people.filter(
        (p) =>
          p.is_active &&
          p.id !== user?.id &&
          (p.program_ids.includes(programId) || p.role === 'superadmin'),
      ),
    [people, user?.id],
  )
  return { membersOf, isPending }
}
