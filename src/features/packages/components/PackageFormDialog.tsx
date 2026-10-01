import { AlertTriangleIcon, Loader2Icon } from 'lucide-react'
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
import { templatesForProgram, useWorkflowTemplates } from '@/features/workflows/api'
import { formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { ObligationTiming, PackageRow } from '@/types/database'
import { useSavePackage } from '../api'
import { CATEGORY_TITLE, categoryIcon } from '../category-meta'
import { useProcurementLookups } from '../use-procurement-lookups'

/** Create (with the quick category picker) or edit a package. Mount only while open. */
export function PackageFormDialog({
  activity,
  pkg,
  allocated,
  members,
  onClose,
  onSaved,
}: {
  activity: { id: string; program_id: string; budget_amount: number | null; title: string }
  pkg?: PackageRow | null
  /** ABC of the activity's other non-cancelled packages. */
  allocated: number
  members: { id: string; full_name: string }[]
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const lookups = useProcurementLookups()
  const { data: templates = [] } = useWorkflowTemplates()
  const packageTemplates = templatesForProgram(templates, activity.program_id, 'package')
  const save = useSavePackage()
  const editing = !!pkg

  const [categoryId, setCategoryId] = useState(pkg?.category_id ?? '')
  const [title, setTitle] = useState(pkg?.title ?? '')
  const [description, setDescription] = useState(pkg?.description ?? '')
  const [abc, setAbc] = useState(pkg ? String(pkg.abc_amount) : '')
  const [modeId, setModeId] = useState(pkg?.procurement_mode_id ?? '')
  const [ecId, setEcId] = useState(pkg?.expense_class_id ?? '')
  const [uacsId, setUacsId] = useState(pkg?.uacs_code_id ?? '')
  const [responsible, setResponsible] = useState(pkg?.responsible_user_id ?? '')
  const [start, setStart] = useState(pkg?.start_date ?? '')
  const [due, setDue] = useState(pkg?.due_date ?? '')
  const [remarks, setRemarks] = useState(pkg?.remarks ?? '')
  const [timing, setTiming] = useState<ObligationTiming>('after_delivery')
  const [templateId, setTemplateId] = useState(
    () => packageTemplates.find((t) => t.is_default && t.program_id)?.id ?? '',
  )

  const pickCategory = (id: string) => {
    const c = lookups.category(id)
    setCategoryId(id)
    if (!c) return
    // Only overwrite values the user hasn't typed themselves.
    const suggested = new Set(Object.values(CATEGORY_TITLE))
    if (!title.trim() || suggested.has(title)) setTitle(CATEGORY_TITLE[c.code] ?? c.name)
    if (c.default_expense_class_id) setEcId(c.default_expense_class_id)
    if (c.default_uacs_code_id) setUacsId(c.default_uacs_code_id)
  }

  const abcNum = Number(abc.replace(/,/g, '')) || 0
  const budget = Number(activity.budget_amount ?? 0)
  const remaining = budget - allocated - abcNum
  const invalidAbc =
    abc.trim() !== '' && (!Number.isFinite(Number(abc.replace(/,/g, ''))) || abcNum < 0)
  const invalidDates = !!start && !!due && due < start
  const valid = title.trim().length >= 2 && !invalidAbc && !invalidDates

  const submit = async () => {
    try {
      const id = await save.mutateAsync({
        id: pkg?.id,
        activityId: activity.id,
        obligationTiming: timing,
        workflowTemplateId: templateId || null,
        input: {
          title: title.trim(),
          description: description.trim() || null,
          category_id: categoryId || null,
          procurement_mode_id: modeId || null,
          expense_class_id: ecId || null,
          uacs_code_id: uacsId || null,
          abc_amount: abcNum,
          responsible_user_id: responsible || null,
          start_date: start || null,
          due_date: due || null,
          remarks: remarks.trim() || null,
        },
      })
      toast.success(editing ? 'Package updated' : 'Package added')
      onClose()
      onSaved?.(id)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${pkg.code}` : 'Add package'}</DialogTitle>
          <DialogDescription>
            One package per supplier or lot (lodging, meals, transport, supplies…). Each runs its
            own procurement, delivery, obligation and payment steps.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Category</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {lookups.categories
                .filter((c) => c.is_active || c.id === categoryId)
                .map((c) => {
                  const Icon = categoryIcon(c.code)
                  const on = c.id === categoryId
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => pickCategory(c.id)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-center text-xs transition-colors',
                        on
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'hover:bg-accent',
                      )}
                    >
                      <Icon className="size-5" />
                      {c.name.split(' / ')[0]}
                    </button>
                  )
                })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField id="pk-title" label="Title *">
                <Input
                  id="pk-title"
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField id="pk-desc" label="Specifications / description">
                <Textarea
                  id="pk-desc"
                  rows={2}
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 40 pax × 3 days, AM/PM snacks and lunch"
                />
              </FormField>
            </div>
            <FormField
              id="pk-abc"
              label="ABC (approved budget for the contract)"
              error={invalidAbc ? 'Enter an amount of 0 or more' : undefined}
            >
              <Input
                id="pk-abc"
                inputMode="decimal"
                value={abc}
                onChange={(e) => setAbc(e.target.value)}
              />
            </FormField>
            <FormField id="pk-mode" label="Procurement mode">
              <SelectNative id="pk-mode" value={modeId} onChange={(e) => setModeId(e.target.value)}>
                <option value="">Not yet decided</option>
                {lookups.modes
                  .filter((m) => m.is_active || m.id === modeId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </SelectNative>
            </FormField>
            {budget > 0 && (
              <p
                className={cn(
                  'text-xs sm:col-span-2',
                  remaining < 0 ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {remaining < 0 && <AlertTriangleIcon className="mr-1 inline size-3.5" />}
                Activity budget {formatPeso(budget)} · other packages {formatPeso(allocated)} ·{' '}
                {remaining < 0
                  ? `over by ${formatPeso(-remaining)}`
                  : `${formatPeso(remaining)} unallocated after this package`}
              </p>
            )}
            <FormField id="pk-ec" label="Expense class">
              <SelectNative id="pk-ec" value={ecId} onChange={(e) => setEcId(e.target.value)}>
                <option value="">—</option>
                {lookups.expenseClasses.map((x) => (
                  <option key={x.id} value={x.id}>
                    {String(x.code)} · {String(x.name)}
                  </option>
                ))}
              </SelectNative>
            </FormField>
            <FormField id="pk-uacs" label="UACS object code">
              <SelectNative id="pk-uacs" value={uacsId} onChange={(e) => setUacsId(e.target.value)}>
                <option value="">—</option>
                {lookups.uacs
                  .filter((u) => !ecId || u.expense_class_id === ecId || u.id === uacsId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {String(u.code)} · {String(u.name)}
                    </option>
                  ))}
              </SelectNative>
            </FormField>
            <FormField id="pk-resp" label="Responsible person">
              <SelectNative
                id="pk-resp"
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
              >
                <option value="">Same as the activity</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </SelectNative>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField id="pk-start" label="Start">
                <Input
                  id="pk-start"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </FormField>
              <FormField
                id="pk-due"
                label="Target completion"
                error={invalidDates ? 'Before start' : undefined}
              >
                <Input
                  id="pk-due"
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </FormField>
            </div>
            {!editing && (
              <>
                <FormField
                  id="pk-timing"
                  label="Obligation (ORS)"
                  hint="Can be changed later until delivery starts."
                >
                  <SelectNative
                    id="pk-timing"
                    value={timing}
                    onChange={(e) => setTiming(e.target.value as ObligationTiming)}
                  >
                    <option value="after_delivery">After delivery and inspection</option>
                    <option value="before_delivery">At award, before delivery</option>
                  </SelectNative>
                </FormField>
                <FormField id="pk-wf" label="Package workflow">
                  <SelectNative
                    id="pk-wf"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    <option value="">Program default</option>
                    {packageTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.program_id === null ? ' · DA-wide' : ''}
                      </option>
                    ))}
                  </SelectNative>
                </FormField>
              </>
            )}
            <div className="sm:col-span-2">
              <FormField id="pk-remarks" label="Remarks">
                <Input
                  id="pk-remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </FormField>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || save.isPending} onClick={() => void submit()}>
            {save.isPending && <Loader2Icon className="animate-spin" />}
            {editing ? 'Save changes' : 'Add package'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
