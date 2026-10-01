import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { useProfileNames } from '@/features/users/api'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ApprovalStatus, ApprovalView } from '@/types/database'
import { STATUS_META, TYPE_META } from '../meta'

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const m = STATUS_META[status]
  return (
    <Badge variant="outline" className={cn('gap-1', m.className)}>
      <m.icon /> {m.label}
    </Badge>
  )
}

export function ApprovalList({ requests, dense }: { requests: ApprovalView[]; dense?: boolean }) {
  const { data: names } = useProfileNames()
  return (
    <ul className="divide-y">
      {requests.map((r) => {
        const t = TYPE_META[r.request_type]
        return (
          <li key={r.id}>
            <Link
              to={`/approvals/${r.id}`}
              className={cn(
                'hover:bg-accent/60 flex gap-3 transition-colors',
                dense ? 'px-1 py-2' : 'px-4 py-3',
              )}
            >
              <span
                className="bg-primary/10 text-primary mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
                aria-hidden
              >
                <t.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn('text-sm', r.can_decide ? 'font-semibold' : 'font-medium')}>
                    {r.title}
                  </span>
                  <ApprovalStatusBadge status={r.status} />
                  {r.can_decide && <Badge>Your decision</Badge>}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {t.label} · by {names?.get(r.requested_by ?? '') ?? 'a user'} ·{' '}
                  {formatRelative(r.requested_at)}
                  {!dense && r.activity_code && ` · ${r.package_code ?? r.activity_code}`}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
