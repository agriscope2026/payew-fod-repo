import {
  ArrowLeftIcon,
  CheckIcon,
  ClipboardCheckIcon,
  Loader2Icon,
  SearchXIcon,
  Undo2Icon,
  XIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, Route, Routes, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { FormField } from '@/components/common/FormField'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useProcurementLookups } from '@/features/packages/use-procurement-lookups'
import { useSuppliers } from '@/features/suppliers/api'
import { useProfileNames } from '@/features/users/api'
import { useWorkflowTemplates } from '@/features/workflows/api'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatDate, formatDateTime, formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { ApprovalStatus, ApprovalView } from '@/types/database'
import { useApproval, useApprovalActions, useApprovals, type ApprovalBox } from './api'
import { ApprovalList, ApprovalStatusBadge } from './components/ApprovalList'
import { TYPE_META } from './meta'

/** /approvals, /approvals/:id */
export default function ApprovalsModule() {
  return (
    <Routes>
      <Route index element={<ApprovalsListPage />} />
      <Route path=":id" element={<ApprovalDetailPage />} />
    </Routes>
  )
}

function ApprovalsListPage() {
  const { selectedProgramIds } = useWorkspace()
  const [box, setBox] = useState<ApprovalBox>('decide')
  const [status, setStatus] = useState<ApprovalStatus | ''>('pending')
  const { data, isPending, isError, refetch } = useApprovals({
    box,
    status,
    programIds: selectedProgramIds,
  })
  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Extensions, cancellations, stage skips, workflow changes, supplier re-awards, contract variations, obligation exceptions and realignments."
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-card inline-flex rounded-md border p-0.5" role="group" aria-label="Show">
          {(
            [
              ['decide', 'Waiting for me'],
              ['mine', 'My requests'],
              ['all', 'All'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={box === v}
              onClick={() => setBox(v)}
              className={cn(
                'rounded px-3 py-1 text-sm',
                box === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <SelectNative
          aria-label="Status"
          className="w-36"
          value={status}
          onChange={(e) => setStatus(e.target.value as ApprovalStatus | '')}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="">Any status</option>
        </SelectNative>
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        {isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : isPending ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={ClipboardCheckIcon}
            title={box === 'decide' ? 'Nothing waiting for you' : 'No requests'}
            description="Requests are made from activity and package pages (and Finance for realignments)."
          />
        ) : (
          <ApprovalList requests={data} />
        )}
      </Card>
    </div>
  )
}

function ApprovalDetailPage() {
  const { id } = useParams()
  const { data: r, isPending, isError, refetch } = useApproval(id)
  const { data: names } = useProfileNames()
  const { decide, withdraw } = useApprovalActions()
  const [note, setNote] = useState('')
  if (isPending) return <Skeleton className="h-64" />
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (!r) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title="Request not found"
        action={
          <Button asChild variant="outline">
            <Link to="/approvals">Back to Approvals</Link>
          </Button>
        }
      />
    )
  }
  const person = (uid: string | null) => (uid ? (names?.get(uid) ?? 'a user') : 'a user')
  const t = TYPE_META[r.request_type]
  const recordLink = r.package_id
    ? `/activities/${r.activity_id}/packages/${r.package_id}`
    : r.activity_id
      ? `/activities/${r.activity_id}`
      : '/finance?tab=allotments'

  const act = (decision: 'approved' | 'rejected') =>
    decide
      .mutateAsync({ id: r.id, decision, note: note.trim() || undefined })
      .then(() => toast.success(decision === 'approved' ? 'Approved and applied' : 'Rejected'))
      .catch((e) => toast.error(errorMessage(e)))

  return (
    <div className="space-y-6">
      <Link
        to="/approvals"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> Approvals
      </Link>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <t.icon className="size-4" /> {t.label}
          </span>
          <ApprovalStatusBadge status={r.status} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{r.title}</h1>
        <p className="text-muted-foreground text-sm">
          Requested by {person(r.requested_by)} · {formatDateTime(r.requested_at)} ·{' '}
          <Link to={recordLink} className="text-primary hover:underline">
            {r.package_code
              ? `${r.package_code} · ${r.package_title}`
              : r.activity_code
                ? `${r.activity_code} · ${r.activity_title}`
                : 'Program allotments'}
          </Link>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Justification</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-line">{r.justification}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">What changes when approved</CardTitle>
            </CardHeader>
            <CardContent>
              <PayloadDetails r={r} />
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {r.status !== 'pending' ? (
              <div className="space-y-1 text-sm">
                <p>
                  <strong>
                    {r.status === 'withdrawn'
                      ? 'Withdrawn'
                      : `${r.status === 'approved' ? 'Approved' : 'Rejected'} by ${person(r.decided_by)}`}
                  </strong>
                  {r.decided_at && ` · ${formatDateTime(r.decided_at)}`}
                </p>
                {r.decision_note && (
                  <p className="text-muted-foreground whitespace-pre-line">{r.decision_note}</p>
                )}
              </div>
            ) : r.can_decide ? (
              <>
                <FormField id="ap-note" label="Note (required to reject)">
                  <Textarea
                    id="ap-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </FormField>
                <div className="flex gap-2">
                  <Button disabled={decide.isPending} onClick={() => void act('approved')}>
                    {decide.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}{' '}
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    disabled={decide.isPending || !note.trim()}
                    onClick={() => void act('rejected')}
                  >
                    <XIcon /> Reject
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Approving applies the change immediately and notifies the requester.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Waiting for{' '}
                {r.requested_by
                  ? 'a program admin (or the superadmin for admin requests)'
                  : 'a decision'}
                .
              </p>
            )}
            {r.can_withdraw && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  withdraw
                    .mutateAsync(r.id)
                    .then(() => toast.success('Request withdrawn'))
                    .catch((e) => toast.error(errorMessage(e)))
                }
              >
                <Undo2Icon /> Withdraw my request
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PayloadDetails({ r }: { r: ApprovalView }) {
  const p = (r.payload ?? {}) as Record<string, string | number | undefined>
  const { data: suppliers = [] } = useSuppliers()
  const { data: templates = [] } = useWorkflowTemplates()
  const lookups = useProcurementLookups()
  const rows: [string, string][] = []
  switch (r.request_type) {
    case 'extension':
      rows.push(['New due / target date', formatDate(String(p.new_due_date))])
      if (p.new_end_date)
        rows.push(['New end of implementation', formatDate(String(p.new_end_date))])
      break
    case 'workflow_change':
      rows.push(['New workflow', templates.find((t) => t.id === p.template_id)?.name ?? '—'])
      break
    case 'supplier_reaward':
      rows.push([
        'New supplier',
        suppliers.find((s) => s.id === p.supplier_id)?.business_name ?? '—',
      ])
      rows.push(['Contract amount', formatPeso(Number(p.contract_amount))])
      if (p.contract_no) rows.push(['PO / contract No.', String(p.contract_no)])
      break
    case 'contract_variation':
      rows.push(['New contract amount', formatPeso(Number(p.contract_amount))])
      break
    case 'realignment':
      rows.push(['Amount', formatPeso(Number(p.amount))])
      if (p.scope === 'allotment') {
        rows.push(['From', lookups.expenseClassName(String(p.from_expense_class_id))])
        rows.push(['To', lookups.expenseClassName(String(p.to_expense_class_id))])
        if (p.savings_entry_id) rows.push(['Source', 'Procurement savings'])
      } else {
        rows.push(['Scope', 'Activity budgets (see title)'])
      }
      break
    case 'cancellation':
      rows.push([
        'Effect',
        `The ${r.entity_type} is cancelled with this justification as the reason.`,
      ])
      break
    case 'stage_skip':
      rows.push(['Effect', 'The stage is marked skipped and the workflow moves on.'])
      break
    case 'obligation_exception':
      rows.push([
        'Effect',
        'The delivery recorded before its ORS is marked as an approved exception.',
      ])
      break
  }
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
