import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleSlashIcon,
  TruckIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { BarList } from '@/components/charts/BarList'
import { BulletBars } from '@/components/charts/BulletBars'
import { FlowChart } from '@/components/charts/FlowChart'
import { StatusStrip, type StatusPart } from '@/components/charts/StatusStrip'
import { pct } from '@/features/finance/finance-utils'
import { PHASES } from '@/features/workflows/constants'
import { formatDate, formatPeso, formatPesoCompact, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DashboardSummary } from '@/types/database'
import { monthLabel } from '../format'
import { Panel } from './Panel'

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Cumulative obligations and disbursements across the fiscal year vs the allotment. */
export function FlowPanel({ data }: { data: DashboardSummary }) {
  const cum = (key: 'obligated' | 'disbursed') => {
    let run = 0
    return data.monthly.map((m) => (run += Number(m[key])))
  }
  // Months after today stay off the lines (no flat projection).
  const thisMonth = data.as_of.slice(0, 7)
  const upto = data.monthly.findIndex((m) => m.month > thisMonth)
  const cut = <T,>(xs: T[]) => (upto === -1 ? xs : xs.slice(0, Math.max(upto, 1)))

  return (
    <Panel
      title="Budget vs obligation vs disbursement"
      description="Cumulative ORS and DV amounts by month against the allotment."
      className="lg:col-span-2"
    >
      <FlowChart
        title="Cumulative obligations and disbursements by month"
        labels={cut(data.monthly.map((m) => monthLabel(m.month)))}
        series={[
          {
            label: 'Obligated (ORS)',
            stroke: 'stroke-viz-1',
            fill: 'fill-viz-1',
            swatch: 'bg-viz-1',
            values: cut(cum('obligated')),
          },
          {
            label: 'Disbursed (DV)',
            stroke: 'stroke-viz-2',
            fill: 'fill-viz-2',
            swatch: 'bg-viz-2',
            values: cut(cum('disbursed')),
          },
        ]}
        reference={{ label: 'Allotment', value: Number(data.kpis.allotted) }}
        format={formatPesoCompact}
      />
    </Panel>
  )
}

