import { Loader2Icon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { Textarea } from '@/components/ui/textarea'
import { useProcurementLookups } from '@/features/packages/use-procurement-lookups'
import { useMasterList } from '@/features/settings/master-lists/api'
import { formatPeso, todayManila } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { DeliveryStatus, ObligationRow } from '@/types/database'
import { useFinanceMutations, type DeliveryWithItems, type DisbursementWithLinks } from '../api'
import { toastWarnings } from '../finance-utils'

const num = (s: string) => {
  const n = Number(s.replace(/[,₱\s]/g, ''))
  return Number.isFinite(n) ? n : NaN
}
const money = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

// ---------------------------------------------------------------------------
// ORS
// ---------------------------------------------------------------------------
export function ObligationDialog({
  activityId,
  packageId,
  deliveries = [],
  obligation,
  suggestedAmount,
  onClose,
}: {
  activityId: string
  packageId: string | null
  deliveries?: { id: string; delivery_no: number; amount: number }[]
  obligation?: ObligationRow | null
  /** Pre-fill for a new ORS (e.g. the unobligated balance). */
  suggestedAmount?: number
  onClose: () => void
}) {
  const { saveObligation } = useFinanceMutations()
  const lookups = useProcurementLookups()
  const { data: funds = [] } = useMasterList('fund_sources')
  const [orsNo, setOrsNo] = useState(obligation?.ors_no ?? '')
  const [date, setDate] = useState(obligation?.ors_date ?? todayManila())
  const [amount, setAmount] = useState(money(obligation?.amount ?? suggestedAmount))
  const [fund, setFund] = useState(obligation?.fund_source_id ?? '')
  const [ec, setEc] = useState(obligation?.expense_class_id ?? '')
  const [uacs, setUacs] = useState(obligation?.uacs_code_id ?? '')
  const [payee, setPayee] = useState(obligation?.payee_name ?? '')
  const [particulars, setParticulars] = useState(obligation?.particulars ?? '')
  const [deliveryId, setDeliveryId] = useState(obligation?.delivery_id ?? '')
  const amt = num(amount)
  const valid = orsNo.trim() && date && amt > 0

  const submit = async () => {
    try {
      const r = await saveObligation.mutateAsync({
        id: obligation?.id,
        activity_id: activityId,
        package_id: packageId,
        delivery_id: deliveryId || null,
        ors_no: orsNo,
        ors_date: date,
        amount: amt,
        fund_source_id: fund || null,
        expense_class_id: ec || null,
        uacs_code_id: uacs || null,
        payee_supplier_id: obligation?.payee_supplier_id ?? null,
        payee_name: payee || null,
        particulars: particulars || null,
      })
      toast.success(obligation ? 'ORS updated' : 'ORS recorded')
      toastWarnings(r.warnings)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {obligation ? `Edit ${obligation.ors_no}` : 'Record obligation (ORS)'}
          </DialogTitle>
          <DialogDescription>
            {packageId
              ? 'Blank fields default from the package (expense class, UACS, supplier as payee).'
              : 'Activity-level expense (honoraria, direct payments) — not tied to a supplier package.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="ors-no" label="ORS No. *">
            <Input
              id="ors-no"
              value={orsNo}
              onChange={(e) => setOrsNo(e.target.value)}
              placeholder="ORS-2026-01-0001"
            />
          </FormField>
          <FormField id="ors-date" label="ORS date *">
            <Input
              id="ors-date"
              type="date"
              max={todayManila()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </FormField>
          <FormField
            id="ors-amount"
            label="Amount *"
            error={amount && !(amt > 0) ? 'Enter a positive amount' : undefined}
          >
            <Input
              id="ors-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>
          <FormField id="ors-fund" label="Fund source">
            <SelectNative id="ors-fund" value={fund} onChange={(e) => setFund(e.target.value)}>
              <option value="">Activity default</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {String(f.code)} · {String(f.name)}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <FormField id="ors-ec" label="Expense class">
            <SelectNative id="ors-ec" value={ec} onChange={(e) => setEc(e.target.value)}>
              <option value="">{packageId ? 'Package default' : '—'}</option>
              {lookups.expenseClasses.map((x) => (
                <option key={x.id} value={x.id}>
                  {String(x.code)}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <FormField id="ors-uacs" label="UACS">
            <SelectNative id="ors-uacs" value={uacs} onChange={(e) => setUacs(e.target.value)}>
              <option value="">{packageId ? 'Package default' : '—'}</option>
              {lookups.uacs
                .filter((u) => !ec || u.expense_class_id === ec)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {String(u.code)} · {String(u.name)}
                  </option>
                ))}
            </SelectNative>
          </FormField>
          {!packageId && (
            <div className="sm:col-span-2">
              <FormField id="ors-payee" label="Payee">
                <Input
                  id="ors-payee"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="e.g. Resource persons"
                />
              </FormField>
            </div>
          )}
          {deliveries.length > 0 && (
            <div className="sm:col-span-2">
              <FormField id="ors-delivery" label="For delivery / milestone (optional)">
                <SelectNative
                  id="ors-delivery"
                  value={deliveryId}
                  onChange={(e) => setDeliveryId(e.target.value)}
                >
                  <option value="">Whole contract</option>
                  {deliveries.map((d) => (
                    <option key={d.id} value={d.id}>
                      Delivery {d.delivery_no} · {formatPeso(d.amount)}
                    </option>
                  ))}
                </SelectNative>
              </FormField>
            </div>
          )}
          <div className="sm:col-span-2">
            <FormField id="ors-part" label="Particulars">
              <Textarea
                id="ors-part"
                rows={2}
                value={particulars}
                onChange={(e) => setParticulars(e.target.value)}
              />
            </FormField>
          </div>
        </div>
        <Footer
          busy={saveObligation.isPending}
          disabled={!valid}
          onCancel={onClose}
          onSave={submit}
          label="Save ORS"
        />
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Deliveries
// ---------------------------------------------------------------------------
const DELIVERY_STATUSES: { value: DeliveryStatus; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'delivered', label: 'Delivered (for inspection)' },
  { value: 'partial', label: 'Partially delivered' },
  { value: 'accepted', label: 'Inspected & accepted' },
  { value: 'rejected', label: 'Rejected' },
]

interface ItemDraft {
  description: string
  quantity: string
  unit_id: string
  unit_cost: string
}

export function DeliveryDialog({
  packageId,
  obligateFirst,
  hasObligation,
  delivery,
  onClose,
}: {
  packageId: string
  obligateFirst: boolean
  hasObligation: boolean
  delivery?: DeliveryWithItems | null
  onClose: () => void
}) {
  const { saveDelivery } = useFinanceMutations()
  const { data: units = [] } = useMasterList('units')
  const [status, setStatus] = useState<DeliveryStatus>(delivery?.status ?? 'scheduled')
  const [scheduled, setScheduled] = useState(delivery?.scheduled_date ?? '')
  const [delivered, setDelivered] = useState(delivery?.delivery_date ?? '')
  const [accepted, setAccepted] = useState(delivery?.accepted_date ?? '')
  const [dr, setDr] = useState(delivery?.dr_no ?? '')
  const [iar, setIar] = useState(delivery?.iar_no ?? '')
  const [amount, setAmount] = useState(money(delivery?.amount))
  const [remarks, setRemarks] = useState(delivery?.remarks ?? '')
  const [exception, setException] = useState(delivery?.exception_remark ?? '')
  const [items, setItems] = useState<ItemDraft[]>(
    (delivery?.items ?? []).map((i) => ({
      description: i.description,
      quantity: String(i.quantity),
      unit_id: i.unit_id ?? '',
      unit_cost: String(i.unit_cost),
    })),
  )
  const itemsTotal = items.reduce((s, i) => s + (num(i.quantity) || 0) * (num(i.unit_cost) || 0), 0)
  const happened = status !== 'scheduled'
  const needsException = happened && status !== 'rejected' && obligateFirst && !hasObligation
  const valid =
    (!happened || !!delivered) &&
    (status !== 'accepted' || !!(accepted || delivered)) &&
    items.every((i) => i.description.trim() && num(i.quantity) >= 0 && num(i.unit_cost) >= 0) &&
    (!needsException || exception.trim().length > 0)

  const submit = async () => {
    try {
      const r = await saveDelivery.mutateAsync({
        p: {
          id: delivery?.id,
          package_id: packageId,
          status,
          scheduled_date: scheduled || null,
          delivery_date: happened ? delivered || null : null,
          accepted_date: status === 'accepted' ? accepted || delivered || null : null,
          dr_no: dr || null,
          iar_no: iar || null,
          amount: items.length ? undefined : num(amount) || 0,
          remarks: remarks || null,
          exception_remark: exception || null,
        },
        items: items.map((i) => ({
          description: i.description.trim(),
          quantity: num(i.quantity),
          unit_id: i.unit_id || null,
          unit_cost: num(i.unit_cost),
        })),
      })
      toast.success(delivery ? 'Delivery updated' : 'Delivery recorded')
      toastWarnings(r.warnings)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {delivery ? `Delivery ${delivery.delivery_no}` : 'Record delivery'}
          </DialogTitle>
          <DialogDescription>
            Partial deliveries are separate records. Only inspected & accepted deliveries count as
            payable.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <FormField id="dl-status" label="Status">
              <SelectNative
                id="dl-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as DeliveryStatus)}
              >
                {DELIVERY_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </SelectNative>
            </FormField>
          </div>
          <FormField id="dl-sched" label="Scheduled">
            <Input
              id="dl-sched"
              type="date"
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
            />
          </FormField>
          <FormField id="dl-date" label={happened ? 'Delivered on *' : 'Delivered on'}>
            <Input
              id="dl-date"
              type="date"
              max={todayManila()}
              disabled={!happened}
              value={delivered}
              onChange={(e) => setDelivered(e.target.value)}
            />
          </FormField>
          <FormField id="dl-acc" label="Accepted on">
            <Input
              id="dl-acc"
              type="date"
              max={todayManila()}
              disabled={status !== 'accepted'}
              value={accepted}
              onChange={(e) => setAccepted(e.target.value)}
            />
          </FormField>
          <FormField id="dl-dr" label="DR / service report No.">
            <Input id="dl-dr" value={dr} onChange={(e) => setDr(e.target.value)} />
          </FormField>
          <FormField id="dl-iar" label="IAR No.">
            <Input id="dl-iar" value={iar} onChange={(e) => setIar(e.target.value)} />
          </FormField>
          <FormField
            id="dl-amount"
            label="Value delivered"
            hint={items.length ? 'Computed from the items' : undefined}
          >
            <Input
              id="dl-amount"
              inputMode="decimal"
              disabled={items.length > 0}
              value={items.length ? formatPeso(itemsTotal) : amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Items (optional)</legend>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_6rem_7rem_auto] items-end gap-2">
              <Input
                aria-label="Item"
                placeholder="Item / service"
                value={it.description}
                onChange={(e) =>
                  setItems(
                    items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                  )
                }
              />
              <Input
                aria-label="Quantity"
                inputMode="decimal"
                placeholder="Qty"
                value={it.quantity}
                onChange={(e) =>
                  setItems(items.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))
                }
              />
              <SelectNative
                aria-label="Unit"
                value={it.unit_id}
                onChange={(e) =>
                  setItems(items.map((x, j) => (j === i ? { ...x, unit_id: e.target.value } : x)))
                }
              >
                <option value="">Unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {String(u.abbreviation ?? u.name)}
                  </option>
                ))}
              </SelectNative>
              <Input
                aria-label="Unit cost"
                inputMode="decimal"
                placeholder="Unit cost"
                value={it.unit_cost}
                onChange={(e) =>
                  setItems(items.map((x, j) => (j === i ? { ...x, unit_cost: e.target.value } : x)))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove item"
                onClick={() => setItems(items.filter((_, j) => j !== i))}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setItems([...items, { description: '', quantity: '1', unit_id: '', unit_cost: '' }])
            }
          >
            <PlusIcon /> Item
          </Button>
        </fieldset>

        {needsException && (
          <div className="border-warning/50 bg-warning/10 space-y-2 rounded-md border p-3 text-sm">
            <p>
              This package obligates <strong>before</strong> delivery, but no ORS is recorded yet.
              Record the ORS first, or explain this exception (it is flagged in reports and may need
              approval).
            </p>
            <Textarea
              aria-label="Exception remark"
              rows={2}
              value={exception}
              onChange={(e) => setException(e.target.value)}
            />
          </div>
        )}
        <FormField id="dl-remarks" label="Remarks">
          <Input id="dl-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </FormField>
        <Footer
          busy={saveDelivery.isPending}
          disabled={!valid}
          onCancel={onClose}
          onSave={submit}
          label="Save delivery"
        />
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// DV
// ---------------------------------------------------------------------------
export function DisbursementDialog({
  activityId,
  packageId,
  obligations,
  paidByObligation,
  disbursement,
  defaultPayee,
  onClose,
}: {
  activityId: string
  packageId: string | null
  /** Active ORS of the same package (or activity-level). */
  obligations: ObligationRow[]
  /** Already paid per ORS by other DVs. */
  paidByObligation: Map<string, number>
  disbursement?: DisbursementWithLinks | null
  defaultPayee?: string
  onClose: () => void
}) {
  const { saveDisbursement } = useFinanceMutations()
  const [dvNo, setDvNo] = useState(disbursement?.dv_no ?? '')
  const [date, setDate] = useState(disbursement?.dv_date ?? todayManila())
  const [tax, setTax] = useState(money(disbursement?.tax_withheld ?? 0))
  const [other, setOther] = useState(money(disbursement?.other_deductions ?? 0))
  const [check, setCheck] = useState(disbursement?.check_ada_no ?? '')
  const [payee, setPayee] = useState(disbursement?.payee_name ?? '')
  const [particulars, setParticulars] = useState(disbursement?.particulars ?? '')
  const ownPaid = new Map(
    (disbursement?.links ?? []).map((l) => [l.obligation_id, Number(l.amount)]),
  )
  const [links, setLinks] = useState<Record<string, string>>(() => {
    if (disbursement)
      return Object.fromEntries(disbursement.links.map((l) => [l.obligation_id, String(l.amount)]))
    const first = obligations.find((o) => Number(o.amount) - (paidByObligation.get(o.id) ?? 0) > 0)
    return first
      ? { [first.id]: String(Number(first.amount) - (paidByObligation.get(first.id) ?? 0)) }
      : {}
  })
  const gross = Object.values(links).reduce((s, v) => s + (num(v) || 0), 0)
  const net = gross - (num(tax) || 0) - (num(other) || 0)
  const linkList = Object.entries(links)
    .map(([obligation_id, v]) => ({ obligation_id, amount: num(v) }))
    .filter((l) => l.amount > 0)
  const valid = dvNo.trim() && date && linkList.length > 0 && gross > 0 && net >= 0

  const submit = async () => {
    try {
      const r = await saveDisbursement.mutateAsync({
        p: {
          id: disbursement?.id,
          activity_id: activityId,
          package_id: packageId,
          dv_no: dvNo,
          dv_date: date,
          gross_amount: gross,
          tax_withheld: num(tax) || 0,
          other_deductions: num(other) || 0,
          payee_supplier_id: disbursement?.payee_supplier_id ?? null,
          payee_name: payee || null,
          check_ada_no: check || null,
          particulars: particulars || null,
        },
        links: linkList,
      })
      toast.success(disbursement ? 'DV updated' : 'DV recorded')
      toastWarnings(r.warnings)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {disbursement ? `Edit ${disbursement.dv_no}` : 'Record disbursement (DV)'}
          </DialogTitle>
          <DialogDescription>
            Charge the payment to one or more ORS. Partial and staged payments are separate DVs.
          </DialogDescription>
        </DialogHeader>
        {obligations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Record an ORS first — a DV must pay an obligation.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="dv-no" label="DV No. *">
                <Input
                  id="dv-no"
                  value={dvNo}
                  onChange={(e) => setDvNo(e.target.value)}
                  placeholder="DV-2026-01-0001"
                />
              </FormField>
              <FormField id="dv-date" label="DV date *">
                <Input
                  id="dv-date"
                  type="date"
                  max={todayManila()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </FormField>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Charge to ORS *</legend>
              <ul className="divide-y rounded-md border">
                {obligations.map((o) => {
                  const balance =
                    Number(o.amount) - (paidByObligation.get(o.id) ?? 0) + (ownPaid.get(o.id) ?? 0)
                  return (
                    <li key={o.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{o.ors_no}</span>
                        <span className="text-muted-foreground block text-xs">
                          {formatPeso(o.amount)} · unpaid {formatPeso(balance)}
                        </span>
                      </span>
                      <Input
                        aria-label={`Amount charged to ${o.ors_no}`}
                        className="w-36 text-right"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={links[o.id] ?? ''}
                        onChange={(e) => setLinks({ ...links, [o.id]: e.target.value })}
                      />
                    </li>
                  )
                })}
              </ul>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField id="dv-gross" label="Gross" hint="Sum of the ORS charges">
                <Input id="dv-gross" disabled value={formatPeso(gross)} />
              </FormField>
              <FormField id="dv-tax" label="Tax withheld">
                <Input
                  id="dv-tax"
                  inputMode="decimal"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </FormField>
              <FormField id="dv-other" label="Other deductions">
                <Input
                  id="dv-other"
                  inputMode="decimal"
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                />
              </FormField>
              <p
                className={
                  net < 0 ? 'text-destructive text-sm sm:col-span-3' : 'text-sm sm:col-span-3'
                }
              >
                Net payable: <strong>{formatPeso(net)}</strong>
              </p>
              <FormField id="dv-check" label="Check / ADA No.">
                <Input id="dv-check" value={check} onChange={(e) => setCheck(e.target.value)} />
              </FormField>
              <div className="sm:col-span-2">
                <FormField id="dv-payee" label="Payee">
                  <Input
                    id="dv-payee"
                    value={payee}
                    placeholder={defaultPayee ?? 'Supplier'}
                    onChange={(e) => setPayee(e.target.value)}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-3">
                <FormField id="dv-part" label="Particulars">
                  <Textarea
                    id="dv-part"
                    rows={2}
                    value={particulars}
                    onChange={(e) => setParticulars(e.target.value)}
                  />
                </FormField>
              </div>
            </div>
          </>
        )}
        <Footer
          busy={saveDisbursement.isPending}
          disabled={!valid}
          onCancel={onClose}
          onSave={submit}
          label="Save DV"
        />
      </DialogContent>
    </Dialog>
  )
}

function Footer({
  busy,
  disabled,
  onCancel,
  onSave,
  label,
}: {
  busy: boolean
  disabled: boolean
  onCancel: () => void
  onSave: () => Promise<void>
  label: string
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button disabled={disabled || busy} onClick={() => void onSave()}>
        {busy && <Loader2Icon className="animate-spin" />} {label}
      </Button>
    </div>
  )
}

/** Small reason prompt for cancelling an ORS/DV. */
export function CancelRecordDialog({
  title,
  onConfirm,
  onClose,
}: {
  title: string
  onConfirm: (reason: string) => Promise<unknown>
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>The record stays in the register as cancelled.</DialogDescription>
        </DialogHeader>
        <FormField id="cancel-rec" label="Reason *">
          <Textarea
            id="cancel-rec"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Keep
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm(reason.trim())
                onClose()
              } catch (err) {
                toast.error(errorMessage(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Loader2Icon className="animate-spin" />} Cancel record
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
