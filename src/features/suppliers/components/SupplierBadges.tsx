import {
  BanIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDashedIcon,
  ClockAlertIcon,
  PauseCircleIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDate, todayManila } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SupplierStatus } from '@/types/database'
import { expiryState, type ExpiryState } from '../supplier-logic'

const STATUS = {
  active: { label: 'Active', icon: CheckCircle2Icon, className: 'border-success/40 text-success' },
  suspended: {
    label: 'Suspended',
    icon: PauseCircleIcon,
    className: 'border-warning/50 bg-warning/10 text-[oklch(0.45_0.12_70)] dark:text-warning',
  },
  blacklisted: {
    label: 'Blacklisted',
    icon: BanIcon,
    className: 'border-destructive/40 bg-destructive/5 text-destructive',
  },
} satisfies Record<SupplierStatus, { label: string; icon: typeof BanIcon; className: string }>

/** Status always carries an icon + label. */
export function SupplierStatusBadge({ status }: { status: SupplierStatus }) {
  const m = STATUS[status]
  return (
    <Badge variant="outline" className={cn('gap-1', m.className)}>
      <m.icon /> {m.label}
    </Badge>
  )
}

const EXPIRY = {
  valid: { label: 'Valid', icon: ShieldCheckIcon, className: 'text-success' },
  expiring: {
    label: 'Expiring',
    icon: ClockAlertIcon,
    className: 'text-[oklch(0.5_0.13_70)] dark:text-warning',
  },
  expired: { label: 'Expired', icon: CircleAlertIcon, className: 'text-destructive' },
  missing: { label: 'Not on file', icon: CircleDashedIcon, className: 'text-muted-foreground' },
} satisfies Record<ExpiryState, { label: string; icon: typeof BanIcon; className: string }>

/** "Expired · Jan 5, 2026" with an icon; `state` is computed when omitted. */
export function ExpiryLabel({ date, compact }: { date: string | null; compact?: boolean }) {
  const state = expiryState(date, todayManila())
  const m = EXPIRY[state]
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', m.className)} title={m.label}>
      <m.icon className="size-3.5 shrink-0" />
      {compact && date ? formatDate(date) : m.label}
      {!compact && date && <span className="text-muted-foreground">· {formatDate(date)}</span>}
    </span>
  )
}
