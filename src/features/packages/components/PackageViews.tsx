import { ClockAlertIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDate, formatPeso, todayManila } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PackageView, PhaseKey } from '@/types/database'
import { categoryIcon } from '../category-meta'
import { PACKAGE_STATUS } from '../status'

const link = (p: PackageView) => `/activities/${p.activity_id}/packages/${p.id}`

// ---------------------------------------------------------------------------
// Board: one column per package phase
// ---------------------------------------------------------------------------
const COLUMNS: { key: PhaseKey; label: string }[] = [
  { key: 'design', label: 'Specifications' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'obligation', label: 'Obligation (ORS)' },
  { key: 'disbursement', label: 'Payment (DV)' },
  { key: 'closed', label: 'Closed' },
]

function column(p: PackageView): PhaseKey {
  if (p.status === 'closed') return 'closed'
  const phase = p.current_phase ?? 'design'
  return COLUMNS.some((c) => c.key === phase) ? phase : 'procurement'
}

export function PackageBoard({ packages }: { packages: PackageView[] }) {
  const open = packages.filter((p) => p.status !== 'cancelled')
  const cancelled = packages.filter((p) => p.status === 'cancelled')
  return (
    <div className="space-y-3">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((c) => {
          const items = open.filter((p) => column(p) === c.key)
          return (
            <section key={c.key} className="bg-muted/40 w-56 shrink-0 rounded-lg p-2">
              <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase">
                {c.label}
                <span className="text-muted-foreground tabular-nums">{items.length}</span>
              </h3>
              <ul className="space-y-2">
                {items.map((p) => {
                  const Icon = categoryIcon(p.category_code)
                  return (
                    <li key={p.id}>
                      <Link
                        to={link(p)}
                        className={cn(
                          'bg-card hover:border-primary/50 block rounded-md border p-2 text-sm shadow-xs',
                          p.display_status === 'delayed' && 'border-destructive/40',
                        )}
                      >
                        <span className="text-muted-foreground flex items-center gap-1 font-mono text-[11px]">
                          <Icon className="size-3" /> {p.code.split('-').pop()}
                        </span>
                        <span className="line-clamp-2 font-medium">{p.title}</span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {p.supplier_name ?? 'No supplier yet'}
                        </span>
                        <span className="mt-1 flex items-center justify-between gap-1 text-xs">
                          <span className="tabular-nums">
                            {formatPeso(p.contract_amount ?? p.abc_amount)}
                          </span>
                          {p.display_status === 'delayed' && (
                            <span className="text-destructive inline-flex items-center gap-0.5">
                              <ClockAlertIcon className="size-3" /> Delayed
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
      {cancelled.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Cancelled: {cancelled.map((p) => `${p.code} ${p.title}`).join(' · ')}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timeline (Gantt): planned window per package, filled by stage progress
// ---------------------------------------------------------------------------
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000

export function PackageTimeline({ packages }: { packages: PackageView[] }) {
  const rows = packages.filter((p) => p.status !== 'cancelled' && p.planned_start && p.planned_end)
  if (!rows.length) return <p className="text-muted-foreground text-sm">No planned dates yet.</p>
  const today = todayManila()
  const start = Math.min(...rows.map((p) => day(p.planned_start!)), day(today))
  const end = Math.max(
    ...rows.map((p) => day(p.due_date ?? p.planned_end!)),
    ...rows.map((p) => day(p.planned_end!)),
  )
  const span = Math.max(end - start, 1)
  const pct = (d: number) => `${((d - start) / span) * 100}%`

  // Month ticks
  const ticks: { label: string; at: number }[] = []
  const cursor = new Date(start * 86_400_000)
  cursor.setUTCDate(1)
  cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  while (cursor.getTime() / 86_400_000 <= end) {
    ticks.push({
      label: cursor.toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' }),
      at: cursor.getTime() / 86_400_000,
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[40rem]">
        <div className="text-muted-foreground relative ml-56 h-5 border-b text-[11px]">
          {ticks.map((t) => (
            <span key={t.at} className="absolute -translate-x-1/2" style={{ left: pct(t.at) }}>
              {t.label}
            </span>
          ))}
        </div>
        <ul>
          {rows.map((p) => {
            const s = day(p.planned_start!)
            const e = day(p.planned_end!) + 1
            const progress = p.stages_total ? p.stages_done / p.stages_total : 0
            const delayed = p.display_status === 'delayed'
            const Icon = categoryIcon(p.category_code)
            const status = PACKAGE_STATUS[p.display_status]
            return (
              <li key={p.id} className="flex h-10 items-center border-b last:border-0">
                <Link
                  to={link(p)}
                  className="flex w-56 shrink-0 items-center gap-1.5 pr-3 text-sm hover:underline"
                >
                  <Icon className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="truncate">{p.title}</span>
                  <status.icon
                    className={cn(
                      'ml-auto size-3.5 shrink-0',
                      delayed ? 'text-destructive' : 'text-muted-foreground',
                    )}
                    aria-label={status.label}
                  />
                </Link>
                <div className="relative h-full flex-1">
                  {ticks.map((t) => (
                    <span
                      key={t.at}
                      className="bg-border/60 absolute inset-y-0 w-px"
                      style={{ left: pct(t.at) }}
                    />
                  ))}
                  <span
                    className="border-foreground/40 absolute inset-y-0 border-l border-dashed"
                    style={{ left: pct(day(today)) }}
                    aria-hidden
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          'bg-primary/20 absolute top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full',
                          delayed && 'ring-destructive ring-1',
                        )}
                        style={{ left: pct(s), width: `calc(${pct(e)} - ${pct(s)})` }}
                        tabIndex={0}
                        aria-label={`${p.title}: ${Math.round(progress * 100)}% of stages done`}
                      >
                        <span
                          className="bg-primary block h-full rounded-full"
                          style={{ width: `${progress * 100}%` }}
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64 space-y-0.5">
                      <p className="font-medium">
                        {p.code} · {p.title}
                      </p>
                      <p>{p.supplier_name ?? 'No supplier yet'}</p>
                      <p>
                        Plan {formatDate(p.planned_start)} – {formatDate(p.planned_end)}
                        {p.due_date && ` · target ${formatDate(p.due_date)}`}
                      </p>
                      <p>
                        {p.stages_done}/{p.stages_total} stages ·{' '}
                        {p.current_stage_name ?? status.label}
                      </p>
                      <p>{status.label}</p>
                    </TooltipContent>
                  </Tooltip>
                  {p.due_date && (
                    <span
                      className="bg-foreground/70 absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2"
                      style={{ left: pct(day(p.due_date) + 1) }}
                      title={`Target ${formatDate(p.due_date)}`}
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        <div className="text-muted-foreground relative ml-56 h-5 text-[11px]">
          <span className="absolute -translate-x-1/2" style={{ left: pct(day(today)) }}>
            ▲ Today
          </span>
        </div>
        <p className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-primary/20 inline-block h-2.5 w-6 rounded-full" /> Planned window
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-primary inline-block h-2.5 w-6 rounded-full" /> Stages done
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-foreground/70 inline-block h-3 w-0.5" /> Target date
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ClockAlertIcon className="text-destructive size-3.5" /> Delayed
          </span>
        </p>
      </div>
    </div>
  )
}
