import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeftIcon, Loader2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { ErrorState } from '@/components/common/ErrorState'
import { FormField } from '@/components/common/FormField'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { canWriteProgram } from '@/features/auth/permissions'
import { LocationSelect } from '@/features/locations/LocationSelect'
import { templatesForProgram, useWorkflowTemplates } from '@/features/workflows/api'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { errorMessage } from '@/lib/supabase'
import type { ActivityView } from '@/types/database'
import {
  useActivity,
  useActivityBeneficiaries,
  useSaveActivity,
  type BeneficiaryLink,
} from '../api'
import { BeneficiaryLinksEditor } from '../components/BeneficiaryLinksEditor'
import { useActivityLookups } from '../use-activity-lookups'

const optionalAmount = z
  .string()
  .trim()
  .refine(
    (v) =>
      v === '' || (!Number.isNaN(Number(v.replace(/,/g, ''))) && Number(v.replace(/,/g, '')) >= 0),
    {
      message: 'Enter a positive number',
    },
  )

const schema = z
  .object({
    program_id: z.string().min(1, 'Select a program'),
    fiscal_year_id: z.string().min(1, 'Select a fiscal year'),
    workflow_template_id: z.string(),
    title: z.string().trim().min(3, 'Enter a title (at least 3 characters)').max(250),
    category_id: z.string(),
    description: z.string().trim().max(5000),
    objectives: z.string().trim().max(5000),
    target_output: z.string().trim().max(1000),
    target_outcome: z.string().trim().max(1000),
    target_quantity: optionalAmount,
    unit_id: z.string(),
    province_id: z.string(),
    municipality_id: z.string(),
    barangay_id: z.string(),
    venue: z.string().trim().max(250),
    start_date: z.string(),
    end_date: z.string(),
    due_date: z.string(),
    delivery_date: z.string(),
    responsible_user_id: z.string(),
    responsible_unit: z.string().trim().max(120),
    budget_amount: optionalAmount,
    fund_source_id: z.string(),
    remarks: z.string().trim().max(2000),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    path: ['end_date'],
    message: 'End date is before the start date',
  })

type Values = z.infer<typeof schema>

function defaults(a: ActivityView | null | undefined, program: string, fy: string): Values {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  return {
    program_id: a?.program_id ?? program,
    fiscal_year_id: a?.fiscal_year_id ?? fy,
    workflow_template_id: a?.workflow_template_id ?? '',
    title: s(a?.title),
    category_id: s(a?.category_id),
    description: s(a?.description),
    objectives: s(a?.objectives),
    target_output: s(a?.target_output),
    target_outcome: s(a?.target_outcome),
    target_quantity: s(a?.target_quantity),
    unit_id: s(a?.unit_id),
    province_id: s(a?.province_id),
    municipality_id: s(a?.municipality_id),
    barangay_id: s(a?.barangay_id),
    venue: s(a?.venue),
    start_date: s(a?.start_date),
    end_date: s(a?.end_date),
    due_date: s(a?.due_date),
    delivery_date: s(a?.delivery_date),
    responsible_user_id: s(a?.responsible_user_id),
    responsible_unit: s(a?.responsible_unit),
    budget_amount: s(a?.budget_amount),
    fund_source_id: s(a?.fund_source_id),
    remarks: s(a?.remarks),
  }
}

/** /activities/new and /activities/:id/edit */
export default function ActivityFormPage() {
  const { id } = useParams()
  const { data: activity, isPending, isError } = useActivity(id)
  const { data: links, isPending: linksPending } = useActivityBeneficiaries(id)

  if (id && (isPending || linksPending)) return <Skeleton className="h-96" />
  if (id && (isError || !activity)) return <ErrorState title="Activity not found" />
  return <ActivityForm key={id ?? 'new'} activity={activity ?? null} initialLinks={links ?? []} />
}

