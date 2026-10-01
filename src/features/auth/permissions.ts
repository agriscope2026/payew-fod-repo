import type { AppRole, ProfileRow } from '@/types/database'

export const ROLE_LABELS: Record<AppRole, string> = {
  superadmin: 'Superadmin',
  program_admin: 'Program Admin',
  program_staff: 'Program Staff',
}

export function hasRole(profile: ProfileRow | null, roles: readonly AppRole[]) {
  return !!profile && roles.includes(profile.role)
}

/**
 * UI-level hints only. The database enforces the real rules through RLS;
 * these helpers just decide what to show.
 */
export function canManageProgram(
  profile: ProfileRow | null,
  programIds: readonly string[],
  programId: string,
) {
  if (!profile) return false
  if (profile.role === 'superadmin') return true
  return profile.role === 'program_admin' && programIds.includes(programId)
}

/** Mirrors SQL can_write_program(): admins, plus staff allowed to edit activities. */
export function canWriteProgram(
  profile: ProfileRow | null,
  programIds: readonly string[],
  programId: string,
) {
  if (canManageProgram(profile, programIds, programId)) return true
  return (
    !!profile &&
    profile.role === 'program_staff' &&
    profile.can_edit_activities &&
    programIds.includes(programId)
  )
}
