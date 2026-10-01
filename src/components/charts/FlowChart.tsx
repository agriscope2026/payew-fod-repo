import { useId, useState } from 'react'
import { cn } from '@/lib/utils'

export interface FlowSeries {
  label: string
  /** Tailwind stroke/fill/bg classes for the series hue. */
  stroke: string
  fill: string
  swatch: string
  values: number[]
}

/**
 * Multi-series line chart over ordered x labels (e.g. months) on ONE peso axis,
 * with an optional dashed reference line (e.g. the allotment). Legend + direct
 * labels on the last point; crosshair and tooltip on hover/focus.
 */
export function FlowChart({
  title,
  labels,
  series,
  reference,
  format,
  height = 220,
}: {
  title: string
  labels: string[]
  series: FlowSeries[]
  reference?: { label: string; value: number }
  format: (v: number) => string
  height?: number
}) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = height
  const pad = { l: 56, r: 64, t: 12, b: 24 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const n = labels.length
  const rawMax = Math.max(reference?.value ?? 0, ...series.flatMap((s) => s.values), 0)
  const max = niceMax(rawMax)
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v: number) => pad.t + ih - (Math.max(v, 0) / max) * ih
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max]
  const last = n - 1

  if (!n || rawMax <= 0) return <p className="text-muted-foreground text-sm">No data yet.</p>

  // Keep end labels from colliding: nudge apart when closer than 12px.
  const ends = series.map((s) => y(s.values[last] ?? 0))
  if (ends.length === 2 && Math.abs(ends[0] - ends[1]) < 12) {
    const mid = (ends[0] + ends[1]) / 2
    const up = ends[0] <= ends[1] ? 0 : 1
    ends[up] = mid - 6
    ends[1 - up] = mid + 6
  }

  return (
    <figure className="space-y-2">
      <figcaption className="sr-only">{title}</figcaption>
      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {series.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={cn('inline-block h-0.5 w-4 rounded-full', s.swatch)} />
            {s.label}
          </li>
        ))}
        {reference && (
          <li className="flex items-center gap-1.5">
            <span className="border-muted-foreground inline-block w-4 border-t border-dashed" />
            {reference.label}
          </li>
        )}
      </ul>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-labelledby={`${id}-desc`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const px = ((e.clientX - rect.left) / rect.width) * W
            const i = Math.round(((px - pad.l) / iw) * (n - 1))
            setHover(Math.min(Math.max(i, 0), n - 1))
          }}
        >
          <desc id={`${id}-desc`}>
            {title}.{' '}
            {series
              .map(
                (s) =>
                  `${s.label}: ${labels.map((l, i) => `${l} ${format(s.values[i] ?? 0)}`).join(', ')}`,
              )
              .join('. ')}
          </desc>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(t)}
                y2={y(t)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={pad.l - 6}
                y={y(t) + 3}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => (
            <text
              key={l}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {l}
            </text>
          ))}
          {reference && reference.value > 0 && (
            <g>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(reference.value)}
                y2={y(reference.value)}
                className="stroke-muted-foreground"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <text
                x={W - pad.r + 4}
                y={y(reference.value) + 3}
                className="fill-muted-foreground text-[10px]"
              >
                {reference.label}
              </text>
            </g>
          )}
          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.t}
              y2={pad.t + ih}
              className="stroke-muted-foreground/50"
              strokeDasharray="3 3"
            />
          )}
          {series.map((s, si) => (
            <g key={s.label}>
              <path
                d={s.values
                  .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
                  .join('')}
                fill="none"
                className={s.stroke}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {hover !== null && (
                <circle
                  cx={x(hover)}
                  cy={y(s.values[hover] ?? 0)}
                  r={4}
                  className={cn(s.fill, 'stroke-card')}
                  strokeWidth={2}
                />
              )}
              {/* direct label at the line end */}
              <text
                x={x(last) + 6}
                y={ends[si] + 3}
                className="fill-foreground text-[10px] font-semibold"
              >
                {format(s.values[last] ?? 0)}
              </text>
            </g>
          ))}
          {/* invisible focus targets, one per x position */}
          {labels.map((l, i) => (
            <rect
              key={l}
              x={x(i) - iw / Math.max(n - 1, 1) / 2}
              y={pad.t}
              width={iw / Math.max(n - 1, 1)}
              height={ih}
              fill="transparent"
              tabIndex={0}
              aria-label={`${l}: ${series.map((s) => `${s.label} ${format(s.values[i] ?? 0)}`).join(', ')}`}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          ))}
        </svg>
        {hover !== null && (
          <div
            className="bg-popover text-popover-foreground pointer-events-none absolute top-0 rounded-md border px-2.5 py-1.5 text-xs shadow-sm"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: hover > n / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
            }}
          >
            <p className="text-muted-foreground mb-0.5">{labels[hover]}</p>
            {series.map((s) => (
              <p key={s.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <span className={cn('inline-block size-2 rounded-full', s.swatch)} />
                  {s.label}
                </span>
                <strong className="tabular-nums">{format(s.values[hover] ?? 0)}</strong>
              </p>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}

/** Rounds an axis maximum up to 1, 2, 2.5 or 5 × 10ⁿ. */
function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const m = v / p
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10
  return step * p
}
