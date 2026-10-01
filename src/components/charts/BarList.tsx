import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface BarListRow {
  key: string
  label: ReactNode
  value: number
  /** Direct label at the bar end (defaults to the formatted value). */
  valueLabel?: ReactNode
  /** Extra tooltip lines. */
  detail?: ReactNode
  /** Tailwind bg class; defaults to the single series hue. */
  fill?: string
}

/**
 * One series of horizontal bars (labels left, value at the bar end). Used for
 * ordered categories such as funnel phases or aging buckets; colour is one hue
 * (or an ordinal ramp passed per row), never identity.
 */
export function BarList({
  rows,
  format = (v) => String(v),
  emptyText = 'No data yet.',
  labelWidth = 'w-36',
}: {
  rows: BarListRow[]
  format?: (v: number) => string
  emptyText?: string
  labelWidth?: string
}) {
  const max = Math.max(0, ...rows.map((r) => r.value))
  if (!rows.length || max <= 0) return <p className="text-muted-foreground text-sm">{emptyText}</p>

  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li
          key={r.key}
          tabIndex={0}
          className="group relative flex items-center gap-3 rounded-md text-sm outline-none focus-visible:ring-2"
        >
          <span className={cn('text-muted-foreground shrink-0 truncate text-xs', labelWidth)}>
            {r.label}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={cn('block h-3 rounded-r-[4px]', r.fill ?? 'bg-viz-1')}
              style={{ width: r.value > 0 ? `max(2px, ${(r.value / max) * 100}%)` : 0 }}
            />
          </span>
          <span className="shrink-0 text-right text-xs font-medium whitespace-nowrap tabular-nums">
            {r.valueLabel ?? format(r.value)}
          </span>
          {r.detail && (
            <span
              role="tooltip"
              className="bg-popover text-popover-foreground pointer-events-none absolute top-full left-1/3 z-10 mt-1 hidden rounded-md border px-2.5 py-1.5 text-xs shadow-sm group-focus-within:block group-hover:block"
            >
              {r.detail}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
