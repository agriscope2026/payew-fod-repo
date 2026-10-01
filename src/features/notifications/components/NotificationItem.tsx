import {
  AlarmClockIcon,
  AlertOctagonIcon,
  AtSignIcon,
  BellIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  GitBranchIcon,
  ListChecksIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  ShieldAlertIcon,
  TrendingUpIcon,
  TruckIcon,
  WalletIcon,
  SirenIcon,
  UserPlusIcon,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { NotificationRow } from '@/types/database'

const ICONS: Record<string, LucideIcon> = {
  comment: MessageSquareIcon,
  mention: AtSignIcon,
  directive: ScrollTextIcon,
  directive_due: CalendarClockIcon,
  stage_due: CalendarClockIcon,
  task_due: ListChecksIcon,
  assignment: UserPlusIcon,
  stage: GitBranchIcon,
  overdue: AlarmClockIcon,
  escalation: SirenIcon,
  supplier_doc: ShieldAlertIcon,
  delivery: TruckIcon,
  payment: WalletIcon,
  issue: AlertOctagonIcon,
  progress: TrendingUpIcon,
  approval: CheckCircle2Icon,
  announcement: MegaphoneIcon,
}

const URGENT = new Set(['overdue', 'escalation', 'directive_due'])

export function NotificationItem({
  notification: n,
  onOpen,
  compact = false,
}: {
  notification: NotificationRow
  onOpen?: (n: NotificationRow) => void
  compact?: boolean
}) {
  const Icon = ICONS[n.type] ?? BellIcon
  const body = (
    <>
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          n.is_read
            ? 'bg-muted text-muted-foreground'
            : URGENT.has(n.type)
              ? 'bg-destructive/10 text-destructive'
              : 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm', !n.is_read && 'font-semibold')}>{n.title}</span>
        {n.body && (
          <span className={cn('text-muted-foreground block text-xs', compact && 'line-clamp-2')}>
            {n.body}
          </span>
        )}
        <time
          dateTime={n.created_at}
          title={formatDateTime(n.created_at)}
          className="text-muted-foreground mt-0.5 block text-[11px]"
        >
          {formatRelative(n.created_at)}
        </time>
      </span>
      {!n.is_read && (
        <span className="bg-primary mt-2 size-2 shrink-0 rounded-full" aria-label="Unread" />
      )}
    </>
  )
  const className = 'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60'

  return n.link ? (
    <Link to={n.link} className={className} onClick={() => onOpen?.(n)}>
      {body}
    </Link>
  ) : (
    <button type="button" className={className} onClick={() => onOpen?.(n)}>
      {body}
    </button>
  )
}
