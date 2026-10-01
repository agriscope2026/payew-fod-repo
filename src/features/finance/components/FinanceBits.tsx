import { AlertTriangleIcon, CheckCircle2Icon, CircleAlertIcon, CircleMinusIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RateState } from '../finance-utils'

/** Warnings saved with a record (validation "warn" mode or exceptions). */
export function FlagList({ flags, className }: { flags: string[]; className?: string }) {
  if (!flags.length) return null
  return (
    <ul className={cn('space-y-0.5 text-xs', className)}>
      {flags.map((f) => (
        <li key={f} className="dark:text-warning flex items-start gap-1 text-[oklch(0.5_0.13_70)]">
          <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" /> {f}
        </li>
      ))}
    </ul>
  )
}

/** Thin single-hue progress meter: fill = value, track = lighter step of the same hue. */
export function Meter({
  pct,
  label,
  danger,
}: {
  pct: number | null
  label: string
  danger?: boolean
}) {
  const v = Math.max(0, Math.min(100, pct ?? 0))
  return (
    <div
      className="bg-primary/15 h-1.5 overflow-hidden rounded-full"
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full', danger ? 'bg-destructive' : 'bg-primary')}
        style={{ width: `${v}%` }}
      />
    </div>
  )
}

const RATE = {
  good: { icon: CheckCircle2Icon, label: 'On track', className: 'text-success' },
  warning: {
    icon: AlertTriangleIcon,
    label: 'Watch',
    className: 'text-[oklch(0.5_0.13_70)] dark:text-warning',
  },
  critical: { icon: CircleAlertIcon, label: 'Low', className: 'text-destructive' },
  none: { icon: CircleMinusIcon, label: 'No data', className: 'text-muted-foreground' },
} as const

/** Rate with icon + label (status never by color alone). */
export function RateBadge({ pct, state }: { pct: number | null; state: RateState }) {
  const m = RATE[state]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap',
        m.className,
      )}
    >
      <m.icon className="size-3.5" />
      {pct === null ? '—' : `${pct.toFixed(1)}%`} · {m.label}
    </span>
  )
}
