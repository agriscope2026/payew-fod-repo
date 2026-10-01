import { useId, useState } from 'react'
import { formatDate } from '@/lib/format'

export interface MiniPoint {
  date: string
  value: number
}

/**
 * Single-series line chart (one hue, no legend — the title names it), 2px line,
 * 8px markers with a surface ring, recessive grid, crosshair + tooltip on hover/focus.
 */
export function MiniLineChart({
  title,
  points,
  max = 100,
  format = (v) => `${Math.round(v)}%`,
  height = 140,
}: {
  title: string
  points: MiniPoint[]
  max?: number
  format?: (v: number) => string
  height?: number
}) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const data = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const W = 320
  const H = height
  const pad = { l: 34, r: 10, t: 10, b: 22 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const t0 = data.length ? Date.parse(data[0].date) : 0
  const t1 = data.length ? Date.parse(data[data.length - 1].date) : 1
  const x = (d: string) => pad.l + (t1 === t0 ? iw / 2 : ((Date.parse(d) - t0) / (t1 - t0)) * iw)
  const y = (v: number) => pad.t + ih - (Math.min(Math.max(v, 0), max) / max) * ih
  const path = data
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join('')
  const ticks = [0, max / 2, max]
  const h = hover === null ? null : data[hover]

  return (
    <figure className="space-y-1">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      {data.length === 0 ? (
        <p className="text-muted-foreground text-xs">No data yet.</p>
      ) : (
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
              let best = 0
              data.forEach((p, i) => {
                if (Math.abs(x(p.date) - px) < Math.abs(x(data[best].date) - px)) best = i
              })
              setHover(best)
            }}
          >
            <desc id={`${id}-desc`}>
              {title}: {data.map((p) => `${formatDate(p.date)} ${format(p.value)}`).join(', ')}
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
                  className="fill-muted-foreground text-[9px]"
                >
                  {format(t)}
                </text>
              </g>
            ))}
            <text x={pad.l} y={H - 6} className="fill-muted-foreground text-[9px]">
              {formatDate(data[0].date)}
            </text>
            {data.length > 1 && (
              <text
                x={W - pad.r}
                y={H - 6}
                textAnchor="end"
                className="fill-muted-foreground text-[9px]"
              >
                {formatDate(data[data.length - 1].date)}
              </text>
            )}
            {h && (
              <line
                x1={x(h.date)}
                x2={x(h.date)}
                y1={pad.t}
                y2={pad.t + ih}
                className="stroke-muted-foreground/50"
                strokeDasharray="3 3"
              />
            )}
            <path
              d={path}
              fill="none"
              className="stroke-primary"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {data.map((p, i) => (
              <circle
                key={p.date + i}
                cx={x(p.date)}
                cy={y(p.value)}
                r={4}
                className="fill-primary stroke-card"
                strokeWidth={2}
                tabIndex={0}
                aria-label={`${formatDate(p.date)}: ${format(p.value)}`}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            ))}
            {/* direct label on the latest point */}
            <text
              x={x(data[data.length - 1].date) - 6}
              y={y(data[data.length - 1].value) - 8}
              textAnchor="end"
              className="fill-foreground text-[10px] font-semibold"
            >
              {format(data[data.length - 1].value)}
            </text>
          </svg>
          {h && (
            <div
              className="bg-popover pointer-events-none absolute top-0 rounded-md border px-2 py-1 text-xs shadow-sm"
              style={{ left: `${(x(h.date) / W) * 100}%`, transform: 'translateX(-50%)' }}
            >
              <span className="text-muted-foreground">{formatDate(h.date)}</span>{' '}
              <strong>{format(h.value)}</strong>
            </div>
          )}
        </div>
      )}
    </figure>
  )
}
