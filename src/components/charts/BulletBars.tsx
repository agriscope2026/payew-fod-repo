import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export interface BulletRow {
  key: string
  label: ReactNode
  /** One value per series, outer level first (e.g. allotment, obligated, disbursed). */
  values: number[]
  href?: string
  /** Short text at the end of the row (e.g. "70% obligated"). */
  note?: ReactNode
}

/** Outer → inner: lightest track, then mid, then the strongest (thinnest) bar. */
const LEVELS = [
  { fill: 'bg-viz-track', height: 'h-4', top: 'top-0' },
  { fill: 'bg-viz-mid', height: 'h-2.5', top: 'top-[3px]' },
  { fill: 'bg-viz-strong', height: 'h-1', top: 'top-1.5' },
] as const

/**
 * Horizontal bullet bars: up to three nested levels of one hue on a shared scale
 * (one axis, all pesos). Legend above, direct note per row, and a per-row tooltip
 * on hover/focus listing every value.
 */
export function BulletBars({
  series,
  rows,
  format,
  emptyText = 'No data yet.',
}: {
  series: string[]
  rows: BulletRow[]
  format: (v: number) => string
  emptyText?: string
}) {
  const max = Math.max(0, ...rows.flatMap((r) => r.values))
  if (!rows.length || max <= 0) return <p className="text-muted-foreground text-sm">{emptyText}</p>

  return (
    <div className="space-y-3">
      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {series.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn('inline-block w-3 rounded-sm', LEVELS[i].fill, LEVELS[i].height)} />
            {s}
          </li>
        ))}
      </ul>
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{r.label}</span>
                {r.note && (
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {r.note}
                  </span>
                )}
              </div>
              <div className="relative mt-1 h-4">
                {r.values.slice(0, 3).map((v, i) => (
                  <span
                    key={i}
                    className={cn(
                      'absolute left-0 rounded-r-[4px]',
                      LEVELS[i].fill,
                      LEVELS[i].height,
                      LEVELS[i].top,
                    )}
                    style={{ width: `${(Math.max(v, 0) / max) * 100}%` }}
                  />
                ))}
              </div>
              <div
                role="tooltip"
                className="bg-popover text-popover-foreground pointer-events-none absolute top-full right-0 z-10 mt-1 hidden min-w-44 rounded-md border px-2.5 py-1.5 text-xs shadow-sm group-focus-within:block group-hover:block"
              >
                {series.map((s, i) => (
                  <div key={s} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <span className={cn('inline-block size-2 rounded-sm', LEVELS[i].fill)} />
                      {s}
                    </span>
                    <strong className="tabular-nums">{format(r.values[i] ?? 0)}</strong>
                  </div>
                ))}
              </div>
            </>
          )
          const label = `${typeof r.label === 'string' ? r.label : r.key}: ${series
            .map((s, i) => `${s} ${format(r.values[i] ?? 0)}`)
            .join(', ')}`
          return (
            <li key={r.key} className="group relative">
              {r.href ? (
                <Link
                  to={r.href}
                  aria-label={label}
                  className="hover:bg-muted/60 -mx-1.5 block rounded-md px-1.5 py-0.5"
                >
                  {body}
                </Link>
              ) : (
                <div tabIndex={0} aria-label={label} className="-mx-1.5 rounded-md px-1.5 py-0.5">
                  {body}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
