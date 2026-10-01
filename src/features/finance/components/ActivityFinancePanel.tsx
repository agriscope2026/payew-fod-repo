import { BanIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useActivityPackages } from '@/features/packages/api'
import { formatDate, formatPeso } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ActivityView, ObligationRow } from '@/types/database'
import {
  useActivityFinance,
  useDirectExpenses,
  useFinanceMutations,
  type DisbursementWithLinks,
} from '../api'
import { FlagList } from './FinanceBits'
import { pct } from '../finance-utils'
import { Figure, RowActions, Section } from './PackageFinancePanel'
import { CancelRecordDialog, DisbursementDialog, ObligationDialog } from './RecordDialogs'

/** Activity Financial Tracker: packages roll-up (drill-down by package/supplier) + direct expenses. */
export function ActivityFinancePanel({
  activity,
  canEdit,
  canManage,
}: {
  activity: ActivityView
  canEdit: boolean
  canManage: boolean
}) {
  const { data, isPending } = useActivityFinance(activity.id)
  const { data: pkgs = [] } = useActivityPackages(activity.id)
  const { data: direct } = useDirectExpenses(activity.id)
  const m = useFinanceMutations()
  const [ors, setOrs] = useState<ObligationRow | 'new' | null>(null)
  const [dv, setDv] = useState<DisbursementWithLinks | 'new' | null>(null)
  const [cancel, setCancel] = useState<{ kind: 'ors' | 'dv'; id: string; label: string } | null>(
    null,
  )

  if (isPending || !data) return <Skeleton className="h-96" />
  const s = data.summary
  const budget = Number(activity.budget_amount ?? 0)
  const supplier = new Map(pkgs.map((p) => [p.id, p.supplier_name]))
  const live = data.packages.filter((p) => p.status !== 'cancelled')
  const sum = (k: 'ceiling' | 'obligated' | 'accepted' | 'disbursed' | 'delivered_unpaid') =>
    live.reduce((t, p) => t + Number(p[k]), 0)
  const activeOrs = direct?.obligations.filter((o) => o.status === 'active') ?? []
  const paidBy = new Map<string, number>()
  for (const d of direct?.disbursements.filter((x) => x.status === 'active') ?? [])
    for (const l of d.links)
      paidBy.set(l.obligation_id, (paidBy.get(l.obligation_id) ?? 0) + Number(l.amount))
  const editable = canEdit && activity.status !== 'cancelled' && !activity.deleted_at

  return (
    <div className="space-y-6">
      {s && (
        <Card className="py-4">
          <CardContent className="grid gap-5 px-4 sm:grid-cols-2 lg:grid-cols-5">
            <Figure
              label="Budget"
              value={formatPeso(budget)}
              hint={`Packages ABC ${formatPeso(s.packages_abc)} · unallocated ${formatPeso(budget - Number(s.packages_abc))}`}
            />
            <Figure
              label="Obligated"
              value={formatPeso(s.obligated)}
              pct={s.utilization_pct}
              hint={`${s.utilization_pct ?? 0}% utilization · ${formatPeso(s.obligated_direct)} direct`}
            />
            <Figure
              label="Disbursed"
              value={formatPeso(s.disbursed)}
              pct={pct(Number(s.disbursed), Number(s.obligated))}
              hint={`${Math.round(pct(Number(s.disbursed), Number(s.obligated)) ?? 0)}% of obligations`}
            />
            <Figure
              label="Payables"
              value={formatPeso(s.payables)}
              hint="Accepted deliveries not yet paid"
              danger={Number(s.payables) > 0}
            />
            <Figure
              label="Procurement savings"
              value={formatPeso(Number(s.savings_confirmed) + Number(s.savings_suggested))}
              hint={`${formatPeso(s.savings_confirmed)} confirmed · ${formatPeso(s.savings_suggested)} to review`}
            />
          </CardContent>
        </Card>
      )}

      <Section
        title="By package / supplier"
        description="Open a package for its ORS, deliveries and DVs."
      >
        {data.packages.length === 0 ? (
          <p className="text-muted-foreground text-sm">No packages yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Contract / ABC</TableHead>
                  <TableHead className="text-right">Obligated</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Payable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.packages.map((p) => (
                  <TableRow
                    key={p.package_id}
                    className={cn(p.status === 'cancelled' && 'opacity-60')}
                  >
                    <TableCell>
                      <Link
                        to={`/activities/${activity.id}/packages/${p.package_id}?tab=finance`}
                        className="font-medium hover:underline"
                      >
                        {p.title}
                      </Link>
                      <span className="text-muted-foreground block font-mono text-xs">
                        {p.code}
                        {p.status === 'cancelled' && ' · cancelled'}
                        {p.flagged_records > 0 && ` · ${p.flagged_records} flagged`}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{supplier.get(p.package_id) ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPeso(p.ceiling)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPeso(p.obligated)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPeso(p.accepted)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPeso(p.disbursed)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        Number(p.delivered_unpaid) > 0 && 'text-destructive',
                      )}
                    >
                      {formatPeso(p.delivered_unpaid)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total (excluding cancelled)</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPeso(sum('ceiling'))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPeso(sum('obligated'))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPeso(sum('accepted'))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPeso(sum('disbursed'))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPeso(sum('delivered_unpaid'))}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </Section>

      <Section
        title="Activity-level expenses"
        description="Honoraria, direct payments and other non-procurement costs."
        action={
          editable && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setOrs('new')}>
                <PlusIcon /> ORS
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!activeOrs.length}
                onClick={() => setDv('new')}
              >
                <PlusIcon /> DV
              </Button>
            </div>
          )
        }
      >
        {!direct || (direct.obligations.length === 0 && direct.disbursements.length === 0) ? (
          <p className="text-muted-foreground text-sm">None recorded.</p>
        ) : (
          <ul className="divide-y">
            {direct.obligations.map((o) => (
              <li
                key={o.id}
                className={cn(
                  'flex flex-wrap items-start gap-3 py-2 text-sm',
                  o.status === 'cancelled' && 'opacity-60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    ORS {o.ors_no}{' '}
                    {o.status === 'cancelled' && (
                      <Badge variant="outline">
                        <BanIcon /> Cancelled
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(o.ors_date)} · {o.payee_name ?? 'No payee'} · {o.particulars ?? ''}{' '}
                    · paid {formatPeso(paidBy.get(o.id) ?? 0)}
                  </p>
                  <FlagList flags={o.flags} />
                </div>
                <span className="tabular-nums">{formatPeso(o.amount)}</span>
                {o.status === 'active' && (
                  <RowActions
                    canEdit={editable}
                    canCancel={canManage}
                    onEdit={() => setOrs(o)}
                    onCancel={() => setCancel({ kind: 'ors', id: o.id, label: o.ors_no })}
                  />
                )}
              </li>
            ))}
            {direct.disbursements.map((d) => (
              <li
                key={d.id}
                className={cn(
                  'flex flex-wrap items-start gap-3 py-2 text-sm',
                  d.status === 'cancelled' && 'opacity-60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    DV {d.dv_no}{' '}
                    {d.status === 'cancelled' && (
                      <Badge variant="outline">
                        <BanIcon /> Cancelled
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(d.dv_date)} · net {formatPeso(d.net_amount)} · {d.payee_name ?? ''}
                  </p>
                  <FlagList flags={d.flags} />
                </div>
                <span className="tabular-nums">{formatPeso(d.gross_amount)}</span>
                {d.status === 'active' && (
                  <RowActions
                    canEdit={editable}
                    canCancel={canManage}
                    onEdit={() => setDv(d)}
                    onCancel={() => setCancel({ kind: 'dv', id: d.id, label: d.dv_no })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {ors && (
        <ObligationDialog
          activityId={activity.id}
          packageId={null}
          obligation={ors === 'new' ? null : ors}
          onClose={() => setOrs(null)}
        />
      )}
      {dv && (
        <DisbursementDialog
          activityId={activity.id}
          packageId={null}
          obligations={activeOrs}
          paidByObligation={paidBy}
          disbursement={dv === 'new' ? null : dv}
          onClose={() => setDv(null)}
        />
      )}
      {cancel && (
        <CancelRecordDialog
          title={`Cancel ${cancel.label}`}
          onClose={() => setCancel(null)}
          onConfirm={(reason) =>
            (cancel.kind === 'ors'
              ? m.cancelObligation.mutateAsync({ id: cancel.id, reason })
              : m.cancelDisbursement.mutateAsync({ id: cancel.id, reason })
            ).then(() => toast.success(`${cancel.label} cancelled`))
          }
        />
      )}
    </div>
  )
}