export function ByClassPanel({ rows }: { rows: DashboardSummary['by_class'] }) {
  return (
    <Panel title="By expense class" description="Allotment, obligated and disbursed.">
      <BulletBars
        series={['Allotment', 'Obligated', 'Disbursed']}
        format={formatPeso}
        emptyText="No allotments or obligations yet."
        rows={rows.map((r) => ({
          key: r.code,
          label: r.code,
          values: [Number(r.allotted), Number(r.obligated), Number(r.disbursed)],
          note: `${formatPercent(pct(Number(r.obligated), Number(r.allotted)), 0)} obligated`,
          href: '/finance',
        }))}
      />
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Status mix and procurement money
// ---------------------------------------------------------------------------

const MUTED = 'text-muted-foreground'

export function StatusPanel({ data }: { data: DashboardSummary }) {
  const a = data.activities
  const p = data.packages
  const acts: StatusPart[] = [
    {
      key: 'ns',
      label: 'Not started',
      count: a.not_started,
      fill: 'bg-muted-foreground/40',
      icon: CircleDashedIcon,
      iconClass: MUTED,
    },
    {
      key: 'on',
      label: 'Ongoing',
      count: a.ongoing,
      fill: 'bg-viz-1',
      icon: CircleDotIcon,
      iconClass: 'text-viz-1',
    },
    {
      key: 'dl',
      label: 'Delayed',
      count: a.delayed,
      fill: 'bg-destructive',
      icon: AlertTriangleIcon,
      iconClass: 'text-destructive',
    },
    {
      key: 'cp',
      label: 'Completed',
      count: a.completed,
      fill: 'bg-success',
      icon: CheckCircle2Icon,
      iconClass: 'text-success',
    },
  ]
  const pkgs: StatusPart[] = [
    {
      key: 'ns',
      label: 'Not started',
      count: p.not_started,
      fill: 'bg-muted-foreground/40',
      icon: CircleDashedIcon,
      iconClass: MUTED,
    },
    {
      key: 'on',
      label: 'Ongoing',
      count: p.ongoing,
      fill: 'bg-viz-1',
      icon: CircleDotIcon,
      iconClass: 'text-viz-1',
    },
    {
      key: 'dl',
      label: 'Delayed',
      count: p.delayed,
      fill: 'bg-destructive',
      icon: AlertTriangleIcon,
      iconClass: 'text-destructive',
    },
    {
      key: 'cl',
      label: 'Closed',
      count: p.closed,
      fill: 'bg-success',
      icon: CheckCircle2Icon,
      iconClass: 'text-success',
    },
  ]
  const s = data.savings
  const k = data.kpis

  return (
    <Panel title="Status" description="Activities and procurement packages this fiscal year.">
      <div className="space-y-5">
        <section className="space-y-2">
          <h4 className="flex justify-between text-sm font-medium">
            Activities <span className="text-muted-foreground tabular-nums">{a.total}</span>
          </h4>
          <StatusStrip label="Activities by status" parts={acts} />
        </section>
        <section className="space-y-2">
          <h4 className="flex justify-between text-sm font-medium">
            Procurement packages{' '}
            <span className="text-muted-foreground tabular-nums">{p.total}</span>
          </h4>
          <StatusStrip label="Packages by status" parts={pkgs} />
          {a.cancelled + p.cancelled > 0 && (
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <CircleSlashIcon className="size-3" /> Cancelled (not counted): {a.cancelled}{' '}
              activities, {p.cancelled} packages
            </p>
          )}
        </section>
        <dl className="grid grid-cols-2 gap-3 border-t pt-4 text-sm">
          <Figure
            label="Procurement savings"
            value={formatPesoCompact(Number(s.savings))}
            hint={`ABC ${formatPesoCompact(Number(s.abc))} → contract ${formatPesoCompact(Number(s.contract))}`}
            to="/finance?tab=savings"
          />
          <Figure
            label="Savings confirmed"
            value={formatPesoCompact(Number(k.savings_confirmed))}
            hint={`${formatPesoCompact(Number(k.savings_suggested))} awaiting decision`}
            to="/finance?tab=savings"
          />
          <Figure
            label="Obligated, not yet delivered"
            value={formatPesoCompact(Number(k.obligated_undelivered))}
            to="/finance?tab=ors"
          />
          <Figure
            label="Delivered, not yet paid"
            value={formatPesoCompact(Number(k.delivered_unpaid))}
            to="/finance?tab=payables"
            danger={Number(k.delivered_unpaid) > 0}
          />
        </dl>
      </div>
    </Panel>
  )
}

function Figure({
  label,
  value,
  hint,
  to,
  danger,
}: {
  label: string
  value: string
  hint?: string
  to: string
  danger?: boolean
}) {
  return (
    <Link to={to} className="hover:bg-muted/60 -m-1.5 rounded-md p-1.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn('text-lg font-semibold tabular-nums', danger && 'text-destructive')}>
        {value}
      </dd>
      {hint && <dd className="text-muted-foreground text-[11px]">{hint}</dd>}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Procurement
// ---------------------------------------------------------------------------

export function FunnelPanel({ rows }: { rows: DashboardSummary['funnel'] }) {
  const order = ['not_started', ...PHASES.map((p) => p.key)]
  const label = (k: string) =>
    k === 'not_started' ? 'Not started' : (PHASES.find((p) => p.key === k)?.label ?? k)
  const sorted = [...rows].sort((a, b) => order.indexOf(a.phase) - order.indexOf(b.phase))
  return (
    <Panel title="Packages by stage" description="Where each package's own workflow is now.">
      <BarList
        labelWidth="w-40"
        emptyText="No procurement packages yet."
        rows={sorted.map((r) => ({
          key: r.phase,
          label: label(r.phase),
          value: Number(r.packages),
          valueLabel: `${r.packages} · ${formatPesoCompact(Number(r.amount))}`,
          detail: (
            <>
              <strong>{label(r.phase)}</strong>: {r.packages} package{r.packages === 1 ? '' : 's'},{' '}
              {formatPeso(Number(r.amount))}
            </>
          ),
        }))}
      />
    </Panel>
  )
}

export function SupplierPanel({ rows }: { rows: DashboardSummary['by_supplier'] }) {
  return (
    <Panel title="Spending by supplier" description="Top suppliers by contract amount.">
      <BulletBars
        series={['Contract', 'Paid']}
        format={formatPeso}
        emptyText="No awarded packages yet."
        rows={rows.map((r) => ({
          key: r.id,
          label: r.name,
          values: [Number(r.contract), Number(r.paid)],
          note: formatPesoCompact(Number(r.contract)),
          href: `/suppliers/${r.id}`,
        }))}
      />
    </Panel>
  )
}

export function CategoryPanel({ rows }: { rows: DashboardSummary['by_category'] }) {
  return (
    <Panel
      title="Spending by category"
      description="ABC, contract and paid per procurement category."
    >
      <BulletBars
        series={['ABC', 'Contract', 'Paid']}
        format={formatPeso}
        emptyText="No procurement packages yet."
        rows={rows.map((r) => ({
          key: r.code ?? r.name,
          label: r.name,
          values: [Number(r.abc), Number(r.contract), Number(r.paid)],
          note: `${r.packages} pkg · ${formatPesoCompact(Number(r.contract))}`,
        }))}
      />
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Aging and deliveries
// ---------------------------------------------------------------------------

const AGE_FILL = ['bg-viz-ord-1', 'bg-viz-ord-2', 'bg-viz-ord-3', 'bg-viz-ord-4']

export function AgingPanel({ rows }: { rows: DashboardSummary['aging'] }) {
  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  return (
    <Panel
      title="Obligation aging"
      description={`Unpaid ORS balances by age · ${formatPeso(total)} in total.`}
    >
      <BarList
        labelWidth="w-24"
        emptyText="No unpaid obligations."
        rows={rows.map((r, i) => ({
          key: r.bucket,
          label: r.bucket,
          value: Number(r.amount),
          fill: AGE_FILL[i],
          valueLabel: `${formatPesoCompact(Number(r.amount))} · ${r.count} ORS`,
          detail: (
            <>
              <strong>{r.bucket}</strong>: {r.count} ORS, {formatPeso(Number(r.amount))} unpaid
            </>
          ),
        }))}
      />
    </Panel>
  )
}

export function DeliveriesPanel({ rows }: { rows: DashboardSummary['pending_deliveries'] }) {
  return (
    <Panel title="Pending deliveries" description="Scheduled in the next 30 days, and late ones.">
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No deliveries scheduled.</p>
      ) : (
        <ul className="-mx-2 max-h-96 divide-y overflow-auto">
          {rows.map((d) => (
            <li key={d.id}>
              <Link
                to={`/activities/${d.activity_id}/packages/${d.package_id}?tab=finance`}
                className="hover:bg-muted/60 flex items-start gap-3 rounded-md px-2 py-2"
              >
                <TruckIcon
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    d.is_late ? 'text-destructive' : 'text-muted-foreground',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.package_title}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {d.supplier_name ?? 'No supplier'} · {d.package_code} · delivery #
                    {d.delivery_no}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className={cn('block', d.is_late && 'text-destructive font-medium')}>
                    {d.is_late && <AlertTriangleIcon className="mr-0.5 inline size-3" />}
                    {d.is_late ? 'Late · ' : ''}
                    {formatDate(d.scheduled_date)}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatPesoCompact(Number(d.amount))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
