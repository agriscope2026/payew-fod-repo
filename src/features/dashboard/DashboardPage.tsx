import { CalendarRangeIcon } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useAppSettings } from '@/features/settings/api'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatDate } from '@/lib/format'
import { useDashboardSummary } from './api'
import { AttentionPanel } from './components/AttentionPanel'
import { ComplianceScorecard } from './components/ComplianceScorecard'
import { KpiRow } from './components/KpiRow'
import { OverduePanel } from './components/OverduePanel'
import {
  AgingPanel,
  ByClassPanel,
  CategoryPanel,
  DeliveriesPanel,
  FlowPanel,
  FunnelPanel,
  StatusPanel,
  SupplierPanel,
} from './components/Widgets'

/**
 * Phase 9 dashboard. Every figure comes from dashboard_summary() and follows the
 * workspace FY and program selector.
 */
export default function DashboardPage() {
  const { profile } = useAuth()
  const { fiscalYear, programFilter, programs, selectedProgramIds } = useWorkspace()
  const { data: settings } = useAppSettings()
  const summary = useDashboardSummary(fiscalYear?.id ?? null, selectedProgramIds)
  const scope = programs.filter((p) => selectedProgramIds.includes(p.id))
  const firstName = profile?.full_name.split(' ')[0]
  const th = settings?.dashboard_thresholds

  const header = (
    <PageHeader
      title={`Magandang araw, ${firstName}!`}
      description={`${fiscalYear?.label ?? 'No fiscal year'} · ${
        programFilter === 'all' ? 'All programs' : scope.map((p) => p.code).join(', ')
      }${summary.data ? ` · as of ${formatDate(summary.data.as_of)}` : ''}`}
    />
  )

  if (!fiscalYear || !selectedProgramIds.length) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={CalendarRangeIcon}
          title="Nothing to show yet"
          description="Pick a fiscal year and at least one program in the top bar."
        />
      </div>
    )
  }

  if (summary.isError) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState onRetry={() => void summary.refetch()} />
      </div>
    )
  }

  const d = summary.data
  if (!d) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      <KpiRow kpis={d.kpis} thresholds={th} />

      <div className="grid gap-4 lg:grid-cols-3">
        <FlowPanel data={d} />
        <AttentionPanel attention={d.attention} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StatusPanel data={d} />
        <ByClassPanel rows={d.by_class} />
        <AgingPanel rows={d.aging} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <OverduePanel
          activities={d.overdue_activities}
          packages={d.overdue_packages}
          activityTotal={d.activities.delayed}
          packageTotal={d.packages.delayed}
        />
        <DeliveriesPanel rows={d.pending_deliveries} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <FunnelPanel rows={d.funnel} />
        <SupplierPanel rows={d.by_supplier} />
        <CategoryPanel rows={d.by_category} />
      </div>

      <ComplianceScorecard
        rows={d.compliance}
        thresholds={th}
        progressDays={settings?.approvals?.progress_update_days ?? 30}
      />
    </div>
  )
}
