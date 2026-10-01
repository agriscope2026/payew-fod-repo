import { useQuery } from '@tanstack/react-query'
import { TZDate } from '@date-fns/tz'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileDownIcon,
  HistoryIcon,
} from 'lucide-react'
import { Fragment, useState } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useProfileNames } from '@/features/users/api'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { exportCsv, timestampSlug } from '@/lib/export'
import { formatDateTime, TIMEZONE } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { AuditLogRow, Json } from '@/types/database'

const PAGE = 50

/** Tables with an audit trigger, grouped for the filter. */
const TABLES: Record<string, string> = {
  activities: 'Activities',
  activity_stage_progress: 'Workflow stages',
  activity_tasks: 'Checklist tasks',
  activity_beneficiaries: 'Activity beneficiaries',
  procurement_packages: 'Procurement packages',
  package_deliveries: 'Deliveries',
  obligations: 'Obligations (ORS)',
  disbursements: 'Disbursements (DV)',
  allotments: 'Allotments',
  finance_plans: 'Plans (WFP/PPMP/APP)',
  finance_plan_rows: 'Plan rows',
  savings_entries: 'Savings',
  approval_requests: 'Approval requests',
  progress_updates: 'Progress updates',
  issues: 'Issues & risks',
  beneficiaries: 'Beneficiaries',
  suppliers: 'Suppliers',
  supplier_documents: 'Supplier documents',
  supplier_ratings: 'Supplier ratings',
  attachments: 'Files',
  comments: 'Comments',
  directives: 'Directives',
  directive_recipients: 'Directive responses',
  announcements: 'Announcements',
  workflow_templates: 'Workflow templates',
  profiles: 'Users / profiles',
  program_memberships: 'Program memberships',
  programs: 'Programs',
  fiscal_years: 'Fiscal years',
  app_settings: 'Settings',
}

const ACTIONS = ['INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE', 'LOGIN'] as const
const ACTION_STYLE: Record<string, string> = {
  INSERT: 'border-success/40 text-success',
  DELETE: 'border-destructive/40 text-destructive',
  SOFT_DELETE: 'border-destructive/40 text-destructive',
  RESTORE: 'border-primary/40 text-primary',
}

interface Filters {
  table: string
  action: string
  actor: string
  from: string
  to: string
  record: string
}

/** Start of a Manila day as ISO (for timestamptz filters). */
const dayStart = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new TZDate(y, m - 1, day, TIMEZONE).toISOString()
}

function useAuditLogs(f: Filters, programIds: string[], page: number) {
  return useQuery({
    queryKey: ['audit-logs', f, programIds, page],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('occurred_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1)
      if (f.table) q = q.eq('table_name', f.table)
      if (f.action) q = q.eq('action', f.action)
      if (f.actor) q = q.eq('actor_id', f.actor)
      if (f.record.trim()) q = q.ilike('record_id', `%${f.record.trim()}%`)
      if (f.from) q = q.gte('occurred_at', dayStart(f.from))
      if (f.to) {
        const next = new Date(dayStart(f.to))
        next.setUTCDate(next.getUTCDate() + 1)
        q = q.lt('occurred_at', next.toISOString())
      }
      // Program-scoped rows follow the selector; system-wide rows (no program) always show.
      if (programIds.length) q = q.or(`program_id.is.null,program_id.in.(${programIds.join(',')})`)
      const { data, error, count } = await q
      if (error) throw error
      return { rows: data, count: count ?? 0 }
    },
  })
}

const display = (v: Json | undefined) =>
  v === undefined ? '' : v === null ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v)

