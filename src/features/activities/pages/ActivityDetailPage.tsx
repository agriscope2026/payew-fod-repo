import {
  AlarmClockIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  BanIcon,
  GitBranchIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchXIcon,
  Trash2Icon,
  TrendingUpIcon,
  WalletIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ProgramChip } from '@/components/common/Badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { FormField } from '@/components/common/FormField'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram, canWriteProgram } from '@/features/auth/permissions'
import { useBeneficiaries } from '@/features/beneficiaries/api'
import { OverdueNoticeDialog } from '@/features/directives/components/OverdueNoticeDialog'
import { useCommentCount } from '@/features/discussion/api'
import { AttachmentsPanel } from '@/features/files/components/AttachmentsPanel'
import { useLocationLookup } from '@/features/locations/api'
import { templatesForProgram, useWorkflowTemplates } from '@/features/workflows/api'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatDate, formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { ActivityView } from '@/types/database'
import {
  useActivity,
  useActivityBeneficiaries,
  useActivityHistory,
  useActivityStages,
  useApplyWorkflow,
  useCancelActivity,
  useSaveLinks,
  useTasks,
  useTransitions,
  useTrashActivities,
  type BeneficiaryLink,
} from '../api'
import { ActivityStatusBadge } from '../components/ActivityStatusBadge'
import { BeneficiaryLinksEditor } from '../components/BeneficiaryLinksEditor'
import { DiscussionTab } from '../components/DiscussionTab'
import { HistoryPanel, TransitionLog } from '../components/HistoryPanel'
import { TasksPanel } from '../components/TasksPanel'
import { WorkflowStepper } from '../components/WorkflowStepper'
import { useActivityLookups } from '../use-activity-lookups'

const TABS = [
  'overview',
  'workflow',
  'checklist',
  'beneficiaries',
  'attachments',
  'discussion',
  'history',
] as const
type Tab = (typeof TABS)[number]

