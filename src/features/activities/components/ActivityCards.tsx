import { Badge } from '@/components/ui/badge'
import { formatPesoCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ActivityPhysicalRow, ActivityView } from '@/types/database'
import { QUARTER_LABELS, quarters, sum, twelve } from '../physical'
import { ActivityStatusBadge } from './ActivityStatusBadge'

/** The activities as cards, grouped by WFP phase. Opening a card shows the activity. */
export function ActivityCards({
  rows,
  physical,
  show,
  unitOf,
  onOpen,
}: {
  rows: ActivityView[]
  physical: Map<string, ActivityPhysicalRow>
  show: 'targets' | 'done'
  unitOf: (a: ActivityView) => string
  onOpen: (a: ActivityView) => void
}) {
  const groups: { phase: string | null; items: ActivityView[] }[] = []
  for (const a of rows) {
    const phase = physical.get(a.id)?.wfp_phase ?? null
    const last = groups[groups.length - 1]
    if (last && last.phase === phase) last.items.push(a)
    else groups.push({ phase, items: [a] })
  }
  return (
    <div className="space-y-5">
      {groups.map((g, i) => (
        <section key={`${g.phase}-${i}`} className="space-y-2">
          {g.phase && (
            <h3 className="flex flex-wrap items-baseline gap-x-2 border-b pb-1 text-sm font-semibold">
              {g.phase}
              <span className="text-muted-foreground text-xs font-normal">
                {g.items.length} {g.items.length === 1 ? 'activity' : 'activities'}
              </span>
            </h3>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {g.items.map((a) => {
              const p = physical.get(a.id)
              const targets = twelve(p?.monthly_targets)
              const done = twelve(p?.monthly_done)
              const target = sum(targets)
              const accomplished = sum(done)
              const pct = target > 0 ? Math.min(100, (accomplished / target) * 100) : 0
              const byQuarter = quarters(show === 'targets' ? targets : done)
              const unit = unitOf(a)
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpen(a)}
                  className={cn(
                    'bg-card hover:border-primary/60 focus-visible:ring-ring flex w-full flex-col gap-2 rounded-lg border p-3 text-left shadow-xs transition-colors outline-none hover:shadow-sm focus-visible:ring-2',
                    a.display_status === 'cancelled' && 'opacity-60',
                  )}
                >
                  <div>
                    <p className="line-clamp-3 text-sm font-medium">{a.title}</p>
                    <p className="text-muted-foreground mt-0.5 font-mono text-xs">{a.code}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ActivityStatusBadge status={a.display_status} />
                    {p?.wfp_status && <Badge variant="outline">{p.wfp_status}</Badge>}
                    {p?.wfp_removed_at && (
                      <Badge variant="outline" className="border-warning/50 text-warning">
                        Not in WFP
                      </Badge>
                    )}
                  </div>
                  <div className="mt-auto space-y-2 pt-1">
                    <div>
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">Accomplished</span>
                        <span className="tabular-nums">
                          <b>{accomplished}</b> of {target || '—'} {unit}
                        </span>
                      </div>
                      <div
                        className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full"
                        role="meter"
                        aria-label="Accomplished"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(pct)}
                      >
                        <div
                          className="bg-viz-mid h-full rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <dl className="grid grid-cols-4 gap-1 text-center">
                      {byQuarter.map((v, qi) => (
                        <div key={qi} className="bg-muted/50 rounded px-1 py-1">
                          <dt className="text-muted-foreground text-[11px]">
                            {QUARTER_LABELS[qi]}
                          </dt>
                          <dd className="text-sm font-medium tabular-nums">{v || '–'}</dd>
                        </div>
                      ))}
                    </dl>
                    {p?.wfp_budget != null && (
                      <p className="text-muted-foreground text-xs tabular-nums">
                        Budget <b className="text-foreground">{formatPesoCompact(p.wfp_budget)}</b>{' '}
                        · obligated {formatPesoCompact(p.wfp_obligated ?? 0)} · disbursed{' '}
                        {formatPesoCompact(p.wfp_disbursed ?? 0)}
                      </p>
                    )}
                    <p className="text-muted-foreground truncate border-t pt-2 text-xs">
                      {a.current_stage_name ?? (a.status === 'completed' ? 'Done' : 'Workflow')} ·{' '}
                      {a.stages_done}/{a.stages_total} stages
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
