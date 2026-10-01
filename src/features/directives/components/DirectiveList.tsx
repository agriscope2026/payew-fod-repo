import { AlarmClockIcon, ScrollTextIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ProgramChip } from '@/components/common/Badges'
import { useAuth } from '@/features/auth/auth-context'
import { useProfileNames } from '@/features/users/api'
import { formatDate, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DirectiveView } from '@/types/database'
import { KIND_LABEL } from '../status'
import { DirectiveStatusBadge, PriorityBadge, RecipientStatusBadge } from './DirectiveBadges'

/** Compact list of directives; `showEntity` adds the linked activity/beneficiary. */
export function DirectiveList({
  directives,
  showEntity = true,
  dense = false,
}: {
  directives: DirectiveView[]
  showEntity?: boolean
  dense?: boolean
}) {
  const { programs } = useAuth()
  const { data: names } = useProfileNames()
  const programById = new Map(programs.map((p) => [p.id, p]))

  return (
    <ul className="divide-y">
      {directives.map((d) => {
        const program = programById.get(d.program_id)
        const KindIcon = d.kind === 'overdue_notice' ? AlarmClockIcon : ScrollTextIcon
        const waiting =
          d.status === 'open' && (d.my_status === 'pending' || d.my_status === 'acknowledged')
        return (
          <li key={d.id}>
            <Link
              to={`/directives/${d.id}`}
              className={cn(
                'hover:bg-accent/60 flex gap-3 transition-colors',
                dense ? 'px-1 py-2' : 'px-4 py-3',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                  d.kind === 'overdue_notice'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-primary/10 text-primary',
                )}
                aria-hidden
              >
                <KindIcon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn('text-sm', waiting ? 'font-semibold' : 'font-medium')}>
                    {d.title}
                  </span>
                  <DirectiveStatusBadge directive={d} />
                  <PriorityBadge priority={d.priority} />
                  {d.my_status && <RecipientStatusBadge status={d.my_status} />}
                </span>
                <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {!dense && program && <ProgramChip program={program} />}
                  <span>{KIND_LABEL[d.kind]}</span>
                  {showEntity && d.entity_label && (
                    <span className="truncate">
                      {d.entity_code ? `${d.entity_code} · ` : ''}
                      {d.entity_label}
                    </span>
                  )}
                  <span>
                    from {names?.get(d.issued_by ?? '') ?? 'a user'} · {formatRelative(d.issued_at)}
                  </span>
                  {d.response_due && (
                    <span className={cn(d.is_overdue && 'text-destructive font-medium')}>
                      respond by {formatDate(d.response_due)}
                    </span>
                  )}
                  <span>
                    {d.responded_count}/{d.recipients_total} responded
                  </span>
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
