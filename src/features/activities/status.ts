import {
  BanIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleDotIcon,
  ClockAlertIcon,
  type LucideIcon,
} from 'lucide-react'
import type { DisplayStatus } from '@/types/database'

/** Status always carries an icon + label (never color alone). */
export const STATUS_META: Record<
  DisplayStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  not_started: { label: 'Not started', icon: CircleDashedIcon, className: 'text-muted-foreground' },
  ongoing: { label: 'Ongoing', icon: CircleDotIcon, className: 'border-primary/40 text-primary' },
  delayed: {
    label: 'Delayed',
    icon: ClockAlertIcon,
    className: 'border-destructive/40 bg-destructive/5 text-destructive',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2Icon,
    className: 'border-success/40 text-success',
  },
  cancelled: {
    label: 'Cancelled',
    icon: BanIcon,
    className: 'text-muted-foreground line-through decoration-1',
  },
}