export default function ActivityDetailPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'overview'
  const setTab = (t: string) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })

  const { data: activity, isPending, isError, refetch } = useActivity(id)
  const { data: stages = [] } = useActivityStages(id)
  const { data: tasks = [] } = useTasks(id)
  const { data: transitions = [] } = useTransitions(id)
  const { data: links = [] } = useActivityBeneficiaries(id)
  const history = useActivityHistory(id, tab === 'history')
  const { data: commentCount = 0 } = useCommentCount('activity', id ?? '')

  const { profile, programs } = useAuth()
  const lookups = useActivityLookups()
  const location = useLocationLookup()
  const { fiscalYears } = useWorkspace()

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    )
  }
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (!activity) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title="Activity not found"
        description="It may belong to a program you can't access, or it was deleted."
        action={
          <Button asChild variant="outline">
            <Link to="/activities">Back to Activities</Link>
          </Button>
        }
      />
    )
  }

  const programIds = programs.map((p) => p.id)
  const canEdit = canWriteProgram(profile, programIds, activity.program_id) && !activity.deleted_at
  const canManage = canManageProgram(profile, programIds, activity.program_id)
  const program = lookups.program.get(activity.program_id)
  const fy = fiscalYears.find((f) => f.id === activity.fiscal_year_id)
  const members = lookups.membersOf(activity.program_id)
  const openChecklist = tasks.filter((t) => !t.is_done).length
  const pct = activity.stages_total
    ? Math.round((activity.stages_done / activity.stages_total) * 100)
    : 0

  return (
    <div className="space-y-6">
      <Link
        to="/activities"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> Activities
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground font-mono">{activity.code}</span>
            <ActivityStatusBadge status={activity.display_status} />
            {activity.is_overdue && (
              <Badge variant="destructive">{activity.days_overdue} days overdue</Badge>
            )}
            {activity.deleted_at && <Badge variant="destructive">In Trash</Badge>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{activity.title}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {program && <ProgramChip program={program} />}
            <span>{fy?.label}</span>
            {activity.category_id && <span>{lookups.name.category(activity.category_id)}</span>}
            {activity.province_id && <span>{location.format(activity)}</span>}
            {activity.responsible_user_id && (
              <span>Responsible: {lookups.name.person(activity.responsible_user_id)}</span>
            )}
          </div>
        </div>
        <HeaderActions activity={activity} canEdit={canEdit} canManage={canManage} />
      </div>

      {activity.status === 'cancelled' && (
        <div className="border-destructive/30 bg-destructive/5 rounded-md border p-3 text-sm">
          <strong>Cancelled.</strong> {activity.cancelled_reason}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Summary
          label="Progress"
          value={`${activity.stages_done} of ${activity.stages_total} stages`}
        >
          {/* meter: filled part = done, track = lighter step of the same hue */}
          <div
            className="bg-primary/15 mt-2 h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Stages completed"
          >
            <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </Summary>
        <Summary
          label="Current stage"
          value={
            activity.current_stage_name ??
            (activity.status === 'completed' ? 'All stages done' : '—')
          }
          hint={
            activity.current_stage_due
              ? `${activity.stage_overdue ? `${activity.stage_days_late}d past plan · ` : ''}planned end ${formatDate(activity.current_stage_due)}`
              : undefined
          }
          danger={activity.stage_overdue}
        />
        <Summary
          label="Due date"
          value={formatDate(activity.due_date)}
          hint={activity.start_date ? `Starts ${formatDate(activity.start_date)}` : undefined}
          danger={activity.is_overdue}
        />
        <Summary
          label="Planned budget"
          value={formatPeso(activity.budget_amount)}
          hint={`${activity.beneficiaries_count} beneficiaries · ${activity.participants_total.toLocaleString()} participants`}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="checklist">
              Checklist{' '}
              {openChecklist > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0">
                  {openChecklist}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="beneficiaries">Beneficiaries ({links.length})</TabsTrigger>
            <TabsTrigger value="attachments">Attachments</TabsTrigger>
            <TabsTrigger value="discussion">
              Discussion{' '}
              {commentCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0">
                  {commentCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <Overview activity={activity} lookups={lookups} location={location.format(activity)} />
        </TabsContent>

        <TabsContent value="workflow" className="mt-4">
          <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
            <WorkflowStepper
              activity={activity}
              stages={stages}
              tasks={tasks}
              canEdit={canEdit}
              canManage={canManage}
              members={members}
              personName={lookups.name.person}
            />
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-sm">Stage moves</CardTitle>
              </CardHeader>
              <CardContent>
                <TransitionLog transitions={transitions} personName={lookups.name.person} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="checklist" className="mt-4">
          <TasksPanel
            activityId={activity.id}
            tasks={tasks}
            stages={stages}
            canEdit={canEdit && activity.status !== 'cancelled'}
            members={members}
            personName={lookups.name.person}
          />
        </TabsContent>

        <TabsContent value="beneficiaries" className="mt-4">
          <BeneficiariesTab
            activityId={activity.id}
            links={links}
            canEdit={canEdit}
            units={lookups.units}
          />
        </TabsContent>

        <TabsContent value="attachments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
              <CardDescription>
                Choose the document type before uploading. A file of a required type (e.g. PR, ORS,
                DV) ticks its checklist item automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentsPanel
                entityType="activity"
                entityId={activity.id}
                programId={activity.program_id}
                fiscalYearId={activity.fiscal_year_id}
                canUpload={canEdit && activity.status !== 'cancelled'}
                documentTypePicker
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discussion" className="mt-4">
          <DiscussionTab
            activity={activity}
            canManage={canManage}
            members={members}
            personName={lookups.name.person}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryPanel
            entries={history.data}
            loading={history.isPending}
            personName={lookups.name.person}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Summary({
  label,
  value,
  hint,
  danger,
  children,
}: {
  label: string
  value: string
  hint?: string
  danger?: boolean
  children?: ReactNode
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="truncate text-base font-semibold" title={value}>
          {value}
        </p>
        {hint && (
          <p className={danger ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
            {hint}
          </p>
        )}
        {children}
      </CardContent>
    </Card>
  )
}

function Overview({
  activity: a,
  lookups,
  location,
}: {
  activity: ActivityView
  lookups: ReturnType<typeof useActivityLookups>
  location: string
}) {
  const rows: [string, ReactNode][] = [
    ['Target output', a.target_output],
    [
      'Target quantity',
      a.target_quantity !== null
        ? `${Number(a.target_quantity).toLocaleString()} ${lookups.name.unit(a.unit_id)}`
        : null,
    ],
    ['Target outcome', a.target_outcome],
    ['Location', a.province_id ? location : null],
    ['Venue', a.venue],
    [
      'Implementation',
      a.start_date ? `${formatDate(a.start_date)} – ${formatDate(a.end_date)}` : null,
    ],
    ['Delivery date', a.delivery_date ? formatDate(a.delivery_date) : null],
    [
      'Responsible',
      [lookups.name.person(a.responsible_user_id), a.responsible_unit].filter(Boolean).join(' · '),
    ],
    ['Fund source', lookups.name.fund(a.fund_source_id)],
  ]
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="space-y-5">
          {a.description && (
            <section>
              <h3 className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                Description
              </h3>
              <p className="text-sm whitespace-pre-line">{a.description}</p>
            </section>
          )}
          {a.objectives && (
            <section>
              <h3 className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                Objectives
              </h3>
              <p className="text-sm whitespace-pre-line">{a.objectives}</p>
            </section>
          )}
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd>{value || <span className="text-muted-foreground">—</span>}</dd>
              </div>
            ))}
          </dl>
          {a.remarks && (
            <p className="bg-muted/50 rounded-md p-3 text-sm whitespace-pre-line">{a.remarks}</p>
          )}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Upcoming icon={WalletIcon} title="Financial tracker" phase={7}>
          Allotment → obligation (ORS) → disbursement (DV) → balance and savings for this activity.
        </Upcoming>
        <Upcoming icon={TrendingUpIcon} title="Progress & issues" phase={8}>
          Physical and financial accomplishment updates, issues and risks.
        </Upcoming>
      </div>
    </div>
  )
}

function Upcoming({
  icon: Icon,
  title,
  phase,
  children,
}: {
  icon: typeof WalletIcon
  title: string
  phase: number
  children: ReactNode
}) {
  return (
    <Card className="bg-muted/30 gap-2 border-dashed py-4">
      <CardContent className="space-y-1 px-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Icon className="text-primary size-4" /> {title}
          <Badge variant="secondary" className="ml-auto">
            Phase {phase}
          </Badge>
        </p>
        <p className="text-muted-foreground text-xs">{children}</p>
      </CardContent>
    </Card>
  )
}

function BeneficiariesTab({
  activityId,
  links,
  canEdit,
  units,
}: {
  activityId: string
  links: BeneficiaryLink[]
  canEdit: boolean
  units: { id: string; [key: string]: unknown }[]
}) {
  const save = useSaveLinks()
  const { data: registry = [] } = useBeneficiaries()
  const [draft, setDraft] = useState<BeneficiaryLink[] | null>(null)
  const byId = new Map(registry.map((b) => [b.id, b]))

  if (draft) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <BeneficiaryLinksEditor value={draft} onChange={setDraft} units={units} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={save.isPending}
              onClick={async () => {
                try {
                  await save.mutateAsync({
                    activityId,
                    links: draft,
                    previous: links.map((l) => l.beneficiary_id),
                  })
                  toast.success('Beneficiaries saved')
                  setDraft(null)
                } catch (err) {
                  toast.error(errorMessage(err))
                }
              }}
            >
              {save.isPending && <Loader2Icon className="animate-spin" />} Save
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setDraft(links)}>
            <PencilIcon /> Edit beneficiaries
          </Button>
        )}
        <BeneficiaryLinksEditor value={links} onChange={() => {}} units={units} disabled />
        {links.length > 0 && (
          <p className="text-muted-foreground text-xs">
            Open a beneficiary:{' '}
            {links.map((l, i) => (
              <span key={l.beneficiary_id}>
                {i > 0 && ', '}
                <Link
                  to={`/beneficiaries/${l.beneficiary_id}`}
                  className="text-primary hover:underline"
                >
                  {byId.get(l.beneficiary_id)?.name ?? 'Beneficiary'}
                </Link>
              </span>
            ))}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function HeaderActions({
  activity,
  canEdit,
  canManage,
}: {
  activity: ActivityView
  canEdit: boolean
  canManage: boolean
}) {
  const navigate = useNavigate()
  const cancel = useCancelActivity()
  const trash = useTrashActivities()
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const [reasonFor, setReasonFor] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [notice, setNotice] = useState(false)
  const cancelled = activity.status === 'cancelled'
  const late =
    (activity.status === 'not_started' || activity.status === 'ongoing') &&
    (activity.is_overdue || activity.stage_overdue) &&
    !activity.deleted_at

  return (
    <div className="flex gap-2">
      {canManage && late && (
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:text-destructive"
          onClick={() => setNotice(true)}
        >
          <AlarmClockIcon /> Send overdue notice
        </Button>
      )}
      {canEdit && !cancelled && (
        <Button variant="outline" onClick={() => navigate(`/activities/${activity.id}/edit`)}>
          <PencilIcon /> Edit
        </Button>
      )}
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More actions">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!activity.deleted_at && !cancelled && (
              <DropdownMenuItem onSelect={() => setSwitching(true)}>
                <GitBranchIcon /> Change workflow
              </DropdownMenuItem>
            )}
            {!activity.deleted_at &&
              (cancelled ? (
                <DropdownMenuItem
                  onSelect={() =>
                    setConfirm({
                      title: 'Restore this activity?',
                      description: 'It returns to its previous workflow stage.',
                      confirmLabel: 'Restore',
                      onConfirm: () =>
                        cancel
                          .mutateAsync({ id: activity.id, cancelled: false })
                          .then(() => toast.success('Activity restored'))
                          .catch((e) => toast.error(errorMessage(e))),
                    })
                  }
                >
                  <ArchiveRestoreIcon /> Restore activity
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" onSelect={() => setReasonFor(true)}>
                  <BanIcon /> Cancel activity
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant={activity.deleted_at ? 'default' : 'destructive'}
              onSelect={() =>
                setConfirm({
                  title: activity.deleted_at ? 'Restore from Trash?' : 'Move to Trash?',
                  description: activity.deleted_at
                    ? 'The activity becomes visible to the program again.'
                    : 'Use this for records created by mistake. To stop a real activity, cancel it instead.',
                  confirmLabel: activity.deleted_at ? 'Restore' : 'Move to Trash',
                  destructive: !activity.deleted_at,
                  onConfirm: () =>
                    trash
                      .mutateAsync({ ids: [activity.id], restore: !!activity.deleted_at })
                      .then(() => {
                        toast.success(activity.deleted_at ? 'Restored' : 'Moved to Trash')
                        if (!activity.deleted_at) navigate('/activities')
                      })
                      .catch((e) => toast.error(errorMessage(e))),
                })
              }
            >
              {activity.deleted_at ? <ArchiveRestoreIcon /> : <Trash2Icon />}
              {activity.deleted_at ? 'Restore from Trash' : 'Move to Trash'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
      {reasonFor && <CancelDialog activityId={activity.id} onClose={() => setReasonFor(false)} />}
      {switching && (
        <SwitchWorkflowDialog activity={activity} onClose={() => setSwitching(false)} />
      )}
      {notice && <OverdueNoticeDialog activity={activity} onClose={() => setNotice(false)} />}
    </div>
  )
}

function CancelDialog({ activityId, onClose }: { activityId: string; onClose: () => void }) {
  const cancel = useCancelActivity()
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel activity</DialogTitle>
          <DialogDescription>
            The activity stays on record (and in reports) as cancelled. From Phase 8, cancellations
            go through the approval workflow.
          </DialogDescription>
        </DialogHeader>
        <FormField id="cancel-reason" label="Reason *">
          <Textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Keep activity
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || cancel.isPending}
            onClick={async () => {
              try {
                await cancel.mutateAsync({ id: activityId, cancelled: true, reason })
                toast.success('Activity cancelled')
                onClose()
              } catch (err) {
                toast.error(errorMessage(err))
              }
            }}
          >
            {cancel.isPending && <Loader2Icon className="animate-spin" />} Cancel activity
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SwitchWorkflowDialog({
  activity,
  onClose,
}: {
  activity: ActivityView
  onClose: () => void
}) {
  const { data: templates = [] } = useWorkflowTemplates()
  const apply = useApplyWorkflow()
  const options = templatesForProgram(templates, activity.program_id)
  const [templateId, setTemplateId] = useState(
    activity.workflow_template_id ?? options[0]?.id ?? '',
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change workflow</DialogTitle>
          <DialogDescription>
            Rebuilds this activity's stages from the selected workflow (use it to pick up template
            changes). Stages with the same name keep their status and dates; your own checklist
            items are kept.
          </DialogDescription>
        </DialogHeader>
        <FormField id="switch-wf" label="Workflow">
          <SelectNative
            id="switch-wf"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.program_id === null ? ' · DA-wide' : ''}
                {t.id === activity.workflow_template_id ? ' (current)' : ''}
              </option>
            ))}
          </SelectNative>
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!templateId || apply.isPending}
            onClick={async () => {
              try {
                await apply.mutateAsync({ activityId: activity.id, templateId })
                toast.success('Workflow applied')
                onClose()
              } catch (err) {
                toast.error(errorMessage(err))
              }
            }}
          >
            {apply.isPending && <Loader2Icon className="animate-spin" />} Apply workflow
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
