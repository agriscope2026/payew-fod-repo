import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'
import type { AppRole, ProfileRow, ProgramRow } from '@/types/database'

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in'

export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  user: User | null
  /** Null while loading or when signed out. */
  profile: ProfileRow | null
  /** Programs visible to the user (superadmin: all; others: their memberships). */
  programs: ProgramRow[]
  role: AppRole | null
  isSuperadmin: boolean
  /** True while the session exists but the profile is still being fetched. */
  profileLoading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const meQueryKey = (userId: string | undefined) => ['me', userId] as const

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
