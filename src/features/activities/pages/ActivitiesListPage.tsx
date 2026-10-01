import type { ColumnDef } from '@tanstack/react-table'
import {
  CalendarDaysIcon,
  DownloadIcon,
  KanbanSquareIcon,
  ListChecksIcon,
  ListIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ProgramChip } from '@/components/common/Badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { DataTable } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram, canWriteProgram } from '@/features/auth/permissions'
import { useLocationLookup } from '@/features/locations/api'
import { PHASE_LABEL, PHASES } from '@/features/workflows/constants'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { timestampSlug } from '@/lib/export'
import { formatDate, formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { exportSheet } from '@/lib/xlsx-export'
import type { ActivityView, DisplayStatus } from '@/types/database'
import { useActivities, useTrashActivities } from '../api'
import { ActivityStatusBadge } from '../components/ActivityStatusBadge'
import { STATUS_META } from '../status'
import { useActivityLookups } from '../use-activity-lookups'

const STATUS_ORDER: DisplayStatus[] = [
  'not_started',
  'ongoing',
  'delayed',
  'completed',
  'cancelled',
]

export default function ActivitiesListPage() {
  const { profile, programs, isSuperadmin, user } = useAuth()
  const ws = useWorkspace()
  const lookups = useActivityLookups()
  const location = useLocationLookup()
  const [showTrash, setShowTrash] = useState(false)
  const {
    data = [],
    isPending,
    isError,
    refetch,
  } = useActivities({
    programIds: ws.selectedProgramIds,
    fiscalYearId: ws.fiscalYear?.id ?? null,
    trash: showTrash,
  })
  const trash = useTrashActivities()

  const [view, setView] = useState<'table' | 'kanban'>('table')
  const [status, setStatus] = useState<DisplayStatus | ''>('')
  const [phase, setPhase] = useState('')
  const [provinceId, setProvinceId] = useState('')
  const [responsible, setResponsible] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  const programIds = programs.map((p) => p.id)
  const canCreate = programs.some(
    (p) => !p.archived_at && canWriteProgram(profile, programIds, p.id),
  )
  const canSeeTrash = isSuperadmin || profile?.role === 'program_admin'
  const multiProgram = ws.selectedProgramIds.length > 1

  // Status pills count everything except the status filter itself.
  const base = useMemo(
    () =>
      data.filter(
        (a) =>
          (!phase || a.current_phase === phase) &&
          (!provinceId || a.province_id === provinceId) &&
          (!responsible ||
            a.responsible_user_id === (responsible === 'me' ? user?.id : responsible)) &&
          (!from || (a.start_date ?? '') >= from) &&
          (!to || (a.start_date ?? '') <= to),
      ),
    [data, phase, provinceId, responsible, from, to, user?.id],
  )
  const rows = useMemo(
    () => (status ? base.filter((a) => a.display_status === status) : base),
    [base, status],
  )
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of base) c[a.display_status] = (c[a.display_status] ?? 0) + 1
    return c
  }, [base])

  const responsibles = useMemo(() => {
    const ids = new Set(data.map((a) => a.responsible_user_id).filter(Boolean) as string[])
    return lookups.people.filter((p) => ids.has(p.id))
  }, [data, lookups.people])

  const columns = useMemo<ColumnDef<ActivityView, unknown>[]>(
    () => [
      {
        id: 'title',
        header: 'Activity',
        accessorFn: (a) => `${a.code} ${a.title}`,
        sortingFn: (x, y) => x.original.title.localeCompare(y.original.title),
        cell: ({ row: { original: a } }) => (
          <div className="max-w-md">
            <Link to={`/activities/${a.id}`} className="font-medium hover:underline">
              {a.title}
            </Link>
            <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-mono">{a.code}</span>
              {multiProgram && lookups.program.get(a.program_id) && (
                <ProgramChip program={lookups.program.get(a.program_id)!} />
              )}
              {a.province_id && <span>{location.format(a, { short: true })}</span>}
            </p>
          </div>
        ),
      },
      {
        id: 'stage',
        header: 'Stage',
        accessorFn: (a) => a.current_stage_name ?? '',
        cell: ({ row: { original: a } }) => (
          <div className="min-w-36 text-sm">
            {a.current_stage_name ?? (
              <span className="text-muted-foreground">
                {a.status === 'completed' ? 'Done' : '—'}
              </span>
            )}
            <div className="mt-1 flex items-center gap-2">
              <div className="bg-primary/15 h-1.5 w-20 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{
                    width: `${a.stages_total ? (a.stages_done / a.stages_total) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {a.stages_done}/{a.stages_total}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (a) => STATUS_ORDER.indexOf(a.display_status),
        cell: ({ row: { original: a } }) => <ActivityStatusBadge status={a.display_status} />,
      },
      {
        id: 'due',
        header: 'Due',
        accessorFn: (a) => a.due_date ?? '9999',
        cell: ({ row: { original: a } }) => (
          <div className="text-sm whitespace-nowrap">
            {formatDate(a.due_date)}
            {a.is_overdue && (
              <span className="text-destructive block text-xs">{a.days_overdue}d overdue</span>
            )}
          </div>
        ),
      },
      {
        id: 'responsible',
        header: 'Responsible',
        accessorFn: (a) => lookups.name.person(a.responsible_user_id),
        cell: ({ getValue }) => <span className="text-sm">{(getValue() as string) || '—'}</span>,
      },
      {
        id: 'budget',
        header: 'Budget',
        accessorFn: (a) => Number(a.budget_amount ?? 0),
        cell: ({ row: { original: a } }) => (
          <span className="text-sm whitespace-nowrap tabular-nums">
            {formatPeso(a.budget_amount)}
          </span>
        ),
      },
    ],
    [lookups, location, multiProgram],
  )

  const exportRows = (list: ActivityView[]) =>
    exportSheet(
      `payew-activities-${timestampSlug()}.xlsx`,
      'Activities',
      [
        'Code',
        'Title',
        'Program',
        'Category',
        'Location',
        'Current stage',
        'Stages done',
        'Status',
        'Start',
        'End',
        'Due',
        'Days overdue',
        'Responsible',
        'Budget (PHP)',
        'Beneficiaries',
        'Participants',
      ],
      list.map((a) => [
        a.code,
        a.title,
        lookups.name.program(a.program_id),
        lookups.name.category(a.category_id),
        a.province_id ? location.format(a) : '',
        a.current_stage_name ?? '',
        `${a.stages_done}/${a.stages_total}`,
        STATUS_META[a.display_status].label,
        a.start_date ?? '',
        a.end_date ?? '',
        a.due_date ?? '',
        a.days_overdue || '',
        lookups.name.person(a.responsible_user_id),
        a.budget_amount ?? '',
        a.beneficiaries_count,
        a.participants_total,
      ]),
    ).catch((e) => toast.error(errorMessage(e)))

  const trashSelected = (list: ActivityView[], clear: () => void) => {
    const allowed = list.every((a) => canManageProgram(profile, programIds, a.program_id))
    if (!allowed) return toast.error('Only program admins can move activities to Trash.')
    setConfirm({
      title: showTrash
        ? `Restore ${list.length} activities?`
        : `Move ${list.length} activities to Trash?`,
      description: showTrash
        ? undefined
        : 'Use Trash for records created by mistake; cancel real activities instead.',
      confirmLabel: showTrash ? 'Restore' : 'Move to Trash',
      destructive: !showTrash,
      onConfirm: () =>
        trash
          .mutateAsync({ ids: list.map((a) => a.id), restore: showTrash })
          .then(() => {
            toast.success(showTrash ? 'Restored' : 'Moved to Trash')
            clear()
          })
          .catch((e) => toast.error(errorMessage(e))),
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={showTrash ? 'Activities · Trash' : 'Activities'}
        description={`${ws.fiscalYear?.label ?? ''} · ${ws.programFilter === 'all' ? 'All programs' : lookups.name.program(ws.programFilter)}`}
        actions={
          <>
            <Button variant="outline" disabled={!rows.length} onClick={() => void exportRows(rows)}>
              <DownloadIcon /> Export
            </Button>
            {canCreate && !showTrash && (
              <Button asChild>
                <Link to="/activities/new">
                  <PlusIcon /> New activity
                </Link>
              </Button>
            )}
          </>
        }
      />

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

      <div className="flex flex-wrap items-center gap-2">
        <SelectNative
          aria-label="Stage"
          className="w-48"
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
        >
          <option value="">All stages</option>
          {PHASES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </SelectNative>
        <SelectNative
          aria-label="Province"
          className="w-40"
          value={provinceId}
          onChange={(e) => setProvinceId(e.target.value)}
        >
          <option value="">All provinces</option>
          {[...location.province.values()].map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectNative>
        <SelectNative
          aria-label="Responsible"
          className="w-44"
          value={responsible}
          onChange={(e) => setResponsible(e.target.value)}
        >
          <option value="">Anyone responsible</option>
          <option value="me">Assigned to me</option>
          {responsibles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </SelectNative>
        <label className="text-muted-foreground flex items-center gap-1.5 text-sm">
          Start
          <Input
            type="date"
            aria-label="Start from"
            className="w-38"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          to
          <Input
            type="date"
            aria-label="Start to"
            className="w-38"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {canSeeTrash && (
          <label className="flex items-center gap-2 px-1 text-sm">
            <Checkbox checked={showTrash} onCheckedChange={(c) => setShowTrash(!!c)} /> Trash
          </label>
        )}
        <div
          className="bg-card ml-auto inline-flex rounded-md border p-0.5"
          role="group"
          aria-label="View"
        >
          {(
            [
              ['table', ListIcon, 'Table'],
              ['kanban', KanbanSquareIcon, 'Board'],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-3 py-1 text-sm',
                view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
          <Link
            to="/calendar"
            className="text-muted-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded px-3 py-1 text-sm"
            title="Calendar view (Phase 10)"
          >
            <CalendarDaysIcon className="size-4" /> Calendar
          </Link>
        </div>
      </div>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : view === 'kanban' ? (
        isPending ? (
          <Skeleton className="h-96" />
        ) : (
          <KanbanBoard rows={rows} lookups={lookups} multiProgram={multiProgram} />
        )
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          loading={isPending}
          getRowId={(a) => a.id}
          searchPlaceholder="Search title or code…"
          selectable
          bulkActions={(selected, clear) => (
            <>
              <Button size="sm" variant="outline" onClick={() => void exportRows(selected)}>
                <DownloadIcon /> Export selected
              </Button>
              {canSeeTrash && (
                <Button size="sm" variant="outline" onClick={() => trashSelected(selected, clear)}>
                  <Trash2Icon /> {showTrash ? 'Restore' : 'Move to Trash'}
                </Button>
              )}
            </>
          )}
          rowClassName={(a) => (a.display_status === 'cancelled' ? 'opacity-60' : undefined)}
          empty={
            <EmptyState
              icon={ListChecksIcon}
              title={showTrash ? 'Trash is empty' : 'No activities found'}
              description={
                showTrash
                  ? undefined
                  : 'Change the filters or fiscal year, or create a new activity.'
              }
            />
          }
        />
      )}
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
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

function KanbanBoard({
  rows,
  lookups,
  multiProgram,
}: {
  rows: ActivityView[]
  lookups: ReturnType<typeof useActivityLookups>
  multiProgram: boolean
}) {
  const columns = [
    ...PHASES.filter((p) => p.key !== 'closed').map((p) => ({
      key: p.key as string,
      label: p.label,
      items: rows.filter(
        (a) => a.status !== 'completed' && a.status !== 'cancelled' && a.current_phase === p.key,
      ),
    })),
    {
      key: 'closed',
      label: PHASE_LABEL.closed,
      items: rows.filter(
        (a) => a.status !== 'completed' && a.status !== 'cancelled' && a.current_phase === 'closed',
      ),
    },
    { key: 'completed', label: 'Completed', items: rows.filter((a) => a.status === 'completed') },
  ].filter((c) => c.items.length > 0 || c.key !== 'other')

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => (
        <section
          key={col.key}
          className="bg-muted/40 flex w-64 shrink-0 flex-col rounded-lg border"
          aria-label={col.label}
        >
          <header className="flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-sm font-semibold">{col.label}</h3>
            <Badge variant="secondary">{col.items.length}</Badge>
          </header>
          <ul className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto p-2">
            {col.items.map((a) => (
              <li key={a.id}>
                <Link
                  to={`/activities/${a.id}?tab=workflow`}
                  className={cn(
                    'bg-card hover:border-primary/50 block rounded-md border p-2.5 text-sm shadow-xs transition-colors',
                    a.display_status === 'delayed' && 'border-l-destructive border-l-4',
                  )}
                >
                  <p className="line-clamp-2 font-medium">{a.title}</p>
                  <p className="text-muted-foreground mt-1 font-mono text-[11px]">{a.code}</p>
                  <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    {multiProgram && lookups.program.get(a.program_id) && (
                      <ProgramChip program={lookups.program.get(a.program_id)!} />
                    )}
                    {a.current_stage_name && col.key !== 'completed' && (
                      <span className="truncate">{a.current_stage_name}</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className={a.is_overdue ? 'text-destructive' : 'text-muted-foreground'}>
                      Due {formatDate(a.due_date)}
                      {a.is_overdue && ` · ${a.days_overdue}d late`}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {a.stages_done}/{a.stages_total}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
            {col.items.length === 0 && (
              <li className="text-muted-foreground px-1 py-4 text-center text-xs">None</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  )
}
