import { useAuth } from '@/features/auth/auth-context'
import { useAppSettings } from '@/features/settings/api'

/**
 * Whether the caller must use approval requests instead of direct admin actions
 * (cancel, re-award, contract change, extension, workflow change, realignment).
 */
export function useApprovalRouting() {
  const { isSuperadmin } = useAuth()
  const { data } = useAppSettings()
  const adminNeedsSuperadmin = !!data?.approvals?.admin_actions_need_superadmin && !isSuperadmin
  return {
    adminNeedsSuperadmin,
    /** Managers act directly unless the setting routes them through the superadmin. */
    mustRequest: (canManage: boolean) => !canManage || adminNeedsSuperadmin,
  }
}