function ActivityForm({
  activity,
  initialLinks,
}: {
  activity: ActivityView | null
  initialLinks: BeneficiaryLink[]
}) {
  const navigate = useNavigate()
  const { profile, programs } = useAuth()
  const ws = useWorkspace()
  const lookups = useActivityLookups()
  const { data: templates = [] } = useWorkflowTemplates()
  const save = useSaveActivity()
  const editing = !!activity

  const programIds = programs.map((p) => p.id)
  const writable = programs.filter(
    (p) => !p.archived_at && canWriteProgram(profile, programIds, p.id),
  )
  const defaultProgram =
    ws.programFilter !== 'all' && writable.some((p) => p.id === ws.programFilter)
      ? ws.programFilter
      : (writable[0]?.id ?? '')
  const openYears = ws.fiscalYears.filter(
    (f) => f.status === 'open' || f.status === 'draft' || f.id === activity?.fiscal_year_id,
  )
  const defaultFy = openYears.find((f) => f.id === ws.fiscalYear?.id)?.id ?? openYears[0]?.id ?? ''

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(activity, defaultProgram, defaultFy),
  })
  const errors = form.formState.errors
  const [programId, provinceId, municipalityId, barangayId] = useWatch({
    control: form.control,
    name: ['program_id', 'province_id', 'municipality_id', 'barangay_id'],
  })
  const [links, setLinks] = useState<BeneficiaryLink[]>(initialLinks)

  const programTemplates = useMemo(
    () => templatesForProgram(templates, programId),
    [templates, programId],
  )
  const defaultTemplate =
    programTemplates.find((t) => t.is_default && t.program_id === programId) ??
    programTemplates.find((t) => t.is_default && t.program_id === null)
  const categories = lookups.categories.filter(
    (c) =>
      (c.is_active || c.id === activity?.category_id) &&
      (c.program_id === null || c.program_id === programId),
  )
  const members = programId ? lookups.membersOf(programId) : []

  const onSubmit = form.handleSubmit(async (v) => {
    const num = (s: string) => (s === '' ? null : Number(s.replace(/,/g, '')))
    const nil = (s: string) => (s === '' ? null : s)
    try {
      const savedId = await save.mutateAsync({
        id: activity?.id,
        links,
        previousLinks: initialLinks.map((l) => l.beneficiary_id),
        input: {
          program_id: v.program_id,
          fiscal_year_id: v.fiscal_year_id,
          workflow_template_id: nil(v.workflow_template_id),
          title: v.title,
          category_id: nil(v.category_id),
          description: nil(v.description),
          objectives: nil(v.objectives),
          target_output: nil(v.target_output),
          target_outcome: nil(v.target_outcome),
          target_quantity: num(v.target_quantity),
          unit_id: nil(v.unit_id),
          province_id: nil(v.province_id),
          municipality_id: nil(v.municipality_id),
          barangay_id: nil(v.barangay_id),
          venue: nil(v.venue),
          start_date: nil(v.start_date),
          end_date: nil(v.end_date),
          due_date: nil(v.due_date),
          delivery_date: nil(v.delivery_date),
          responsible_user_id: nil(v.responsible_user_id),
          responsible_unit: nil(v.responsible_unit),
          budget_amount: num(v.budget_amount),
          fund_source_id: nil(v.fund_source_id),
          remarks: nil(v.remarks),
        },
      })
      toast.success(editing ? 'Activity saved' : 'Activity created. Its workflow stages are ready.')
      navigate(`/activities/${savedId}`, { replace: editing })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  })

  if (!editing && writable.length === 0) {
    return (
      <ErrorState
        title="You can't create activities"
        description="Your account is read-only. Ask your program admin for edit access."
      />
    )
  }

  const text = (
    key: keyof Values,
    label: string,
    opts: { area?: boolean; placeholder?: string; type?: string } = {},
  ) => (
    <FormField id={key} label={label} error={errors[key]?.message}>
      {opts.area ? (
        <Textarea
          id={key}
          rows={3}
          placeholder={opts.placeholder}
          aria-invalid={!!errors[key]}
          {...form.register(key)}
        />
      ) : (
        <Input
          id={key}
          type={opts.type}
          placeholder={opts.placeholder}
          aria-invalid={!!errors[key]}
          {...form.register(key)}
        />
      )}
    </FormField>
  )

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <Link
        to={activity ? `/activities/${activity.id}` : '/activities'}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {activity ? activity.code : 'Activities'}
      </Link>
      <PageHeader
        title={editing ? `Edit ${activity.code}` : 'New activity'}
        description={
          editing
            ? 'Program, fiscal year and workflow are fixed after creation. Admins can switch the workflow from the activity page.'
            : 'Stages, planned dates and the document checklist are created from the selected workflow.'
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <FormField id="program_id" label="Program *" error={errors.program_id?.message}>
            <SelectNative
              id="program_id"
              disabled={editing}
              {...form.register('program_id', {
                onChange: () => form.setValue('workflow_template_id', ''),
              })}
            >
              {(editing ? programs.filter((p) => p.id === activity.program_id) : writable).map(
                (p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ),
              )}
            </SelectNative>
          </FormField>
          <FormField
            id="fiscal_year_id"
            label="Fiscal year *"
            error={errors.fiscal_year_id?.message}
          >
            <SelectNative
              id="fiscal_year_id"
              disabled={editing}
              {...form.register('fiscal_year_id')}
            >
              {openYears.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <FormField
            id="workflow_template_id"
            label="Workflow"
            hint={editing ? undefined : 'Leave on default unless your program uses a special flow.'}
          >
            <SelectNative
              id="workflow_template_id"
              disabled={editing}
              {...form.register('workflow_template_id')}
            >
              <option value="">Default{defaultTemplate ? ` (${defaultTemplate.name})` : ''}</option>
              {programTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.program_id === null ? ' · DA-wide' : ''}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <div className="sm:col-span-2">{text('title', 'Title *')}</div>
          <FormField id="category_id" label="Category / component">
            <SelectNative id="category_id" {...form.register('category_id')}>
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.name)}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <div className="sm:col-span-3">{text('description', 'Description', { area: true })}</div>
          <div className="sm:col-span-3">{text('objectives', 'Objectives', { area: true })}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Targets</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            {text('target_output', 'Target output', {
              placeholder: 'e.g. 25,000 coffee seedlings distributed',
            })}
          </div>
          {text('target_quantity', 'Quantity')}
          <FormField id="unit_id" label="Unit">
            <SelectNative id="unit_id" {...form.register('unit_id')}>
              <option value="">—</option>
              {lookups.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {String(u.name)}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <div className="sm:col-span-4">
            {text('target_outcome', 'Target outcome', {
              placeholder: 'e.g. 15% increase in yield of assisted FAs',
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location & schedule</CardTitle>
          <CardDescription>
            The start date sets the planned dates of every workflow stage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LocationSelect
            idPrefix="act"
            required={{}}
            value={{
              province_id: provinceId || null,
              municipality_id: municipalityId || null,
              barangay_id: barangayId || null,
            }}
            onChange={(loc) => {
              form.setValue('province_id', loc.province_id ?? '')
              form.setValue('municipality_id', loc.municipality_id ?? '')
              form.setValue('barangay_id', loc.barangay_id ?? '')
            }}
          />
          {text('venue', 'Venue', { placeholder: 'e.g. Municipal Training Center' })}
          <div className="grid gap-4 sm:grid-cols-4">
            {text('start_date', 'Implementation start', { type: 'date' })}
            {text('end_date', 'Implementation end', { type: 'date' })}
            {text('due_date', 'Due date', { type: 'date' })}
            {text('delivery_date', 'Delivery date', { type: 'date' })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Responsibility & budget</CardTitle>
          <CardDescription>
            Obligations, disbursements and links to PPMP/WFP rows come with the Finance module.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <FormField id="responsible_user_id" label="Responsible person">
            <SelectNative id="responsible_user_id" {...form.register('responsible_user_id')}>
              <option value="">—</option>
              {members.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </SelectNative>
          </FormField>
          {text('responsible_unit', 'Responsible unit')}
          {text('budget_amount', 'Planned budget (₱)', { placeholder: '0.00' })}
          <FormField id="fund_source_id" label="Fund source">
            <SelectNative id="fund_source_id" {...form.register('fund_source_id')}>
              <option value="">—</option>
              {lookups.funds
                .filter((f) => f.is_active || f.id === activity?.fund_source_id)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {String(f.code)} · {String(f.name)}
                  </option>
                ))}
            </SelectNative>
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Beneficiaries</CardTitle>
          <CardDescription>
            Farmers' associations and individuals served, with participants, quantities and amounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BeneficiaryLinksEditor value={links} onChange={setLinks} units={lookups.units} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>{text('remarks', 'Remarks', { area: true })}</CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
          {editing ? 'Save changes' : 'Create activity'}
        </Button>
      </div>
      {!editing && (
        <p className="text-muted-foreground text-right text-xs">
          Attachments can be added on the activity page after saving.
        </p>
      )}
    </form>
  )
}
