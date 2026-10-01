import { Loader2Icon, SendIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { useFinanceLabels, useSavings } from '@/features/finance/api'
import { useProcurementLookups } from '@/features/packages/use-procurement-lookups'
import { useSuppliers } from '@/features/suppliers/api'
import { templatesForProgram, useWorkflowTemplates } from '@/features/workflows/api'
import { formatDate, formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { ApprovalEntity, ApprovalType } from '@/types/database'
import { useSubmitApproval } from '../api'
import { TYPE_META } from '../meta'

export interface RequestTarget {
  entityType: ApprovalEntity
  entityId: string
  programId: string
  fiscalYearId: string
  label: string
  /** Extras for some request types. */
  currentDueDate?: string | null
  stageId?: string
  stageName?: string
  supplierId?: string | null
  categoryCode?: string | null
  contractAmount?: number | null
}

const HINT: Partial<Record<ApprovalType, string>> = {
  cancellation: 'The record stays on file as cancelled once approved.',
  extension: 'Extensions of ongoing work are decided by a program admin (or the superadmin).',
  stage_skip: 'Required stages can only be skipped with approval.',
  workflow_change: 'Stages with the same name keep their status and dates.',
  supplier_reaward: 'The previous award stays in the package history.',
  contract_variation: 'The savings suggestion is recomputed from the new amount.',
  realignment: 'Moves allotment between expense classes, or budget between activities.',
}

/** Submit an approval request. Mount only while open. */
export function RequestDialog({
  type,
  target,
  onClose,
}: {
  type: ApprovalType
  target: RequestTarget
  onClose: () => void
}) {
  const navigate = useNavigate()
  const submit = useSubmitApproval()
  const meta = TYPE_META[type]
  const [justification, setJustification] = useState('')
  const [p, setP] = useState<Record<string, string>>({ scope: 'allotment' })
  const set = (k: string, v: string) => setP((prev) => ({ ...prev, [k]: v }))

  const payload = (): Record<string, unknown> | null => {
    const num = (k: string) => Number((p[k] ?? '').replace(/[,₱\s]/g, ''))
    switch (type) {
      case 'extension':
        return p.new_due_date
          ? {
              new_due_date: p.new_due_date,
              ...(p.new_end_date && { new_end_date: p.new_end_date }),
            }
          : null
      case 'stage_skip':
        return { stage_id: target.stageId }
      case 'workflow_change':
        return p.template_id ? { template_id: p.template_id } : null
      case 'supplier_reaward':
        return p.supplier_id && num('contract_amount') > 0
          ? {
              supplier_id: p.supplier_id,
              contract_amount: num('contract_amount'),
              award_date: p.award_date || null,
              contract_no: p.contract_no || null,
            }
          : null
      case 'contract_variation':
        return num('contract_amount') >= 0 && p.contract_amount
          ? { contract_amount: num('contract_amount') }
          : null
      case 'realignment':
        if (!(num('amount') > 0)) return null
        return p.scope === 'allotment'
          ? p.from_ec && p.to_ec && p.from_ec !== p.to_ec
            ? {
                scope: 'allotment',
                from_expense_class_id: p.from_ec,
                to_expense_class_id: p.to_ec,
                amount: num('amount'),
                ...(p.savings && { savings_entry_id: p.savings }),
              }
            : null
          : p.from_act && p.to_act && p.from_act !== p.to_act
            ? {
                scope: 'activity_budget',
                from_activity_id: p.from_act,
                to_activity_id: p.to_act,
                amount: num('amount'),
              }
            : null
      default:
        return {}
    }
  }
  const ready = justification.trim().length >= 3 && payload() !== null

  const send = async () => {
    try {
      const id = await submit.mutateAsync({
        type,
        entityType: target.entityType,
        entityId: target.entityId,
        justification: justification.trim(),
        payload: payload() ?? {},
        fiscalYearId: target.fiscalYearId,
      })
      toast.success('Request submitted for approval')
      onClose()
      navigate(`/approvals/${id}`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <meta.icon className="text-primary size-5" /> Request: {meta.label}
          </DialogTitle>
          <DialogDescription>
            {target.label}. {HINT[type]}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <TypeFields type={type} target={target} p={p} set={set} />
          <FormField id="rq-just" label="Justification *">
            <Textarea
              id="rq-just"
              rows={4}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ready || submit.isPending} onClick={() => void send()}>
            {submit.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Submit
            request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TypeFields({
  type,
  target,
  p,
  set,
}: {
  type: ApprovalType
  target: RequestTarget
  p: Record<string, string>
  set: (k: string, v: string) => void
}) {
  const { data: templates = [] } = useWorkflowTemplates()
  const { data: suppliers = [] } = useSuppliers()
  const lookups = useProcurementLookups()
  const scope = { programIds: [target.programId], fiscalYearId: target.fiscalYearId }
  const { data: labels } = useFinanceLabels(scope)
  const { data: savings = [] } = useSavings(scope)

  switch (type) {
    case 'extension':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="rq-due"
            label="New due / target date *"
            hint={`Currently ${formatDate(target.currentDueDate)}`}
          >
            <Input
              id="rq-due"
              type="date"
              min={target.currentDueDate ?? undefined}
              value={p.new_due_date ?? ''}
              onChange={(e) => set('new_due_date', e.target.value)}
            />
          </FormField>
          {target.entityType === 'activity' && (
            <FormField id="rq-end" label="New end of implementation">
              <Input
                id="rq-end"
                type="date"
                value={p.new_end_date ?? ''}
                onChange={(e) => set('new_end_date', e.target.value)}
              />
            </FormField>
          )}
        </div>
      )
    case 'stage_skip':
      return (
        <p className="text-sm">
          Skip stage: <strong>{target.stageName}</strong>
        </p>
      )
    case 'workflow_change': {
      const options = templatesForProgram(
        templates,
        target.programId,
        target.entityType === 'package' ? 'package' : 'activity',
      )
      return (
        <FormField id="rq-wf" label="New workflow *">
          <SelectNative
            id="rq-wf"
            value={p.template_id ?? ''}
            onChange={(e) => set('template_id', e.target.value)}
          >
            <option value="">Choose…</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.program_id === null ? ' · DA-wide' : ''}
              </option>
            ))}
          </SelectNative>
        </FormField>
      )
    }
    case 'supplier_reaward': {
      const list = suppliers
        .filter((s) => s.id !== target.supplierId && s.status !== 'blacklisted')
        .sort(
          (a, b) =>
            Number(!(target.categoryCode && b.categories.includes(target.categoryCode))) -
              Number(!(target.categoryCode && a.categories.includes(target.categoryCode))) ||
            a.business_name.localeCompare(b.business_name),
        )
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField id="rq-sup" label="New supplier *">
              <SelectNative
                id="rq-sup"
                value={p.supplier_id ?? ''}
                onChange={(e) => set('supplier_id', e.target.value)}
              >
                <option value="">Choose…</option>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.business_name}
                    {s.status === 'suspended' ? ' (suspended)' : ''}
                  </option>
                ))}
              </SelectNative>
            </FormField>
          </div>
          <FormField id="rq-amt" label="Contract amount *">
            <Input
              id="rq-amt"
              inputMode="decimal"
              value={p.contract_amount ?? ''}
              onChange={(e) => set('contract_amount', e.target.value)}
            />
          </FormField>
          <FormField id="rq-date" label="Award date">
            <Input
              id="rq-date"
              type="date"
              value={p.award_date ?? ''}
              onChange={(e) => set('award_date', e.target.value)}
            />
          </FormField>
          <FormField id="rq-po" label="PO / contract No.">
            <Input
              id="rq-po"
              value={p.contract_no ?? ''}
              onChange={(e) => set('contract_no', e.target.value)}
            />
          </FormField>
        </div>
      )
    }
    case 'contract_variation':
      return (
        <FormField
          id="rq-amt"
          label="New contract amount *"
          hint={`Currently ${formatPeso(target.contractAmount)}`}
        >
          <Input
            id="rq-amt"
            inputMode="decimal"
            value={p.contract_amount ?? ''}
            onChange={(e) => set('contract_amount', e.target.value)}
          />
        </FormField>
      )
    case 'realignment':
      return (
        <div className="grid gap-4">
          <FormField id="rq-scope" label="Realign">
            <SelectNative
              id="rq-scope"
              value={p.scope}
              onChange={(e) => set('scope', e.target.value)}
            >
              <option value="allotment">Allotment between expense classes</option>
              <option value="activity_budget">Budget between activities</option>
            </SelectNative>
          </FormField>
          {p.scope === 'allotment' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {(['from_ec', 'to_ec'] as const).map((k) => (
                <FormField
                  key={k}
                  id={`rq-${k}`}
                  label={k === 'from_ec' ? 'From class *' : 'To class *'}
                >
                  <SelectNative
                    id={`rq-${k}`}
                    value={p[k] ?? ''}
                    onChange={(e) => set(k, e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {lookups.expenseClasses.map((x) => (
                      <option key={x.id} value={x.id}>
                        {String(x.code)}
                      </option>
                    ))}
                  </SelectNative>
                </FormField>
              ))}
              <div className="sm:col-span-2">
                <FormField
                  id="rq-sav"
                  label="Use procurement savings (optional)"
                  hint="Marks the savings entry confirmed when approved."
                >
                  <SelectNative
                    id="rq-sav"
                    value={p.savings ?? ''}
                    onChange={(e) => {
                      const s = savings.find((x) => x.id === e.target.value)
                      set('savings', e.target.value)
                      if (s) set('amount', String(s.amount))
                    }}
                  >
                    <option value="">—</option>
                    {savings
                      .filter((s) => s.status === 'suggested')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {labels?.packages.find((k) => k.id === s.package_id)?.code ?? 'Package'} ·{' '}
                          {formatPeso(s.amount)}
                        </option>
                      ))}
                  </SelectNative>
                </FormField>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {(['from_act', 'to_act'] as const).map((k) => (
                <FormField
                  key={k}
                  id={`rq-${k}`}
                  label={k === 'from_act' ? 'From activity *' : 'To activity *'}
                >
                  <SelectNative
                    id={`rq-${k}`}
                    value={p[k] ?? ''}
                    onChange={(e) => set(k, e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {(labels?.activities ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {formatPeso(a.budget_amount)}
                      </option>
                    ))}
                  </SelectNative>
                </FormField>
              ))}
            </div>
          )}
          <FormField id="rq-amount" label="Amount *">
            <Input
              id="rq-amount"
              inputMode="decimal"
              value={p.amount ?? ''}
              onChange={(e) => set('amount', e.target.value)}
            />
          </FormField>
        </div>
      )
    default:
      return null
  }
}
