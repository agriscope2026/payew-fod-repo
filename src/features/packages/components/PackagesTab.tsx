import type { ColumnDef } from '@tanstack/react-table'
import {
  GanttChartIcon,
  KanbanIcon,
  Loader2Icon,
  MergeIcon,
  PackageIcon,
  PlusIcon,
  TableIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { DataTable } from '@/components/common/DataTable'
import { EmptyState } from '@/components/common/EmptyState'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { ActivityView, PackageView } from '@/types/database'
import { useActivityPackages, usePackageActions } from '../api'
import { CategoryTag, PackageStatusBadge } from './PackageBadges'
import { PackageFormDialog } from './PackageFormDialog'
import { PackageBoard, PackageTimeline } from './PackageViews'

type View = 'table' | 'board' | 'timeline'

/** Packages tab of an activity: roll-up, table / board / timeline, add and merge. */
export function PackagesTab({
  activity,
  canEdit,
  canManage,
  members,
}: {
  activity: ActivityView
  canEdit: boolean
  canManage: boolean
  members: { id: string; full_name: string }[]
}) {
  const { data: packages = [], isPending } = useActivityPackages(activity.id)
  const [view, setView] = useState<View>('table')
  const [adding, setAdding] = useState(false)
  const [merging, setMerging] = useState<PackageView[] | null>(null)
  const open = activity.status !== 'cancelled' && !activity.deleted_at

  const live = packages.filter((p) => p.status !== 'cancelled')
  const closed = live.filter((p) => p.status === 'closed').length
  const delayed = live.filter((p) => p.display_status === 'delayed').length
  const abc = live.reduce((s, p) => s + Number(p.abc_amount), 0)
  const contract = live.reduce((s, p) => s + Number(p.contract_amount ?? 0), 0)
  const savings = live.reduce((s, p) => s + Number(p.savings_amount ?? 0), 0)
  const budget = Number(activity.budget_amount ?? 0)
  const pct = live.length ? Math.round((closed / live.length) * 100) : 0

  const columns = useMemo<ColumnDef<PackageView, unknown>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Package',
        cell: ({ row: { original: p } }) => (
          <div className="min-w-0">
            <Link
              to={`/activities/${p.activity_id}/packages/${p.id}`}
              className="font-medium hover:underline"
            >
              {p.title}
            </Link>
            <p className="text-muted-foreground font-mono text-xs">{p.code}</p>
          </div>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        accessorFn: (p) => p.category_name ?? '',
        cell: ({ row: { original: p } }) => (
          <CategoryTag code={p.category_code} name={p.category_name} />
        ),
      },
      {
        id: 'supplier',
        header: 'Supplier',
        accessorFn: (p) => p.supplier_name ?? '',
        cell: ({ row: { original: p } }) =>
          p.supplier_id ? (
            <Link to={`/suppliers/${p.supplier_id}`} className="text-sm hover:underline">
              {p.supplier_name}
            </Link>
          ) : (
            <span className="text-muted-foreground text-sm">Not awarded</span>
          ),
      },
      {
        accessorKey: 'abc_amount',
        header: 'ABC',
        cell: ({ getValue }) => (
          <span className="tabular-nums">{formatPeso(Number(getValue()))}</span>
        ),
      },
      {
        accessorKey: 'contract_amount',
        header: 'Contract',
        cell: ({ row: { original: p } }) =>
          p.contract_amount === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="tabular-nums">
              {formatPeso(p.contract_amount)}
              {Number(p.savings_amount) > 0 && (
                <span className="text-success block text-xs">
                  saves {formatPeso(p.savings_amount)}
                </span>
              )}
            </span>
          ),
      },
      {
        id: 'stage',
        header: 'Current step',
        accessorFn: (p) => p.current_stage_name ?? '',
        cell: ({ row: { original: p } }) => (
          <div className="text-sm">
            {p.current_stage_name ?? (p.status === 'closed' ? 'All steps done' : '—')}
            <span className="text-muted-foreground block text-xs">
              {p.stages_done}/{p.stages_total} steps
              {p.obligation_timing === 'before_delivery' && ' · ORS before delivery'}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'due_date',
        header: 'Target',
        cell: ({ row: { original: p } }) => (
          <span className={cn('text-sm', p.is_overdue && 'text-destructive font-medium')}>
            {formatDate(p.due_date ?? p.planned_end)}
            {p.is_overdue && <span className="block text-xs">{p.days_overdue}d overdue</span>}
          </span>
        ),
      },
      {
        accessorKey: 'display_status',
        header: 'Status',
        cell: ({ row: { original: p } }) => <PackageStatusBadge status={p.display_status} />,
      },
    ],
    [],
  )

  if (isPending) return <Skeleton className="h-64" />

  return (
    <div className="space-y-4">
      <Card className="py-4">
        <CardContent className="grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground text-xs">Packages closed</p>
            <p className="text-base font-semibold">
              {closed} of {live.length}
              {delayed > 0 && (
                <span className="text-destructive text-sm font-normal"> · {delayed} delayed</span>
              )}
            </p>
            <div
              className="bg-primary/15 mt-2 h-2 overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Packages closed"
            >
              <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">ABC allocated</p>
            <p className="text-base font-semibold tabular-nums">{formatPeso(abc)}</p>
            {budget > 0 && (
              <p
                className={cn(
                  'text-xs',
                  abc > budget ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {abc > budget
                  ? `Over the ${formatPeso(budget)} budget by ${formatPeso(abc - budget)}`
                  : `${formatPeso(budget - abc)} of ${formatPeso(budget)} unallocated`}
              </p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Contracts awarded</p>
            <p className="text-base font-semibold tabular-nums">{formatPeso(contract)}</p>
            <p className="text-muted-foreground text-xs">
              {live.filter((p) => p.supplier_id).length} of {live.length} awarded
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Procurement savings</p>
            <p className="text-base font-semibold tabular-nums">{formatPeso(savings)}</p>
            <p className="text-muted-foreground text-xs">ABC − contract, awarded packages</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="bg-card inline-flex rounded-md border p-0.5" role="group" aria-label="View">
          {(
            [
              ['table', 'Table', TableIcon],
              ['board', 'Board', KanbanIcon],
              ['timeline', 'Timeline', GanttChartIcon],
            ] as const
          ).map(([v, label, Icon]) => (
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
        </div>
        {canEdit && open && (
          <Button onClick={() => setAdding(true)}>
            <PlusIcon /> Add package
          </Button>
        )}
      </div>

      {packages.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={PackageIcon}
              title="No packages yet"
              description="Add one package per supplier or lot — lodging, meals, transport, supplies, venue, printing… Each runs its own procurement, delivery and payment steps in parallel."
              action={
                canEdit && open ? (
                  <Button onClick={() => setAdding(true)}>
                    <PlusIcon /> Add package
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : view === 'table' ? (
        <DataTable
          data={packages}
          columns={columns}
          getRowId={(p) => p.id}
          pageSize={50}
          searchPlaceholder="Search packages, suppliers…"
          rowClassName={(p) => (p.status === 'cancelled' ? 'opacity-60' : undefined)}
          selectable={canManage && open}
          bulkActions={(selected, clear) => {
            const mergeable = selected.filter((p) => !p.supplier_id && p.status !== 'cancelled')
            return (
              <Button
                size="sm"
                variant="outline"
                disabled={selected.length < 2 || mergeable.length !== selected.length}
                title="Only unawarded, open packages can be merged"
                onClick={() => {
                  setMerging(selected)
                  clear()
                }}
              >
                <MergeIcon /> Merge {selected.length}
              </Button>
            )
          }}
        />
      ) : view === 'board' ? (
        <PackageBoard packages={packages} />
      ) : (
        <Card>
          <CardContent>
            <PackageTimeline packages={packages} />
          </CardContent>
        </Card>
      )}

      {adding && (
        <PackageFormDialog
          activity={activity}
          allocated={abc}
          members={members}
          onClose={() => setAdding(false)}
        />
      )}
      {merging && <MergeDialog packages={merging} onClose={() => setMerging(null)} />}
    </div>
  )
}

function MergeDialog({ packages, onClose }: { packages: PackageView[]; onClose: () => void }) {
  const { merge } = usePackageActions()
  const [title, setTitle] = useState(packages[0]?.title ?? '')
  const [reason, setReason] = useState('')
  const total = packages.reduce((s, p) => s + Number(p.abc_amount), 0)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge {packages.length} packages</DialogTitle>
          <DialogDescription>
            {packages.map((p) => p.code).join(', ')} become one new package with a combined ABC of{' '}
            {formatPeso(total)}. The originals are cancelled with a note pointing to the new one.
          </DialogDescription>
        </DialogHeader>
        <FormField id="merge-title" label="New package title *">
          <Input id="merge-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField id="merge-reason" label="Reason *">
          <Textarea
            id="merge-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. One supplier can deliver both lots"
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={title.trim().length < 2 || !reason.trim() || merge.isPending}
            onClick={() =>
              merge
                .mutateAsync({
                  ids: packages.map((p) => p.id),
                  title: title.trim(),
                  reason: reason.trim(),
                })
                .then(() => {
                  toast.success('Packages merged')
                  onClose()
                })
                .catch((e) => toast.error(errorMessage(e)))
            }
          >
            {merge.isPending && <Loader2Icon className="animate-spin" />} Merge
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
