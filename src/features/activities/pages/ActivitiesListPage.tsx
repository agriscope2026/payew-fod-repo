import {
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  ListChecksIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { BarList } from '@/components/charts/BarList'
import { FlowChart } from '@/components/charts/FlowChart'
import { ProgramChip } from '@/components/common/Badges'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { canWriteProgram } from '@/features/auth/permissions'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatPesoCompact } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { ActivityPhysicalRow, ActivityView, DisplayStatus } from '@/types/database'
import { useActivities } from '../api'
import { ActivityCards } from '../components/ActivityCards'
import { ActivityDialog } from '../components/ActivityDialog'
import { ActivityStatusBadge } from '../components/ActivityStatusBadge'
import { exportPhysicalSheet } from '../physical-export'
import { bedColumns, MONTH_LABELS, sum, twelve, useActivityPhysical } from '../physical'
import { STATUS_META } from '../status'
import { useActivityLookups } from '../use-activity-lookups'

const STATUS_ORDER: DisplayStatus[] = [
  'not_started',
  'ongoing',
  'delayed',
  'completed',
  'cancelled',
]

/**
 * Activities (Physical): monthly and quarterly physical targets and accomplishments
 * (BED 2), with each activity's workflow. Activities in the WFP appear here by themselves.
 */
