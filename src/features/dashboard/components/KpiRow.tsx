import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Meter, RateBadge } from '@/features/finance/components/FinanceBits'
import { pct, rateState } from '@/features/finance/finance-utils'
import type { AppSettings } from '@/features/settings/api'
import { formatPeso, formatPesoCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DashboardSummary } from '@/types/database'

/** Headline money figures: allotment, obligated, disbursed, unobligated. */
export function KpiRow({
  kpis,
  thresholds,
}: {
  kpis: DashboardSummary['kpis']
  thresholds: AppSettings['dashboard_thresholds'] | undefined
}) {
  const obligationRate = pct(kpis.obligated_all, kpis.allotted)
  const disbursementRate = pct(kpis.disbursed_all, kpis.obligated_all)
  const utilization = pct(kpis.obligated_all, kpis.budget)
  const unobligated = kpis.allotted - kpis.obligated_all

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        label="Allotment"
        value={kpis.allotted}
        hint={`WFP plan ${formatPesoCompact(kpis.planned)} · activity budgets ${formatPesoCompact(kpis.budget)}`}
      />
      <Kpi label="Obligated (ORS)" value={kpis.obligated_all}>
        <Meter pct={obligationRate} label="Obligation rate (of allotment)" />
        <RateBadge
          pct={obligationRate}
          state={rateState(obligationRate, thresholds?.obligation_rate)}
        />
      </Kpi>
      <Kpi label="Disbursed (DV)" value={kpis.disbursed_all}>
        <Meter pct={disbursementRate} label="Disbursement rate (of obligations)" />
        <RateBadge
          pct={disbursementRate}
          state={rateState(disbursementRate, thresholds?.disbursement_rate)}
        />
      </Kpi>
      <Kpi label="Unobligated allotment" value={unobligated} danger={unobligated < 0}>
        <p className="text-muted-foreground text-xs">
          Budget utilization{' '}
          <RateBadge pct={utilization} state={rateState(utilization, thresholds?.utilization)} />
        </p>
      </Kpi>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  danger,
  children,
}: {
  label: string
  value: number
  hint?: string
  danger?: boolean
  children?: ReactNode
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1.5 px-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={cn(
            'text-2xl font-semibold tracking-tight tabular-nums',
            danger && 'text-destructive',
          )}
          title={formatPeso(value)}
        >
          {formatPesoCompact(value)}
        </p>
        {children}
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </CardContent>
    </Card>
  )
}
