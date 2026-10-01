import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StatusPart {
  key: string
  label: string
  count: number
  /** Status colour (bg class) — reserved status hues, always paired with icon + label. */
  fill: string
  icon: LucideIcon
  iconClass?: string
}

/** Part-to-whole strip of statuses (2px gaps between segments) with a counted legend. */
export function StatusStrip({ parts, label }: { parts: StatusPart[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.count, 0)
  return (
    <div className="space-y-2">
      <div
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.count}`).join(', ')}`}
      >
        {total === 0 ? (
          <span className="bg-muted flex-1" />
        ) : (
          parts
            .filter((p) => p.count > 0)
            .map((p) => (
              <span
                key={p.key}
                className={cn('h-full', p.fill)}
                style={{ flexGrow: p.count, flexBasis: 0 }}
                title={`${p.label}: ${p.count}`}
              />
            ))
        )}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {parts.map((p) => (
          <li key={p.key} className="text-muted-foreground flex items-center gap-1">
            <p.icon className={cn('size-3.5', p.iconClass)} />
            {p.label} <strong className="text-foreground tabular-nums">{p.count}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}
