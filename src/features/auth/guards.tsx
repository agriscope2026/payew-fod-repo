import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullPageLoader } from '@/components/common/FullPageLoader'
import ForbiddenPage from '@/pages/ForbiddenPage'
import type { AppRole } from '@/types/database'
import { useAuth } from './auth-context'

/** Requires a signed-in, active user; enforces the first-login password change. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status, profile, profileLoading } = useAuth()
  const location = useLocation()

  if (status === 'loading' || profileLoading) return <FullPageLoader />
  if (status === 'signed_out' || !profile) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  if (profile.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  return children ?? <Outlet />
}

/** Renders the 403 page when the user's role is not allowed. Use inside RequireAuth. */
export function RequireRole({
  roles,
  children,
}: {
  roles: readonly AppRole[]
  children?: ReactNode
}) {
  const { role } = useAuth()
  if (!role || !roles.includes(role)) return <ForbiddenPage />
  return children ?? <Outlet />
}
