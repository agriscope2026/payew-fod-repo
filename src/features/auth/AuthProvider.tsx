import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { AuthContext, meQueryKey, type AuthContextValue } from './auth-context'

async function fetchMe(userId: string) {
  const [profileRes, programsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('programs').select('*').is('deleted_at', null).order('code'),
  ])
  if (profileRes.error) throw profileRes.error
  if (programsRes.error) throw programsRes.error
  return { profile: profileRes.data, programs: programsRes.data ?? [] }
}

/** True when the access token was issued before an admin revoked the user's sessions. */
function isRevoked(session: Session | null, revokedAt: string | null) {
  if (!session || !revokedAt) return false
  try {
    const payload = JSON.parse(
      atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    )
    return typeof payload.iat === 'number' && payload.iat <= new Date(revokedAt).getTime() / 1000
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setInitialized(true)
    })
    // Keep this callback synchronous: calling Supabase inside it can deadlock the auth lock.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setInitialized(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const me = useQuery({
    queryKey: meQueryKey(userId),
    queryFn: () => fetchMe(userId!),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    // Re-check periodically so deactivation / force-logout reaches open tabs.
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000,
  })

  const signOut = useCallback(async () => {
    // 'local' ends this device only; admins revoke all sessions via force logout.
    await supabase.auth.signOut({ scope: 'local' })
    queryClient.clear()
  }, [queryClient])

  // A deactivated, missing or force-logged-out profile ends the session
  // (RLS already denies data access in all three cases).
  const profile = me.data?.profile ?? null
  const revoked = isRevoked(session, profile?.sessions_revoked_at ?? null)
  const blocked =
    !!userId &&
    me.isSuccess &&
    (!profile || !profile.is_active || profile.deleted_at !== null || revoked)
  useEffect(() => {
    if (!blocked) return
    toast.error(
      !profile
        ? 'No profile found for this account.'
        : revoked && profile.is_active
          ? 'You were signed out by an administrator. Please sign in again.'
          : 'Your account is deactivated. Contact your administrator.',
    )
    void signOut()
  }, [blocked, profile, revoked, signOut])

  const refreshProfile = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: meQueryKey(userId) })
  }, [queryClient, userId])

  const value = useMemo<AuthContextValue>(() => {
    const status = !initialized ? 'loading' : session ? 'signed_in' : 'signed_out'
    const activeProfile = blocked ? null : profile
    return {
      status,
      session,
      user: session?.user ?? null,
      profile: activeProfile,
      programs: blocked ? [] : (me.data?.programs ?? []),
      role: activeProfile?.role ?? null,
      isSuperadmin: activeProfile?.role === 'superadmin',
      profileLoading: !!session && (me.isPending || blocked),
      refreshProfile,
      signOut,
    }
  }, [initialized, session, profile, blocked, me.data, me.isPending, refreshProfile, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
