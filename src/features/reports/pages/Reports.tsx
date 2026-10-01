import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardSummary } from '@/features/dashboard/api'
import { pct } from '@/features/finance/finance-utils'
import { PHASE_LABEL } from '@/features/workflows/constants'
import { cn } from '@/lib/utils'
import type { PhaseKey } from '@/types/database'
import {
  useAccomplishmentReport,
  useBeneficiaryReport,
  usePayablesReport,
  useProcurementReport,
  useSavingsReport,
  useSupplierReport,
  type ReportScope,
} from '../api'
import { ReportTable } from '../components/ReportTable'
import { ReportError } from './shared'

export interface ReportProps {
  scope: ReportScope
  programCode: (id: string) => string
}

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  ongoing: 'Ongoing',
  delayed: 'Delayed',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

function Status({ s }: { s: string }) {
  return (
    <span
      className={cn(
        'text-xs font-medium',
        s === 'delayed' && 'text-destructive',
        (s === 'completed' || s === 'closed') && 'text-success',
      )}
    >
      {STATUS_LABEL[s] ?? s}
    </span>
  )
}

function Loading() {
  return <Skeleton className="h-96" />
}

// ---------------------------------------------------------------------------

export function AccomplishmentReport({ scope, programCode }: ReportProps) {
  const { data, isPending, isError, refetch } = useAccomplishmentReport(scope)
  if (isError) return <ReportError onRetry={() => void refetch()} />
  if (isPending || !data) return <Loading />
  type R = (typeof data)[number]
  return (
    <ReportTable<R>
      rows={data}
      rowKey={(r) => r.id}
      exportAs={{ filename: 'accomplishment', sheet: 'Accomplishment' }}
      columns={[
        { key: 'program', label: 'Program', value: (r) => programCode(r.program_id) },
        { key: 'code', label: 'Code', value: (r) => r.code },
        {
          key: 'title',
          label: 'Activity',
          value: (r) => r.title,
          render: (r) => (
            <Link to={`/activities/${r.id}?tab=progress`} className="font-medium hover:underline">
              {r.title}
            </Link>
          ),
        },
        { key: 'target', label: 'Target qty', kind: 'int', value: (r) => r.target_quantity },
        {
          key: 'done',
          label: 'Accomplished',
          kind: 'int',
          value: (r) => r.progress?.quantity_accomplished ?? null,
        },
        {
          key: 'physical',
          label: 'Physical %',
          kind: 'pct',
          value: (r) => (r.progress ? Number(r.progress.physical_pct) : null),
        },
        {
          key: 'asof',
          label: 'Progress as of',
          kind: 'date',
          value: (r) => r.progress?.as_of_date ?? null,
        },
        {
          key: 'budget',
          label: 'Budget',
          kind: 'money',
          total: true,
          value: (r) => Number(r.budget_amount ?? 0),
        },
        {
          key: 'obligated',
          label: 'Obligated',
          kind: 'money',
          total: true,
          value: (r) => Number(r.fin?.obligated ?? 0),
        },
        {
          key: 'disbursed',
          label: 'Disbursed',
          kind: 'money',
          total: true,
          value: (r) => Number(r.fin?.disbursed ?? 0),
        },
        {
          key: 'util',
          label: 'Utilization %',
          kind: 'pct',
          value: (r) => r.fin?.utilization_pct ?? null,
        },
        {
          key: 'benef',
          label: 'Beneficiaries',
          kind: 'int',
          total: true,
          value: (r) => r.beneficiaries_count,
        },
        {
          key: 'status',
          label: 'Status',
          value: (r) => STATUS_LABEL[r.display_status] ?? r.display_status,
          render: (r) => <Status s={r.display_status} />,
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------------------

export function ProcurementReport({ scope, programCode }: ReportProps) {
  const { data, isPending, isError, refetch } = useProcurementReport(scope)
  if (isError) return <ReportError onRetry={() => void refetch()} />
  if (isPending || !data) return <Loading />
  type R = (typeof data)[number]
  return (
    <ReportTable<R>
      rows={data}
      rowKey={(r) => r.id}
      exportAs={{ filename: 'procurement-status', sheet: 'Packages' }}
      columns={[
        { key: 'program', label: 'Program', value: (r) => programCode(r.program_id) },
        {
          key: 'code',
          label: 'Package',
          value: (r) => r.code,
          render: (r) => (
            <Link
              to={`/activities/${r.activity_id}/packages/${r.id}`}
              className="font-mono text-xs hover:underline"
            >
              {r.code}
            </Link>
          ),
        },
        { key: 'title', label: 'Title', value: (r) => r.title },
        { key: 'activity', label: 'Activity', value: (r) => r.activity_code },
        { key: 'category', label: 'Category', value: (r) => r.category_name },
        { key: 'mode', label: 'Mode', value: (r) => r.procurement_mode_name },
        { key: 'supplier', label: 'Supplier', value: (r) => r.supplier_name },
        {
          key: 'abc',
          label: 'ABC',
          kind: 'money',
          total: true,
          value: (r) => Number(r.abc_amount),
        },
        {
          key: 'contract',
          label: 'Contract',
          kind: 'money',
          total: true,
          value: (r) => (r.contract_amount === null ? null : Number(r.contract_amount)),
        },
        {
          key: 'paid',
          label: 'Paid',
          kind: 'money',
          total: true,
          value: (r) => Number(r.fin?.disbursed ?? 0),
        },
        { key: 'award', label: 'Award date', kind: 'date', value: (r) => r.award_date },
        {
          key: 'step',
          label: 'Current step',
          value: (r) =>
            r.current_stage_name ??
            (r.current_phase ? PHASE_LABEL[r.current_phase as PhaseKey] : null),
        },
        { key: 'due', label: 'Due', kind: 'date', value: (r) => r.due_date },
        {
          key: 'late',
          label: 'Days late',
          kind: 'int',
          value: (r) => Math.max(r.days_overdue, r.stage_days_late) || null,
        },
        {
          key: 'status',
          label: 'Status',
          value: (r) => STATUS_LABEL[r.display_status] ?? r.display_status,
          render: (r) => <Status s={r.display_status} />,
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------------------

export function SupplierPerformanceReport({ scope }: ReportProps) {
  const { data, isPending, isError, refetch } = useSupplierReport(scope)
  if (isError) return <ReportError onRetry={() => void refetch()} />
  if (isPending || !data) return <Loading />
  type R = (typeof data)[number]
  return (
    <>
      <p className="text-muted-foreground text-sm">
        On-time deliveries count those made on or before their scheduled date. Ratings are visible
        to program admins and the superadmin only.
      </p>
      <ReportTable<R>
        rows={data}
        rowKey={(r) => r.supplier_id}
        exportAs={{ filename: 'supplier-performance', sheet: 'Supplier performance' }}
        columns={[
          {
            key: 'name',
            label: 'Supplier',
            value: (r) => r.business_name,
            render: (r) => (
              <Link to={`/suppliers/${r.supplier_id}`} className="font-medium hover:underline">
                {r.business_name}
              </Link>
            ),
          },
          {
            key: 'status',
            label: 'Status',
            value: (r) => r.supplier_status,
            className: 'capitalize',
          },
          {
            key: 'packages',
            label: 'Packages',
            kind: 'int',
            total: true,
            value: (r) => Number(r.packages),
          },
          {
            key: 'closed',
            label: 'Closed',
            kind: 'int',
            total: true,
            value: (r) => Number(r.packages_closed),
          },
          {
            key: 'ontime_pkg',
            label: 'Closed on time %',
            kind: 'pct',
            value: (r) => pct(Number(r.closed_on_time), Number(r.packages_closed)),
          },
          {
            key: 'late_pkg',
            label: 'Packages delayed',
            kind: 'int',
            total: true,
            value: (r) => Number(r.packages_late),
          },
          {
            key: 'deliveries',
            label: 'Deliveries',
            kind: 'int',
            total: true,
            value: (r) => Number(r.deliveries),
          },
          {
            key: 'ontime_dl',
            label: 'On-time delivery %',
            kind: 'pct',
            value: (r) => pct(Number(r.deliveries_on_time), Number(r.deliveries)),
          },
          {
            key: 'late_dl',
            label: 'Late deliveries',
            kind: 'int',
            total: true,
            value: (r) => Number(r.deliveries_late),
          },
          {
            key: 'rejected',
            label: 'Rejected',
            kind: 'int',
            total: true,
            value: (r) => Number(r.deliveries_rejected),
          },
          {
            key: 'rating',
            label: 'Avg rating',
            value: (r) => (r.avg_rating === null ? null : Number(r.avg_rating).toFixed(1)),
            render: (r) =>
              r.avg_rating === null ? '—' : `${Number(r.avg_rating).toFixed(1)} ★ (${r.ratings})`,
          },
        ]}
      />
    </>
  )
}

export function SupplierAwardsReport({ scope }: ReportProps) {
  const { data, isPending, isError, refetch } = useSupplierReport(scope)
  if (isError) return <ReportError onRetry={() => void refetch()} />
  if (isPending || !data) return <Loading />
  type R = (typeof data)[number]
  return (
    <ReportTable<R>
      rows={data}
      rowKey={(r) => r.supplier_id}
      exportAs={{ filename: 'supplier-awards-payments', sheet: 'Awards & payments' }}
      columns={[
        {
          key: 'name',
          label: 'Supplier',
          value: (r) => r.business_name,
          render: (r) => (
            <Link to={`/suppliers/${r.supplier_id}`} className="font-medium hover:underline">
              {r.business_name}
            </Link>
          ),
        },
        {
          key: 'packages',
          label: 'Packages',
          kind: 'int',
          total: true,
          value: (r) => Number(r.packages),
        },
        {
          key: 'contract',
          label: 'Awarded (contract)',
          kind: 'money',
          total: true,
          value: (r) => Number(r.contract),
        },
        {
          key: 'obligated',
          label: 'Obligated',
          kind: 'money',
          total: true,
          value: (r) => Number(r.obligated),
        },
        {
          key: 'accepted',
          label: 'Delivered & accepted',
          kind: 'money',
          total: true,
          value: (r) => Number(r.accepted),
        },
        { key: 'paid', label: 'Paid', kind: 'money', total: true, value: (r) => Number(r.paid) },
        {
          key: 'balance',
          label: 'Contract balance',
          kind: 'money',
          total: true,
          value: (r) => Number(r.balance),
        },
        {
          key: 'paid_pct',
          label: 'Paid %',
          kind: 'pct',
          value: (r) => pct(Number(r.paid), Number(r.contract)),
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------------------

const SAVINGS_STATUS: Record<string, string> = {
  suggested: 'Awaiting decision',
  confirmed: 'Confirmed',
  dismissed: 'Dismissed',
}

export function SavingsReport({ scope, programCode }: ReportProps) {
  const { data, isPending, isError, refetch } = useSavingsReport(scope)
  if (isError) return <ReportError onRetry={() => void refetch()} />
  if (isPending || !data) return <Loading />
  type R = (typeof data)[number]
  return (
    <ReportTable<R>
      rows={data}
      rowKey={(r) => r.id}
      exportAs={{ filename: 'procurement-savings', sheet: 'Savings' }}
      columns={[
        { key: 'program', label: 'Program', value: (r) => programCode(r.program_id) },
        {
          key: 'code',
          label: 'Package',
          value: (r) => `${r.code} ${r.title}`,
          render: (r) => (
            <Link to={`/activities/${r.activity_id}/packages/${r.id}`} className="hover:underline">
              <span className="font-medium">{r.title}</span>
              <span className="text-muted-foreground block font-mono text-xs">{r.code}</span>
            </Link>
          ),
        },
        { key: 'supplier', label: 'Supplier', value: (r) => r.supplier_name },
        { key: 'mode', label: 'Mode', value: (r) => r.procurement_mode_name },
        {
          key: 'abc',
          label: 'ABC',
          kind: 'money',
          total: true,
          value: (r) => Number(r.abc_amount),
        },
        {
          key: 'contract',
          label: 'Contract',
          kind: 'money',
          total: true,
          value: (r) => Number(r.contract_amount),
        },
        {
          key: 'savings',
          label: 'Savings',
          kind: 'money',
          total: true,
          value: (r) => Number(r.savings_amount ?? 0),
        },
        {
          key: 'pct',
          label: 'Savings %',
          kind: 'pct',
          value: (r) => pct(Number(r.savings_amount ?? 0), Number(r.abc_amount)),
        },
        {
          key: 'decision',
          label: 'Decision',
          value: (r) =>
            r.entry
              ? SAVINGS_STATUS[r.entry.status]
              : Number(r.savings_amount) > 0
                ? 'Not recorded'
                : '—',
        },
      ]}
    />
  )
}

export function PayablesReport({ scope, programCode }: ReportProps) {
  const { data, isPending, isError, refetch } = usePayablesReport(scope)
  if (isError) return <ReportError onRetry={() => void refetch()} />
  if (isPending || !data) return <Loading />
  type R = (typeof data)[number]
  return (
    <ReportTable<R>
      rows={data}
      rowKey={(r) => r.package_id}
      exportAs={{ filename: 'payables', sheet: 'Payables' }}
      emptyText="No accepted deliveries are waiting for payment."
      columns={[
        { key: 'program', label: 'Program', value: (r) => programCode(r.program_id) },
        {
          key: 'code',
          label: 'Package',
          value: (r) => `${r.code} ${r.title}`,
          render: (r) => (
            <Link
              to={`/activities/${r.activity_id}/packages/${r.package_id}?tab=finance`}
              className="hover:underline"
            >
              <span className="font-medium">{r.title}</span>
              <span className="text-muted-foreground block font-mono text-xs">{r.code}</span>
            </Link>
          ),
        },
        { key: 'activity', label: 'Activity', value: (r) => r.activity_code },
        { key: 'supplier', label: 'Supplier', value: (r) => r.supplier_name },
        {
          key: 'accepted',
          label: 'Accepted',
          kind: 'money',
          total: true,
          value: (r) => Number(r.accepted),
        },
        {
          key: 'paid',
          label: 'Paid',
          kind: 'money',
          total: true,
          value: (r) => Number(r.disbursed),
        },
        {
          key: 'payable',
          label: 'Payable',
          kind: 'money',
          total: true,
          value: (r) => Number(r.delivered_unpaid),
        },
        {
          key: 'since',
          label: 'Oldest acceptance',
          kind: 'date',
          value: (r) => r.oldest_unpaid_acceptance,
        },
        {
          key: 'days',
          label: 'Days outstanding',
          kind: 'int',
          value: (r) => r.days_outstanding,
          render: (r) => (
            <span className={cn(Number(r.days_outstanding) >= 7 && 'text-destructive font-medium')}>
              {r.days_outstanding ?? '—'}
            </span>
          ),
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------------------

export function BeneficiariesReport({ scope }: ReportProps) {
  const { data, isPending, isError, refetch } = useBeneficiaryReport(scope)
  if (isError) return <ReportError onRetry={() => void refetch()} />
  if (isPending || !data) return <Loading />
  type R = (typeof data)[number]
  return (
    <ReportTable<R>
      rows={data}
      rowKey={(r) => r.beneficiary_id}
      exportAs={{ filename: 'beneficiaries-served', sheet: 'Beneficiaries' }}
      emptyText="No beneficiaries are linked to activities in this fiscal year."
      columns={[
        {
          key: 'name',
          label: 'Beneficiary',
          value: (r) => r.name,
          render: (r) => (
            <Link to={`/beneficiaries/${r.beneficiary_id}`} className="font-medium hover:underline">
              {r.name}
            </Link>
          ),
        },
        { key: 'type', label: 'Type', value: (r) => r.type_name },
        { key: 'province', label: 'Province', value: (r) => r.province },
        { key: 'municipality', label: 'Municipality', value: (r) => r.municipality },
        { key: 'programs', label: 'Programs', value: (r) => r.programs },
        { key: 'activities', label: 'Activities', kind: 'int', value: (r) => Number(r.activities) },
        { key: 'male', label: 'Male', kind: 'int', total: true, value: (r) => r.members_male },
        {
          key: 'female',
          label: 'Female',
          kind: 'int',
          total: true,
          value: (r) => r.members_female,
        },
        { key: 'total', label: 'Members', kind: 'int', total: true, value: (r) => r.members_total },
        { key: 'ip', label: 'IP', kind: 'int', total: true, value: (r) => r.members_ip },
        { key: 'youth', label: 'Youth', kind: 'int', total: true, value: (r) => r.members_youth },
        { key: 'pwd', label: 'PWD', kind: 'int', total: true, value: (r) => r.members_pwd },
        {
          key: 'senior',
          label: 'Senior',
          kind: 'int',
          total: true,
          value: (r) => r.members_senior,
        },
        {
          key: 'participants',
          label: 'Participants',
          kind: 'int',
          total: true,
          value: (r) => Number(r.participants),
        },
        {
          key: 'amount',
          label: 'Assistance',
          kind: 'money',
          total: true,
          value: (r) => Number(r.amount),
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------------------

export function ComplianceReport({ scope }: ReportProps) {
  const { data, isPending, isError, refetch } = useDashboardSummary(
    scope.fiscalYearId,
    scope.programIds,
  )
  if (isError) return <ReportError onRetry={() => void refetch()} />
  if (isPending || !data) return <Loading />
  type R = (typeof data.compliance)[number]
  return (
    <ReportTable<R>
      rows={data.compliance}
      rowKey={(r) => r.program_id}
      exportAs={{ filename: 'compliance', sheet: 'Compliance' }}
      columns={[
        { key: 'code', label: 'Program', value: (r) => r.code },
        {
          key: 'activities',
          label: 'Activities',
          kind: 'int',
          total: true,
          value: (r) => r.activities,
        },
        {
          key: 'on_schedule',
          label: 'On schedule',
          kind: 'int',
          total: true,
          value: (r) => r.on_schedule,
        },
        {
          key: 'on_schedule_pct',
          label: 'On schedule %',
          kind: 'pct',
          value: (r) => pct(r.on_schedule, r.activities),
        },
        {
          key: 'progress',
          label: 'Progress updated %',
          kind: 'pct',
          value: (r) => pct(r.progress_current, r.ongoing),
        },
        {
          key: 'directives',
          label: 'Directives on time %',
          kind: 'pct',
          value: (r) => pct(r.directives_on_time, r.directives_due),
        },
        {
          key: 'allotted',
          label: 'Allotment',
          kind: 'money',
          total: true,
          value: (r) => Number(r.allotted),
        },
        {
          key: 'obligated',
          label: 'Obligated',
          kind: 'money',
          total: true,
          value: (r) => Number(r.obligated),
        },
        {
          key: 'ob_pct',
          label: 'Obligation %',
          kind: 'pct',
          value: (r) => pct(Number(r.obligated), Number(r.allotted)),
        },
        {
          key: 'disbursed',
          label: 'Disbursed',
          kind: 'money',
          total: true,
          value: (r) => Number(r.disbursed),
        },
        {
          key: 'dv_pct',
          label: 'Disbursement %',
          kind: 'pct',
          value: (r) => pct(Number(r.disbursed), Number(r.obligated)),
        },
        {
          key: 'plans',
          label: 'Plans approved (of 3)',
          kind: 'int',
          value: (r) => r.plans_approved,
        },
        {
          key: 'issues',
          label: 'Open high/critical issues',
          kind: 'int',
          total: true,
          value: (r) => r.critical_issues,
        },
      ]}
    />
  )
}
