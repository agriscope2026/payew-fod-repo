import { NavLink } from 'react-router-dom'
import { Logo } from '@/components/common/Logo'
import { useAuth } from '@/features/auth/auth-context'
import { ROLE_LABELS } from '@/features/auth/permissions'
import { useMyPendingDirectives } from '@/features/directives/api'
import { useUnreadCount } from '@/features/notifications/api'
import { cn } from '@/lib/utils'
import { navForRole } from './nav-config'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { role, profile, programs } = useAuth()
  const sections = navForRole(role)
  const { data: pendingDirectives = 0 } = useMyPendingDirectives()
  const { data: unread = 0 } = useUnreadCount()
  const counts: Record<string, number> = {
    '/directives': pendingDirectives,
    '/notifications': unread,
  }
  const programLabel =
    role === 'superadmin' ? 'All programs' : programs.map((p) => p.code).join(', ') || '—'

  return (
    <div className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
      <div className="border-sidebar-border flex h-16 shrink-0 items-center border-b px-5">
        <Logo />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="text-sidebar-muted mb-1.5 px-3 text-[11px] font-semibold tracking-wider uppercase">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-sidebar-accent font-medium text-white shadow-[inset_3px_0_0_var(--gold)]'
                          : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-white',
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                    {!!counts[item.to] && (
                      <span
                        className="bg-gold ml-auto min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold text-black tabular-nums"
                        aria-label={`${counts[item.to]} pending`}
                      >
                        {counts[item.to] > 99 ? '99+' : counts[item.to]}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-sidebar-border shrink-0 border-t px-5 py-3 text-xs">
        <p className="font-medium">{role ? ROLE_LABELS[role] : ''}</p>
        <p className="text-sidebar-muted truncate" title={programLabel}>
          {programLabel}
        </p>
        {profile?.office && <p className="text-sidebar-muted truncate">{profile.office}</p>}
      </div>
    </div>
  )
}