/** /audit-logs — superadmin only (route guard + RLS). */
export default function AuditLogPage() {
  const { selectedProgramIds } = useWorkspace()
  const { data: names } = useProfileNames()
  const [f, setF] = useState<Filters>({
    table: '',
    action: '',
    actor: '',
    from: '',
    to: '',
    record: '',
  })
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const { data, isPending, isError, isFetching, refetch } = useAuditLogs(
    f,
    selectedProgramIds,
    page,
  )
  const set = (k: keyof Filters, v: string) => {
    setF((prev) => ({ ...prev, [k]: v }))
    setPage(0)
  }
  const who = (id: string | null) => (id ? (names?.get(id) ?? 'Unknown user') : 'System')
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE)) : 1

  const exportPage = () =>
    exportCsv(
      `audit-log-${timestampSlug()}.csv`,
      (data?.rows ?? []).map((r) => ({
        occurred_at: formatDateTime(r.occurred_at),
        actor: who(r.actor_id),
        action: r.action,
        table: TABLES[r.table_name] ?? r.table_name,
        record_id: r.record_id ?? '',
        changed_fields: (r.changed_fields ?? []).join(', '),
      })),
      [
        { key: 'occurred_at', label: 'When' },
        { key: 'actor', label: 'Who' },
        { key: 'action', label: 'Action' },
        { key: 'table', label: 'Record type' },
        { key: 'record_id', label: 'Record ID' },
        { key: 'changed_fields', label: 'Changed fields' },
      ],
    )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Log"
        description="Every change to tracked records: who, what and when. Follows the program selector."
        actions={
          <Button variant="outline" size="sm" onClick={exportPage} disabled={!data?.rows.length}>
            <FileDownIcon /> Export page (.csv)
          </Button>
        }
      />

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SelectNative
          aria-label="Record type"
          value={f.table}
          onChange={(e) => set('table', e.target.value)}
        >
          <option value="">All record types</option>
          {Object.entries(TABLES)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </SelectNative>
        <SelectNative
          aria-label="Action"
          value={f.action}
          onChange={(e) => set('action', e.target.value)}
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a.replace('_', ' ').toLowerCase()}
            </option>
          ))}
        </SelectNative>
        <SelectNative
          aria-label="Who"
          value={f.actor}
          onChange={(e) => set('actor', e.target.value)}
        >
          <option value="">Anyone</option>
          {[...(names ?? new Map<string, string>()).entries()]
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, n]) => (
              <option key={id} value={id}>
                {n || id}
              </option>
            ))}
        </SelectNative>
        <Input
          aria-label="From date"
          type="date"
          value={f.from}
          onChange={(e) => set('from', e.target.value)}
        />
        <Input
          aria-label="To date"
          type="date"
          value={f.to}
          onChange={(e) => set('to', e.target.value)}
        />
        <Input
          aria-label="Record ID"
          placeholder="Record ID…"
          value={f.record}
          onChange={(e) => set('record', e.target.value)}
        />
      </div>

      {isError ? (
        <Card>
          <ErrorState onRetry={() => void refetch()} />
        </Card>
      ) : isPending ? (
        <Skeleton className="h-96" />
      ) : data.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={HistoryIcon}
            title="No matching changes"
            description="Try other filters."
          />
        </Card>
      ) : (
        <>
          <div className={cn('overflow-x-auto rounded-lg border', isFetching && 'opacity-70')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-0" />
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Record type</TableHead>
                  <TableHead>Changed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <Fragment key={r.id}>
                    <TableRow>
                      <TableCell>
                        <button
                          type="button"
                          className="hover:bg-muted rounded p-0.5"
                          aria-expanded={open === r.id}
                          aria-label="Show details"
                          onClick={() => setOpen(open === r.id ? null : r.id)}
                        >
                          {open === r.id ? (
                            <ChevronDownIcon className="size-4" />
                          ) : (
                            <ChevronRightIcon className="size-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDateTime(r.occurred_at)}
                      </TableCell>
                      <TableCell className="text-sm">{who(r.actor_id)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ACTION_STYLE[r.action]}>
                          {r.action.replace('_', ' ').toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {TABLES[r.table_name] ?? r.table_name}
                        <span className="text-muted-foreground block max-w-48 truncate font-mono text-[11px]">
                          {r.record_id}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-72 truncate text-xs">
                        {(r.changed_fields ?? []).join(', ') || '—'}
                      </TableCell>
                    </TableRow>
                    {open === r.id && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={5}>
                          <ChangeDetail row={r} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {data.count.toLocaleString('en-PH')} change{data.count === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous page"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeftIcon />
              </Button>
              <span className="tabular-nums">
                {page + 1} / {pages}
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next page"
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ChangeDetail({ row }: { row: AuditLogRow }) {
  const oldData = (row.old_data ?? {}) as Record<string, Json>
  const newData = (row.new_data ?? {}) as Record<string, Json>
  const keys = row.changed_fields?.length
    ? row.changed_fields
    : Object.keys(row.action === 'DELETE' ? oldData : newData)
  if (!keys.length) return <p className="text-muted-foreground text-xs">No field details.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground text-left">
            <th className="py-1 pr-4 font-medium">Field</th>
            {row.action !== 'INSERT' && <th className="py-1 pr-4 font-medium">Before</th>}
            {row.action !== 'DELETE' && <th className="py-1 font-medium">After</th>}
          </tr>
        </thead>
        <tbody className="font-mono">
          {keys.map((k) => (
            <tr key={k} className="border-t align-top">
              <td className="py-1 pr-4 font-sans font-medium">{k}</td>
              {row.action !== 'INSERT' && (
                <td className="text-destructive max-w-80 py-1 pr-4 break-all">
                  {display(oldData[k])}
                </td>
              )}
              {row.action !== 'DELETE' && (
                <td className="text-success max-w-80 py-1 break-all">{display(newData[k])}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
