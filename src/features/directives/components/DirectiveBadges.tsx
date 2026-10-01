import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DirectivePriority, DirectiveView, RecipientStatus } from '@/types/database'
import { DIRECTIVE_STATUS, OVERDUE_META, PRIORITY, RECIPIENT_STATUS } from '../status'

function MetaBadge({
  meta,
  className,
}: {
  meta: { label: string; icon: typeof OVERDUE_META.icon; className: string }
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn('gap-1', meta.className, className)}>
      <meta.icon /> {meta.label}
    </Badge>
  )
}

/** Overdue wins over "Open" because it's what needs attention. */
export function DirectiveStatusBadge({
  directive,
}: {
  directive: Pick<DirectiveView, 'status' | 'is_overdue'>
}) {
  return (
    <MetaBadge meta={directive.is_overdue ? OVERDUE_META : DIRECTIVE_STATUS[directive.status]} />
  )
}

export function PriorityBadge({ priority }: { priority: DirectivePriority }) {
  if (priority === 'normal') return null
  return <MetaBadge meta={PRIORITY[priority]} />
}

export function RecipientStatusBadge({ status }: { status: RecipientStatus }) {
  return <MetaBadge meta={RECIPIENT_STATUS[status]} />
}
