import {
  AlarmClockIcon,
  ArrowUpIcon,
  BanIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  ClockIcon,
  EyeIcon,
  SirenIcon,
  type LucideIcon,
} from 'lucide-react'
import type { DirectivePriority, DirectiveStatus, RecipientStatus } from '@/types/database'

type Meta = { label: string; icon: LucideIcon; className: string }

/** Every state carries an icon + label (never color alone). */
export const DIRECTIVE_STATUS: Record<DirectiveStatus, Meta> = {
  open: { label: 'Open', icon: CircleDotIcon, className: 'border-primary/40 text-primary' },
  closed: { label: 'Closed', icon: CheckCircle2Icon, className: 'border-success/40 text-success' },
  withdrawn: { label: 'Withdrawn', icon: BanIcon, className: 'text-muted-foreground' },
}

export const OVERDUE_META: Meta = {
  label: 'Response overdue',
  icon: AlarmClockIcon,
  className: 'border-destructive/40 bg-destructive/5 text-destructive',
}

export const PRIORITY: Record<DirectivePriority, Meta & { rank: number }> = {
  normal: { label: 'Normal', icon: CircleDotIcon, className: 'text-muted-foreground', rank: 0 },
  high: {
    label: 'High',
    icon: ArrowUpIcon,
    className: 'border-warning/50 bg-warning/10 text-[oklch(0.45_0.12_70)] dark:text-warning',
    rank: 1,
  },
  urgent: {
    label: 'Urgent',
    icon: SirenIcon,
    className: 'border-destructive/40 bg-destructive/5 text-destructive',
    rank: 2,
  },
}

export const RECIPIENT_STATUS: Record<RecipientStatus, Meta> = {
  pending: { label: 'Not yet seen', icon: ClockIcon, className: 'text-muted-foreground' },
  acknowledged: {
    label: 'Acknowledged',
    icon: EyeIcon,
    className: 'border-primary/40 text-primary',
  },
  responded: {
    label: 'Responded',
    icon: CheckCircle2Icon,
    className: 'border-success/40 text-success',
  },
}

export const KIND_LABEL = {
  directive: 'Directive',
  overdue_notice: 'Overdue notice',
} as const