export default function ActivitiesListPage() {
  const { profile, programs, isSuperadmin } = useAuth()
  const ws = useWorkspace()
  const lookups = useActivityLookups()
  const [showTrash, setShowTrash] = useState(false)
  const fyId = ws.fiscalYear?.id ?? null
  const {
    data = [],
    isPending,
    isError,
    refetch,
  } = useActivities({
    programIds: ws.selectedProgramIds,
    fiscalYearId: fyId,
    trash: showTrash,
  })
  const { data: physical = new Map<string, ActivityPhysicalRow>() } = useActivityPhysical(
    ws.selectedProgramIds,
    fyId,
  )
  const [status, setStatus] = useState<DisplayStatus | ''>('')
  const [search, setSearch] = useState('')
  const [show, setShow] = useState<'targets' | 'done'>('targets')
  const [layout, setLayout] = useState<'table' | 'cards'>('table')
  const [open, setOpen] = useState<ActivityView | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [closedPhases, setClosedPhases] = useState<Set<string>>(() => new Set())

  const programIds = programs.map((p) => p.id)
  const canCreate = programs.some(
    (p) => !p.archived_at && canWriteProgram(profile, programIds, p.id),
  )
  const canSeeTrash = isSuperadmin || profile?.role === 'program_admin'
  const multiProgram = ws.selectedProgramIds.length > 1

  // WFP order first, then the rest by title.
  const ordered = useMemo(
    () =>
      [...data].sort((a, b) => {
        const x = physical.get(a.id)?.wfp_order ?? Number.MAX_SAFE_INTEGER
        const y = physical.get(b.id)?.wfp_order ?? Number.MAX_SAFE_INTEGER
        return x - y || a.title.localeCompare(b.title)
      }),
    [data, physical],
  )
  const base = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? ordered.filter((a) => `${a.code} ${a.title}`.toLowerCase().includes(q)) : ordered
  }, [ordered, search])
  const rows = useMemo(
    () => (status ? base.filter((a) => a.display_status === status) : base),
    [base, status],
  )
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of base) c[a.display_status] = (c[a.display_status] ?? 0) + 1
    return c
  }, [base])

  const totals = useMemo(() => {
    const targets = Array(12).fill(0) as number[]
    const done = Array(12).fill(0) as number[]
    let budget = 0
    let obligated = 0
    let disbursed = 0
    for (const a of rows) {
      const p = physical.get(a.id)
      twelve(p?.monthly_targets).forEach((v, i) => (targets[i] += v))
      twelve(p?.monthly_done).forEach((v, i) => (done[i] += v))
      budget += Number(p?.wfp_budget ?? a.budget_amount ?? 0)
      obligated += Number(p?.wfp_obligated ?? 0)
      disbursed += Number(p?.wfp_disbursed ?? 0)
    }
    const cumulative = (xs: number[]) => {
      let run = 0
      return xs.map((v) => (run += v))
    }
    return {
      targets,
      done,
      cumTargets: cumulative(targets),
      cumDone: cumulative(done),
      budget,
      obligated,
      disbursed,
    }
  }, [rows, physical])

  const statusRows = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of rows) {
      const status = physical.get(a.id)?.wfp_status
      if (status) counts.set(status, (counts.get(status) ?? 0) + 1)
    }
    return [...counts]
      .sort((x, y) => y[1] - x[1])
      .map(([label, value]) => ({ key: label, label, value }))
  }, [rows, physical])

  const unitOf = (a: ActivityView) =>
    lookups.name.unit(a.unit_id) || physical.get(a.id)?.unit_label || ''
  const exportFile = () =>
    exportPhysicalSheet({
      rows,
      physical,
      unitOf,
      programLabel:
        ws.programFilter === 'all' ? 'All programs' : lookups.name.program(ws.programFilter),
      fiscalYear: ws.fiscalYear?.label ?? '',
    }).catch((e) => toast.error(errorMessage(e, 'The file could not be created.')))

  const accomplishment =
    sum(totals.targets) > 0 ? (sum(totals.done) / sum(totals.targets)) * 100 : null

  return (
    <div className="space-y-5">
      <PageHeader
        title={showTrash ? 'Activities (Physical) · Trash' : 'Activities (Physical)'}
        description={`${ws.fiscalYear?.label ?? ''} · ${ws.programFilter === 'all' ? 'All programs' : lookups.name.program(ws.programFilter)} · activities in the WFP appear here automatically`}
        actions={
          <>
            <Button variant="outline" disabled={!rows.length} onClick={() => void exportFile()}>
              <DownloadIcon /> Export
            </Button>
            {canCreate && !showTrash && (
              <Button onClick={() => setNewOpen(true)}>
                <PlusIcon /> New activity
              </Button>
            )}
          </>
        }
      />

      {!showTrash && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="space-y-2 pt-4">
              <div>
                <p className="text-sm font-semibold">Physical targets vs accomplishments</p>
                <p className="text-muted-foreground text-xs">
                  Cumulative, by month, for the activities listed below.
                </p>
              </div>
              <FlowChart
                title="Cumulative physical targets and accomplishments by month"
                labels={MONTH_LABELS}
                series={[
                  {
                    label: 'Target',
                    stroke: 'stroke-viz-1',
                    fill: 'fill-viz-1',
                    swatch: 'bg-viz-1',
                    values: totals.cumTargets,
                  },
                  {
                    label: 'Accomplished',
                    stroke: 'stroke-viz-2',
                    fill: 'fill-viz-2',
                    swatch: 'bg-viz-2',
                    values: totals.cumDone,
                  },
                ]}
                format={(v) => v.toLocaleString('en-PH', { maximumFractionDigits: 1 })}
              />
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Tile
              label="Activities"
              value={String(rows.length)}
              hint={`${counts.completed ?? 0} completed · ${counts.delayed ?? 0} delayed`}
            />
            <Tile
              label="Physical accomplishment"
              value={accomplishment === null ? '—' : `${accomplishment.toFixed(1)}%`}
              hint={`${sum(totals.done)} of ${sum(totals.targets)} monthly targets`}
            />
            <Tile
              label="Budget (WFP)"
              value={formatPesoCompact(totals.budget)}
              hint={`Obligated ${formatPesoCompact(totals.obligated)} · disbursed ${formatPesoCompact(totals.disbursed)}`}
            />
            <Card className="col-span-2 gap-1 py-3 lg:col-span-1">
              <CardContent className="space-y-2 px-4">
                <p className="text-muted-foreground text-xs">By status (from the WFP)</p>
                <BarList
                  labelWidth="w-28"
                  rows={statusRows}
                  emptyText="Set a status in the WFP or in an activity’s workflow."
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          <StatusPill
            active={!status}
            onClick={() => setStatus('')}
            label="All"
            count={base.length}
          />
          {STATUS_ORDER.map((s) => (
            <StatusPill
              key={s}
              active={status === s}
              onClick={() => setStatus(status === s ? '' : s)}
              label={STATUS_META[s].label}
              count={counts[s] ?? 0}
              icon={STATUS_META[s].icon}
              danger={s === 'delayed'}
            />
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <SearchIcon className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            aria-label="Search activities"
            placeholder="Search title or code…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="bg-card inline-flex rounded-md border p-0.5" role="group" aria-label="Show">
          {(
            [
              ['targets', 'Targets'],
              ['done', 'Accomplished'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={show === v}
              onClick={() => setShow(v)}
              className={cn(
                'rounded px-3 py-1 text-sm',
                show === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="bg-card inline-flex rounded-md border p-0.5" role="group" aria-label="View">
          {(
            [
              ['table', 'Table'],
              ['cards', 'Cards'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={layout === v}
              onClick={() => setLayout(v)}
              className={cn(
                'rounded px-3 py-1 text-sm',
                layout === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {canSeeTrash && (
          <label className="flex items-center gap-2 px-1 text-sm">
            <Checkbox checked={showTrash} onCheckedChange={(c) => setShowTrash(!!c)} /> Trash
          </label>
        )}
      </div>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ListChecksIcon}
          title={showTrash ? 'Trash is empty' : 'No activities found'}
          description={
            showTrash
              ? undefined
              : 'Add activities in the WFP: a row with an activity and a unit of measure.'
          }
        />
      ) : layout === 'cards' ? (
        <ActivityCards
          rows={rows}
          physical={physical}
          show={show}
          unitOf={unitOf}
          onOpen={setOpen}
        />
      ) : (
        <div className="bg-card scroll-strong max-h-[calc(100vh-8rem)] overflow-auto rounded-md border">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="text-muted-foreground [&_th]:bg-muted text-xs [&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th:first-child]:z-30">
              <tr>
                <th className="bg-muted sticky left-0 z-10 min-w-72 border-b px-3 py-2 text-left font-medium">
                  Activity
                </th>
                <th className="border-b px-2 py-2 text-left font-medium">Unit</th>
                {bedColumns(Array(12).fill(0)).map((c) => (
                  <th
                    key={c.label}
                    className={cn(
                      'border-b px-1.5 py-2 text-right font-medium whitespace-nowrap',
                      c.quarter && 'text-foreground bg-muted',
                    )}
                  >
                    {c.label}
                  </th>
                ))}
                <th className="min-w-44 border-b px-3 py-2 text-left font-medium">Workflow</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, index) => {
                const p = physical.get(a.id)
                const phase = p?.wfp_phase ?? null
                const newPhase =
                  phase !== (physical.get(rows[index - 1]?.id ?? '')?.wfp_phase ?? null)
                const values = twelve(show === 'targets' ? p?.monthly_targets : p?.monthly_done)
                return (
                  <Fragment key={a.id}>
                    {newPhase && phase && (
                      <tr className="bg-primary/5">
                        <th
                          colSpan={20}
                          scope="colgroup"
                          className="border-b px-3 py-1.5 text-left text-xs font-semibold"
                        >
                          <button
                            type="button"
                            aria-expanded={!closedPhases.has(phase)}
                            className="hover:text-primary sticky left-3 inline-flex items-center gap-1.5"
                            onClick={() =>
                              setClosedPhases((old) => {
                                const next = new Set(old)
                                if (next.has(phase)) next.delete(phase)
                                else next.add(phase)
                                return next
                              })
                            }
                          >
                            {closedPhases.has(phase) ? (
                              <ChevronRightIcon className="size-4" />
                            ) : (
                              <ChevronDownIcon className="size-4" />
                            )}
                            {phase}
                            <span className="text-muted-foreground font-normal">
                              · {rows.filter((x) => physical.get(x.id)?.wfp_phase === phase).length}{' '}
                              activities
                            </span>
                          </button>
                        </th>
                      </tr>
                    )}
                    <tr
                      hidden={!!phase && closedPhases.has(phase)}
                      tabIndex={0}
                      onClick={() => setOpen(a)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setOpen(a)
                        }
                      }}
                      className={cn(
                        'hover:bg-accent/50 focus-visible:bg-accent/60 group cursor-pointer outline-none',
                        a.display_status === 'cancelled' && 'opacity-60',
                      )}
                    >
                      <td className="bg-card group-hover:bg-accent/50 sticky left-0 z-10 border-b px-3 py-2">
                        <p className="line-clamp-2 font-medium">{a.title}</p>
                        <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-mono">{a.code}</span>
                          {multiProgram && lookups.program.get(a.program_id) && (
                            <ProgramChip program={lookups.program.get(a.program_id)!} />
                          )}
                          {p?.wfp_row_id && !p.wfp_removed_at && (
                            <Badge variant="outline">WFP</Badge>
                          )}
                          {p?.wfp_removed_at && (
                            <Badge variant="outline" className="border-warning/50 text-warning">
                              Not in WFP
                            </Badge>
                          )}
                        </p>
                      </td>
                      <td className="border-b px-2 py-2 text-xs whitespace-nowrap">
                        {unitOf(a) || '—'}
                      </td>
                      {bedColumns(values).map((c) => (
                        <td
                          key={c.label}
                          className={cn(
                            'border-b px-1.5 py-2 text-right tabular-nums',
                            c.quarter && 'bg-muted/40 font-medium',
                          )}
                        >
                          {c.value || <span className="text-muted-foreground">–</span>}
                        </td>
                      ))}
                      <td className="border-b px-3 py-2">
                        <div className="flex items-center gap-2">
                          <ActivityStatusBadge status={a.display_status} />
                          {p?.wfp_status && <Badge variant="outline">{p.wfp_status}</Badge>}
                        </div>
                        <p className="text-muted-foreground mt-1 truncate text-xs">
                          {a.current_stage_name ?? (a.status === 'completed' ? 'Done' : '—')} ·{' '}
                          {a.stages_done}/{a.stages_total}
                        </p>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
              {/* Stays at the bottom of the table while the rows scroll. */}
              <tr className="[&_td]:bg-muted font-semibold [&_td]:sticky [&_td]:bottom-0 [&_td]:z-20 [&_td]:border-t-2">
                <td className="left-0 !z-30 px-3 py-2">Total</td>
                <td />
                {bedColumns(show === 'targets' ? totals.targets : totals.done).map((c) => (
                  <td key={c.label} className="px-1.5 py-2 text-right tabular-nums">
                    {c.value || '–'}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add activities in the WFP</DialogTitle>
            <DialogDescription>
              Activities come from the Work and Financial Plan, so they are typed only once. In the
              WFP, add a row with the activity under its phase and give it a unit of measure and a
              target. When you save the WFP, the activity appears here with its budget.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button asChild>
              <Link to="/finance">
                <FileSpreadsheetIcon /> Go to the WFP
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {open && (
        <ActivityDialog
          activity={open}
          physical={physical.get(open.id)}
          unitName={unitOf(open)}
          canEdit={!showTrash && canWriteProgram(profile, programIds, open.program_id)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="gap-1 py-3">
      <CardContent className="px-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        <p className="text-muted-foreground truncate text-xs">{hint}</p>
      </CardContent>
    </Card>
  )
}

function StatusPill({
  active,
  onClick,
  label,
  count,
  icon: Icon,
  danger,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  icon?: typeof ListIcon
  danger?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
      )}
    >
      {Icon && <Icon className={cn('size-3.5', !active && danger && 'text-destructive')} />}
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 text-xs tabular-nums',
          active ? 'bg-primary-foreground/20' : 'bg-muted',
        )}
      >
        {count}
      </span>
    </button>
  )
}
