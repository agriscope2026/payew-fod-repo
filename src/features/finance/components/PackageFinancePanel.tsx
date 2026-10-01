import { BanIcon, PencilIcon, PlusIcon, Trash2Icon, TruckIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { DeliveryStatus, ObligationRow, PackageView } from '@/types/database'
import {
  useFinanceMutations,
  usePackageFinance,
  type DeliveryWithItems,
  type DisbursementWithLinks,
} from '../api'
import { FlagList, Meter } from './FinanceBits'
import {
  CancelRecordDialog,
  DeliveryDialog,
  DisbursementDialog,
  ObligationDialog,
} from './RecordDialogs'

const DELIVERY_LABEL: Record<DeliveryStatus, string> = {
  scheduled: 'Scheduled',
  delivered: 'Delivered',
  partial: 'Partial',
  accepted: 'Accepted',
  rejected: 'Rejected',
}

/** Package Financial Tracker: ORS, deliveries and DV with the computed balances (B4). */
export function PackageFinancePanel({
  pkg,
  canEdit,
  canManage,
}: {
  pkg: PackageView
  canEdit: boolean
  canManage: boolean
}) {
  const { data, isPending } = usePackageFinance(pkg.id)
  const m = useFinanceMutations()
  const [ors, setOrs] = useState<ObligationRow | 'new' | null>(null)
  const [dl, setDl] = useState<DeliveryWithItems | 'new' | null>(null)
  const [dv, setDv] = useState<DisbursementWithLinks | 'new' | null>(null)
  const [cancel, setCancel] = useState<{ kind: 'ors' | 'dv'; id: string; label: string } | null>(
    null,
  )

  if (isPending || !data) return <Skeleton className="h-96" />
  const s = data.summary
  const activeOrs = data.obligations.filter((o) => o.status === 'active')
  const activeDv = data.disbursements.filter((d) => d.status === 'active')
  const paidBy = new Map<string, number>()
  for (const d of activeDv)
    for (const l of d.links)
      paidBy.set(l.obligation_id, (paidBy.get(l.obligation_id) ?? 0) + Number(l.amount))
  const awarded = !!pkg.supplier_id
  const editable = canEdit && pkg.status !== 'cancelled'

  return (
    <div className="space-y-6">
      {s && (
        <Card className="py-4">
          <CardContent className="grid gap-5 px-4 sm:grid-cols-2 lg:grid-cols-4">
            <Figure
              label={awarded ? 'Contract' : 'ABC (not yet awarded)'}
              value={formatPeso(s.ceiling)}
              hint={`Unobligated ${formatPeso(s.unobligated_balance)}`}
            />
            <Figure
              label="Obligated (ORS)"
              value={formatPeso(s.obligated)}
              pct={s.obligated_pct}
              hint={`${s.obligated_pct ?? 0}% of ${awarded ? 'contract' : 'ABC'}`}
            />
            <Figure
              label="Delivered & accepted"
              value={formatPeso(s.accepted)}
              pct={s.delivered_pct}
              hint={`Obligated but undelivered ${formatPeso(s.obligated_undelivered)}`}
            />
            <Figure
              label="Paid (DV, gross)"
              value={formatPeso(s.disbursed)}
              pct={s.paid_pct}
              hint={`Delivered but unpaid ${formatPeso(s.delivered_unpaid)} · net ${formatPeso(s.disbursed_net)}`}
              danger={Number(s.delivered_unpaid) > 0}
            />
          </CardContent>
        </Card>
      )}

      <Section
        title="Obligations (ORS)"
        description={
          pkg.obligation_timing === 'before_delivery'
            ? 'This package obligates at award, before delivery.'
            : 'This package obligates after delivery and inspection.'
        }
        action={
          editable && (
            <Button size="sm" variant="outline" onClick={() => setOrs('new')}>
              <PlusIcon /> ORS
            </Button>
          )
        }
      >
        {data.obligations.length === 0 ? (
          <Empty text="No ORS yet." />
        ) : (
          <ul className="divide-y">
            {data.obligations.map((o) => (
              <li
                key={o.id}
                className={cn(
                  'flex flex-wrap items-start gap-3 py-2 text-sm',
                  o.status === 'cancelled' && 'opacity-60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {o.ors_no}
                    {o.status === 'cancelled' && (
                      <Badge variant="outline" className="ml-2">
                        <BanIcon /> Cancelled
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(o.ors_date)} · paid {formatPeso(paidBy.get(o.id) ?? 0)} of{' '}
                    {formatPeso(o.amount)}
                    {o.cancelled_reason && ` · ${o.cancelled_reason}`}
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
          </ul>
        )}
      </Section>

      <Section
        title="Deliveries"
        description="Partial deliveries allowed. Only accepted deliveries are payable."
        action={
          editable &&
          awarded && (
            <Button size="sm" variant="outline" onClick={() => setDl('new')}>
              <TruckIcon /> Delivery
            </Button>
          )
        }
      >
        {!awarded ? (
          <Empty text="Award the package to record deliveries." />
        ) : data.deliveries.length === 0 ? (
          <Empty text="No deliveries yet." />
        ) : (
          <ul className="divide-y">
            {data.deliveries.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    Delivery {d.delivery_no}{' '}
                    <Badge
                      variant="outline"
                      className={cn(
                        d.status === 'accepted' && 'border-success/40 text-success',
                        d.status === 'rejected' && 'border-destructive/40 text-destructive',
                      )}
                    >
                      {DELIVERY_LABEL[d.status]}
                    </Badge>
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {d.status === 'scheduled'
                      ? `Scheduled ${formatDate(d.scheduled_date)}`
                      : `Delivered ${formatDate(d.delivery_date)}${d.accepted_date ? ` · accepted ${formatDate(d.accepted_date)}` : ''}`}
                    {d.dr_no && ` · DR ${d.dr_no}`}
                    {d.iar_no && ` · IAR ${d.iar_no}`}
                    {d.items.length > 0 &&
                      ` · ${d.items.length} item${d.items.length === 1 ? '' : 's'}`}
                  </p>
                  {d.exception_remark && (
                    <p className="text-xs">
                      <strong>Exception:</strong> {d.exception_remark}
                    </p>
                  )}
                  <FlagList flags={d.flags} />
                </div>
                <span className="tabular-nums">{formatPeso(d.amount)}</span>
                <RowActions
                  canEdit={editable}
                  canCancel={canManage || (editable && d.status === 'scheduled')}
                  cancelLabel="Delete"
                  onEdit={() => setDl(d)}
                  onCancel={() =>
                    m.deleteDelivery
                      .mutateAsync(d.id)
                      .then(() => toast.success('Delivery deleted'))
                      .catch((e) => toast.error(errorMessage(e)))
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Disbursements (DV)"
        description="Each DV pays one or more ORS. Staged payments are separate DVs."
        action={
          editable && (
            <Button
              size="sm"
              variant="outline"
              disabled={!activeOrs.length}
              onClick={() => setDv('new')}
            >
              <PlusIcon /> DV
            </Button>
          )
        }
      >
        {data.disbursements.length === 0 ? (
          <Empty text={activeOrs.length ? 'No payments yet.' : 'Record an ORS before paying.'} />
        ) : (
          <ul className="divide-y">
            {data.disbursements.map((d) => (
              <li
                key={d.id}
                className={cn(
                  'flex flex-wrap items-start gap-3 py-2 text-sm',
                  d.status === 'cancelled' && 'opacity-60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {d.dv_no}
                    {d.status === 'cancelled' && (
                      <Badge variant="outline" className="ml-2">
                        <BanIcon /> Cancelled
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(d.dv_date)} · net {formatPeso(d.net_amount)}
                    {Number(d.tax_withheld) > 0 && ` · tax ${formatPeso(d.tax_withheld)}`}
                    {d.check_ada_no && ` · ${d.check_ada_no}`} · charged to{' '}
                    {d.links
                      .map(
                        (l) =>
                          data.obligations.find((o) => o.id === l.obligation_id)?.ors_no ?? 'ORS',
                      )
                      .join(', ')}
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
          activityId={pkg.activity_id}
          packageId={pkg.id}
          deliveries={data.deliveries}
          obligation={ors === 'new' ? null : ors}
          suggestedAmount={
            ors === 'new' && s ? Math.max(Number(s.unobligated_balance), 0) || undefined : undefined
          }
          onClose={() => setOrs(null)}
        />
      )}
      {dl && (
        <DeliveryDialog
          packageId={pkg.id}
          obligateFirst={pkg.obligation_timing === 'before_delivery'}
          hasObligation={activeOrs.length > 0}
          delivery={dl === 'new' ? null : dl}
          onClose={() => setDl(null)}
        />
      )}
      {dv && (
        <DisbursementDialog
          activityId={pkg.activity_id}
          packageId={pkg.id}
          obligations={activeOrs}
          paidByObligation={paidBy}
          disbursement={dv === 'new' ? null : dv}
          defaultPayee={pkg.supplier_name ?? undefined}
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

export function Figure({
  label,
  value,
  hint,
  pct,
  danger,
}: {
  label: string
  value: string
  hint?: string
  pct?: number | null
  danger?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
      {pct !== undefined && <Meter pct={pct} label={label} />}
      {hint && (
        <p className={danger ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
          {hint}
        </p>
      )}
    </div>
  )
}

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-muted-foreground text-sm">{text}</p>
}

export function RowActions({
  canEdit,
  canCancel,
  cancelLabel = 'Cancel',
  onEdit,
  onCancel,
}: {
  canEdit: boolean
  canCancel: boolean
  cancelLabel?: string
  onEdit: () => void
  onCancel: () => void
}) {
  return (
    <span className="flex">
      {canEdit && (
        <Button variant="ghost" size="icon" className="size-7" aria-label="Edit" onClick={onEdit}>
          <PencilIcon />
        </Button>
      )}
      {canCancel && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={cancelLabel}
          title={cancelLabel}
          onClick={onCancel}
        >
          {cancelLabel === 'Delete' ? <Trash2Icon /> : <BanIcon />}
        </Button>
      )}
    </span>
  )
}
