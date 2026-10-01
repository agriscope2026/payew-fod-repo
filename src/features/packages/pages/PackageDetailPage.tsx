import {
  AlarmClockIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  BanIcon,
  GitBranchIcon,
  GavelIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RepeatIcon,
  ScissorsIcon,
  SearchXIcon,
  Trash2Icon,
  Trash2Icon as RemoveIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
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
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useActivity } from '@/features/activities/api'
import { TransitionLog } from '@/features/activities/components/HistoryPanel'
import { TasksPanel } from '@/features/activities/components/TasksPanel'
import { WorkflowStepper } from '@/features/activities/components/WorkflowStepper'
import { recordMissingFields } from '@/features/activities/stage-utils'
import { useActivityLookups } from '@/features/activities/use-activity-lookups'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram, canWriteProgram } from '@/features/auth/permissions'
import { RequestDialog } from '@/features/approvals/components/RequestDialog'
import { RequestMenu } from '@/features/approvals/components/RequestMenu'
import { useApprovalRouting } from '@/features/approvals/use-routing'
import { useEntityDirectives } from '@/features/directives/api'
import { PackageFinancePanel } from '@/features/finance/components/PackageFinancePanel'
import { DirectiveList } from '@/features/directives/components/DirectiveList'
import { IssueDirectiveDialog } from '@/features/directives/components/IssueDirectiveDialog'
import { OverdueNoticeDialog } from '@/features/directives/components/OverdueNoticeDialog'
import { useCommentCount } from '@/features/discussion/api'
import { CommentsPanel } from '@/features/discussion/components/CommentsPanel'
import { NotesPanel } from '@/features/discussion/components/NotesPanel'
import { AttachmentsPanel } from '@/features/files/components/AttachmentsPanel'
import { useAddRating, useCanManageSuppliers, useSupplierRatings } from '@/features/suppliers/api'
import { SupplierStatusBadge } from '@/features/suppliers/components/SupplierBadges'
import { Stars } from '@/features/suppliers/components/SupplierPanels'
import { PACKAGE_FIELD_LABEL } from '@/features/workflows/constants'
import { templatesForProgram, useWorkflowTemplates } from '@/features/workflows/api'
import { formatDate, formatDateTime, formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { PackageView } from '@/types/database'
import {
  useActivityPackages,
  usePackage,
  usePackageActions,
  usePackageStages,
  usePackageTasks,
  usePackageTransitions,
  useSupplierHistory,
} from '../api'
import { AwardDialog, type AwardMode } from '../components/AwardDialog'
import { CategoryTag, PackageStatusBadge } from '../components/PackageBadges'
import { PackageFormDialog } from '../components/PackageFormDialog'
import { useProcurementLookups } from '../use-procurement-lookups'

const TABS = ['workflow', 'finance', 'checklist', 'attachments', 'discussion', 'history'] as const
type Tab = (typeof TABS)[number]

export default function PackageDetailPage() {
  const { id: activityId, packageId } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'workflow'
  const setTab = (t: string) => setParams(t === 'workflow' ? {} : { tab: t }, { replace: true })

  const { data: pkg, isPending, isError, refetch } = usePackage(packageId)
  const { data: activity } = useActivity(activityId)
  const { data: siblings = [] } = useActivityPackages(activityId)
  const { data: stages = [] } = usePackageStages(packageId)
  const { data: tasks = [] } = usePackageTasks(packageId)
  const { data: transitions = [] } = usePackageTransitions(packageId)
  const { data: history = [] } = useSupplierHistory(packageId)
  const { data: commentCount = 0 } = useCommentCount('package', packageId ?? '')
  const { profile, programs } = useAuth()
  const lookups = useActivityLookups()
  const procurement = useProcurementLookups()
  const [award, setAward] = useState<AwardMode | null>(null)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState(false)
  const [skipStage, setSkipStage] = useState<{ id: string; name: string } | null>(null)
  const routing = useApprovalRouting()

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
  if (!pkg || pkg.activity_id !== activityId) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title="Package not found"
        description="It may belong to a program you can't access, or it was deleted."
        action={
          <Button asChild variant="outline">
            <Link to={activityId ? `/activities/${activityId}?tab=packages` : '/activities'}>
              Back
            </Link>
          </Button>
        }
      />
    )
  }

  const programIds = programs.map((p) => p.id)
  const activityOpen = activity ? activity.status !== 'cancelled' && !activity.deleted_at : false
  const live = activityOpen && pkg.status !== 'cancelled' && !pkg.deleted_at
  const canEdit = canWriteProgram(profile, programIds, pkg.program_id) && live
  const canManage = canManageProgram(profile, programIds, pkg.program_id)
  const members = lookups.membersOf(pkg.program_id)
  const late = (pkg.is_overdue || pkg.stage_overdue) && live
  const allocated = siblings
    .filter((p) => p.id !== pkg.id && p.status !== 'cancelled')
    .reduce((s, p) => s + Number(p.abc_amount), 0)
  const deliveryStarted = stages.some(
    (s) =>
      !s.parent_id &&
      ['delivery', 'inspection', 'obligation'].includes(s.phase_key) &&
      s.status !== 'pending',
  )

  return (
    <div className="space-y-6">
      <Link
        to={`/activities/${pkg.activity_id}?tab=packages`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {pkg.activity_code} · {pkg.activity_title}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground font-mono">{pkg.code}</span>
            <PackageStatusBadge status={pkg.display_status} />
            <CategoryTag code={pkg.category_code} name={pkg.category_name} />
            {pkg.is_overdue && <Badge variant="destructive">{pkg.days_overdue} days overdue</Badge>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{pkg.title}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {pkg.supplier_id ? (
              <span className="inline-flex items-center gap-1.5">
                Supplier:{' '}
                <Link
                  to={`/suppliers/${pkg.supplier_id}`}
                  className="text-foreground hover:underline"
                >
                  {pkg.supplier_name}
                </Link>
                {pkg.supplier_status && pkg.supplier_status !== 'active' && (
                  <SupplierStatusBadge status={pkg.supplier_status} />
                )}
              </span>
            ) : (
              <span>Not yet awarded</span>
            )}
            {pkg.procurement_mode_name && <span>{pkg.procurement_mode_name}</span>}
            <span>
              Responsible:{' '}
              {lookups.name.person(pkg.responsible_user_id) ||
                `${lookups.name.person(activity?.responsible_user_id ?? null) || '—'} (activity)`}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && late && (
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:text-destructive"
              onClick={() => setNotice(true)}
            >
              <AlarmClockIcon /> Send overdue notice
            </Button>
          )}
          {canEdit && !pkg.supplier_id && (
            <Button onClick={() => setAward('award')}>
              <GavelIcon /> Award
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit
            </Button>
          )}
          <RequestMenu
            types={
              canEdit && pkg.status !== 'closed' && routing.mustRequest(canManage)
                ? [
                    'extension',
                    'cancellation',
                    ...(pkg.supplier_id
                      ? (['supplier_reaward', 'contract_variation'] as const)
                      : []),
                    'workflow_change',
                  ]
                : []
            }
            target={{
              entityType: 'package',
              entityId: pkg.id,
              programId: pkg.program_id,
              fiscalYearId: pkg.fiscal_year_id,
              label: `${pkg.code} · ${pkg.title}`,
              currentDueDate: pkg.due_date,
              supplierId: pkg.supplier_id,
              categoryCode: pkg.category_code,
              contractAmount: pkg.contract_amount,
            }}
          />
          <PackageMenu
            pkg={pkg}
            adminNeedsSuperadmin={routing.adminNeedsSuperadmin}
            canEdit={canEdit}
            canManage={canManage}
            activityOpen={activityOpen}
            deliveryStarted={deliveryStarted}
            onAward={setAward}
          />
        </div>
      </div>

      {pkg.status === 'cancelled' && (
        <div className="border-destructive/30 bg-destructive/5 rounded-md border p-3 text-sm">
          <strong>Cancelled.</strong> {pkg.cancelled_reason}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Summary
          label="ABC"
          value={formatPeso(pkg.abc_amount)}
          hint={[
            procurement.expenseClassName(pkg.expense_class_id),
            procurement.uacsLabel(pkg.uacs_code_id),
          ]
            .filter(Boolean)
            .join(' · ')}
        />
        <Summary
          label="Contract / PO"
          value={pkg.contract_amount === null ? '—' : formatPeso(pkg.contract_amount)}
          hint={
            pkg.contract_amount === null
              ? 'Not yet awarded'
              : `${pkg.contract_no ?? 'No PO No.'} · awarded ${formatDate(pkg.award_date)}${
                  Number(pkg.savings_amount) > 0 ? ` · saves ${formatPeso(pkg.savings_amount)}` : ''
                }`
          }
        />
        <Summary
          label="Current step"
          value={pkg.current_stage_name ?? (pkg.status === 'closed' ? 'All steps done' : '—')}
          hint={`${pkg.stages_done} of ${pkg.stages_total} steps${
            pkg.stage_overdue ? ` · ${pkg.stage_days_late}d past plan` : ''
          }`}
          danger={pkg.stage_overdue}
        />
        <Summary
          label="Target completion"
          value={formatDate(pkg.due_date ?? pkg.planned_end)}
          hint={
            pkg.obligation_timing === 'before_delivery'
              ? 'Obligation (ORS) at award, before delivery'
              : 'Obligation (ORS) after delivery & inspection'
          }
          danger={pkg.is_overdue}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="finance">Finance</TabsTrigger>
            <TabsTrigger value="checklist">
              Checklist{' '}
              {tasks.filter((t) => !t.is_done).length > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0">
                  {tasks.filter((t) => !t.is_done).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="attachments">Documents</TabsTrigger>
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

        <TabsContent value="workflow" className="mt-4">
          <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
            <WorkflowStepper
              stages={stages}
              tasks={tasks}
              active={live}
              canEdit={canEdit}
              canManage={canManage}
              members={members}
              personName={lookups.name.person}
              missingFields={(fields) =>
                recordMissingFields(pkg as unknown as Record<string, unknown>, fields)
              }
              fieldLabels={PACKAGE_FIELD_LABEL}
              editHint="Edit or Award the package"
              onRequestSkip={canEdit ? (s) => setSkipStage({ id: s.id, name: s.name }) : undefined}
            />
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-sm">Step moves</CardTitle>
              </CardHeader>
              <CardContent>
                <TransitionLog transitions={transitions} personName={lookups.name.person} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="finance" className="mt-4">
          <PackageFinancePanel pkg={pkg} canEdit={canEdit} canManage={canManage} />
        </TabsContent>

        <TabsContent value="checklist" className="mt-4">
          <TasksPanel
            activityId={pkg.activity_id}
            packageId={pkg.id}
            tasks={tasks}
            stages={stages}
            canEdit={canEdit}
            members={members}
            personName={lookups.name.person}
          />
        </TabsContent>

        <TabsContent value="attachments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Package documents</CardTitle>
              <CardDescription>
                PR, RFQ, abstract, PO/contract, delivery receipts, IAR, ORS, DV. Choose the document
                type: a required type ticks its checklist item. Files are also listed in the
                Document Repository under this activity.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentsPanel
                entityType="package"
                entityId={pkg.id}
                programId={pkg.program_id}
                fiscalYearId={pkg.fiscal_year_id}
                canUpload={canEdit}
                documentTypePicker
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discussion" className="mt-4">
          <PackageDiscussion
            pkg={pkg}
            canManage={canManage}
            members={members}
            personName={lookups.name.person}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Supplier awards</CardTitle>
                <CardDescription>
                  Every award, re-award and contract change is kept.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Not yet awarded.</p>
                ) : (
                  <ol className="space-y-3">
                    {history.map((h) => (
                      <li key={h.id} className="text-sm">
                        <span className="font-medium">
                          {h.action === 'award'
                            ? 'Awarded to'
                            : h.action === 're_award'
                              ? 'Re-awarded to'
                              : 'Contract changed'}{' '}
                          {h.action !== 'contract_change' &&
                            (h.supplier?.business_name ?? 'a supplier')}
                        </span>{' '}
                        · {formatPeso(h.contract_amount)}
                        {h.previous_amount !== null && h.action === 'contract_change' && (
                          <span className="text-muted-foreground">
                            {' '}
                            (was {formatPeso(h.previous_amount)})
                          </span>
                        )}
                        <span className="text-muted-foreground block text-xs">
                          {formatDateTime(h.created_at)} ·{' '}
                          {lookups.name.person(h.created_by) || 'System'}
                          {h.reason && ` · “${h.reason}”`}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Package events</CardTitle>
              </CardHeader>
              <CardContent>
                <TransitionLog transitions={transitions} personName={lookups.name.person} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {award && <AwardDialog pkg={pkg} mode={award} onClose={() => setAward(null)} />}
      {editing && activity && (
        <PackageFormDialog
          activity={activity}
          pkg={pkg}
          allocated={allocated}
          members={members}
          onClose={() => setEditing(false)}
        />
      )}
      {skipStage && (
        <RequestDialog
          type="stage_skip"
          target={{
            entityType: 'package',
            entityId: pkg.id,
            programId: pkg.program_id,
            fiscalYearId: pkg.fiscal_year_id,
            label: `${pkg.code} · ${pkg.title}`,
            stageId: skipStage.id,
            stageName: skipStage.name,
          }}
          onClose={() => setSkipStage(null)}
        />
      )}
      {notice && (
        <OverdueNoticeDialog
          kind="package"
          activity={{ id: pkg.id, code: pkg.code, title: pkg.title, program_id: pkg.program_id }}
          onClose={() => setNotice(false)}
        />
      )}
    </div>
  )
}

function Summary({
  label,
  value,
  hint,
  danger,
}: {
  label: string
  value: string
  hint?: string
  danger?: boolean
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="truncate text-base font-semibold" title={value}>
          {value}
        </p>
        {hint && (
          <p
            className={
              danger ? 'text-destructive text-xs' : 'text-muted-foreground truncate text-xs'
            }
            title={hint}
          >
            {hint}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function PackageMenu({
  pkg,
  adminNeedsSuperadmin,
  canEdit,
  canManage,
  activityOpen,
  deliveryStarted,
  onAward,
}: {
  pkg: PackageView
  adminNeedsSuperadmin: boolean
  canEdit: boolean
  canManage: boolean
  activityOpen: boolean
  deliveryStarted: boolean
  onAward: (mode: AwardMode) => void
}) {
  const navigate = useNavigate()
  const actions = usePackageActions()
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const [switching, setSwitching] = useState(false)
  const cancelled = pkg.status === 'cancelled'
  if (!canEdit && !canManage) return null

  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => toast.success(ok)).catch((e) => toast.error(errorMessage(e)))

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canManage && !adminNeedsSuperadmin && pkg.supplier_id && !cancelled && (
            <>
              <DropdownMenuItem onSelect={() => onAward('reaward')}>
                <RepeatIcon /> Re-award to another supplier
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAward('amend')}>
                <PencilIcon /> Change contract amount
              </DropdownMenuItem>
            </>
          )}
          {canEdit && !deliveryStarted && (
            <DropdownMenuItem
              onSelect={() =>
                setConfirm({
                  title:
                    pkg.obligation_timing === 'after_delivery'
                      ? 'Obligate before delivery?'
                      : 'Obligate after delivery?',
                  description:
                    pkg.obligation_timing === 'after_delivery'
                      ? 'The Obligation (ORS) step moves in front of Delivery, e.g. when the ORS is processed at award.'
                      : 'The Obligation (ORS) step moves after Delivery and Inspection.',
                  confirmLabel: 'Reorder steps',
                  onConfirm: () =>
                    run(
                      actions.timing.mutateAsync({
                        id: pkg.id,
                        timing:
                          pkg.obligation_timing === 'after_delivery'
                            ? 'before_delivery'
                            : 'after_delivery',
                      }),
                      'Steps reordered',
                    ),
                })
              }
            >
              <ArrowRightLeftIcon />
              {pkg.obligation_timing === 'after_delivery'
                ? 'Obligate before delivery'
                : 'Obligate after delivery'}
            </DropdownMenuItem>
          )}
          {canManage && !pkg.supplier_id && !cancelled && activityOpen && (
            <DropdownMenuItem onSelect={() => setSplitting(true)}>
              <ScissorsIcon /> Split package
            </DropdownMenuItem>
          )}
          {canManage && !adminNeedsSuperadmin && !cancelled && activityOpen && (
            <DropdownMenuItem onSelect={() => setSwitching(true)}>
              <GitBranchIcon /> Change package workflow
            </DropdownMenuItem>
          )}
          {canManage && activityOpen && (
            <>
              <DropdownMenuSeparator />
              {cancelled ? (
                <DropdownMenuItem
                  onSelect={() =>
                    run(
                      actions.cancel.mutateAsync({ id: pkg.id, cancelled: false }),
                      'Package restored',
                    )
                  }
                >
                  <ArchiveRestoreIcon /> Restore package
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={adminNeedsSuperadmin}
                  onSelect={() => setCancelling(true)}
                >
                  <BanIcon /> Cancel package
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() =>
                  setConfirm({
                    title: 'Move to Trash?',
                    description:
                      'Use this for packages created by mistake. To stop a real package, cancel it instead.',
                    confirmLabel: 'Move to Trash',
                    destructive: true,
                    onConfirm: () =>
                      actions.trash
                        .mutateAsync({ id: pkg.id })
                        .then(() => {
                          toast.success('Moved to Trash')
                          navigate(`/activities/${pkg.activity_id}?tab=packages`)
                        })
                        .catch((e) => toast.error(errorMessage(e))),
                  })
                }
              >
                <Trash2Icon /> Move to Trash
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
      {cancelling && <CancelDialog pkg={pkg} onClose={() => setCancelling(false)} />}
      {splitting && <SplitDialog pkg={pkg} onClose={() => setSplitting(false)} />}
      {switching && <SwitchWorkflowDialog pkg={pkg} onClose={() => setSwitching(false)} />}
    </>
  )
}

function CancelDialog({ pkg, onClose }: { pkg: PackageView; onClose: () => void }) {
  const { cancel } = usePackageActions()
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel {pkg.code}</DialogTitle>
          <DialogDescription>
            The package stays on record as cancelled and no longer blocks the activity. Staff ask
            for this through Request → Cancellation.
          </DialogDescription>
        </DialogHeader>
        <FormField id="pkg-cancel" label="Reason *">
          <Textarea
            id="pkg-cancel"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Keep package
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || cancel.isPending}
            onClick={() =>
              cancel
                .mutateAsync({ id: pkg.id, cancelled: true, reason })
                .then(() => {
                  toast.success('Package cancelled')
                  onClose()
                })
                .catch((e) => toast.error(errorMessage(e)))
            }
          >
            {cancel.isPending && <Loader2Icon className="animate-spin" />} Cancel package
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SplitDialog({ pkg, onClose }: { pkg: PackageView; onClose: () => void }) {
  const { split } = usePackageActions()
  const half = Math.round(Number(pkg.abc_amount) / 2)
  const [parts, setParts] = useState([
    { title: `${pkg.title} — lot 1`, abc: String(half) },
    { title: `${pkg.title} — lot 2`, abc: String(Number(pkg.abc_amount) - half) },
  ])
  const [reason, setReason] = useState('')
  const total = parts.reduce((s, p) => s + (Number(p.abc) || 0), 0)
  const valid =
    parts.length >= 2 &&
    parts.every((p) => p.title.trim().length >= 2 && Number(p.abc) >= 0 && p.abc.trim() !== '') &&
    reason.trim()
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Split {pkg.code}</DialogTitle>
          <DialogDescription>
            Creates one new package per lot (each with its own workflow). The original is cancelled
            with a note pointing to the new ones.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {parts.map((p, i) => (
            <li key={i} className="flex items-end gap-2">
              <FormField id={`split-t-${i}`} label={`Lot ${i + 1} title`}>
                <Input
                  id={`split-t-${i}`}
                  value={p.title}
                  onChange={(e) =>
                    setParts(parts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                  }
                />
              </FormField>
              <FormField id={`split-a-${i}`} label="ABC">
                <Input
                  id={`split-a-${i}`}
                  className="w-32"
                  inputMode="decimal"
                  value={p.abc}
                  onChange={(e) =>
                    setParts(parts.map((x, j) => (j === i ? { ...x, abc: e.target.value } : x)))
                  }
                />
              </FormField>
              {parts.length > 2 && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove lot"
                  onClick={() => setParts(parts.filter((_, j) => j !== i))}
                >
                  <RemoveIcon />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setParts([...parts, { title: `${pkg.title} — lot ${parts.length + 1}`, abc: '0' }])
            }
          >
            <PlusIcon /> Add lot
          </Button>
          <span
            className={
              total !== Number(pkg.abc_amount)
                ? 'text-[oklch(0.5_0.13_70)]'
                : 'text-muted-foreground'
            }
          >
            Total {formatPeso(total)} of {formatPeso(pkg.abc_amount)}
          </span>
        </div>
        <FormField id="split-reason" label="Reason *">
          <Textarea
            id="split-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || split.isPending}
            onClick={() =>
              split
                .mutateAsync({
                  id: pkg.id,
                  parts: parts.map((p) => ({ title: p.title.trim(), abc_amount: Number(p.abc) })),
                  reason: reason.trim(),
                })
                .then(() => {
                  toast.success(`Split into ${parts.length} packages`)
                  onClose()
                })
                .catch((e) => toast.error(errorMessage(e)))
            }
          >
            {split.isPending && <Loader2Icon className="animate-spin" />} Split
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SwitchWorkflowDialog({ pkg, onClose }: { pkg: PackageView; onClose: () => void }) {
  const { data: templates = [] } = useWorkflowTemplates()
  const { applyWorkflow } = usePackageActions()
  const options = templatesForProgram(templates, pkg.program_id, 'package')
  const [templateId, setTemplateId] = useState(pkg.workflow_template_id ?? options[0]?.id ?? '')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change package workflow</DialogTitle>
          <DialogDescription>
            Rebuilds this package's steps. Steps with the same name keep their status and dates.
          </DialogDescription>
        </DialogHeader>
        <FormField id="pkg-wf" label="Package workflow">
          <SelectNative
            id="pkg-wf"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.program_id === null ? ' · DA-wide' : ''}
                {t.id === pkg.workflow_template_id ? ' (current)' : ''}
              </option>
            ))}
          </SelectNative>
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!templateId || applyWorkflow.isPending}
            onClick={() =>
              applyWorkflow
                .mutateAsync({ id: pkg.id, templateId })
                .then(() => {
                  toast.success('Workflow applied')
                  onClose()
                })
                .catch((e) => toast.error(errorMessage(e)))
            }
          >
            {applyWorkflow.isPending && <Loader2Icon className="animate-spin" />} Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PackageDiscussion({
  pkg,
  canManage,
  members,
  personName,
}: {
  pkg: PackageView
  canManage: boolean
  members: { id: string; full_name: string }[]
  personName: (id: string | null) => string
}) {
  const { data: directives = [] } = useEntityDirectives('package', pkg.id)
  const isAdmin = useCanManageSuppliers()
  const { data: ratings = [] } = useSupplierRatings(pkg.supplier_id ?? undefined, isAdmin)
  const [composing, setComposing] = useState(false)
  const mine = ratings.filter((r) => r.package_id === pkg.id)

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
      <Card>
        <CardHeader>
          <CardTitle>Comments</CardTitle>
          <CardDescription>About this package only. Type @ to mention a colleague.</CardDescription>
        </CardHeader>
        <CardContent>
          <CommentsPanel
            entityType="package"
            entityId={pkg.id}
            people={members}
            personName={personName}
            canModerate={canManage}
            canComment={!pkg.deleted_at}
          />
        </CardContent>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Directives & notices</CardTitle>
            {canManage && !pkg.deleted_at && (
              <div className="pt-1">
                <Button size="sm" variant="outline" onClick={() => setComposing(true)}>
                  <PlusIcon /> Directive
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {directives.length ? (
              <DirectiveList directives={directives} showEntity={false} dense />
            ) : (
              <p className="text-muted-foreground text-sm">None for this package.</p>
            )}
          </CardContent>
        </Card>
        {canManage && pkg.supplier_id && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Supplier performance</CardTitle>
              <CardDescription>Admins only. Shown on the supplier's profile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {mine.map((r) => (
                <div key={r.id} className="rounded-md border p-2 text-sm">
                  <Stars value={r.rating} />
                  <p className="mt-1 whitespace-pre-line">{r.remark}</p>
                  <p className="text-muted-foreground text-xs">
                    {personName(r.created_by) || 'Admin'} · {formatDate(r.created_at)}
                  </p>
                </div>
              ))}
              <RatingForm packageId={pkg.id} />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes</CardTitle>
            <CardDescription>Private to you, or shared with the program.</CardDescription>
          </CardHeader>
          <CardContent>
            <NotesPanel
              entityType="package"
              entityId={pkg.id}
              personName={personName}
              canModerate={canManage}
            />
          </CardContent>
        </Card>
      </div>
      {composing && (
        <IssueDirectiveDialog
          onClose={() => setComposing(false)}
          linked={{
            type: 'package',
            id: pkg.id,
            programId: pkg.program_id,
            label: `${pkg.code} · ${pkg.title}`,
          }}
        />
      )}
    </div>
  )
}

function RatingForm({ packageId }: { packageId: string }) {
  const add = useAddRating()
  const [rating, setRating] = useState(0)
  const [remark, setRemark] = useState('')
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SelectNative
          aria-label="Rating"
          className="h-8 w-40"
          value={String(rating)}
          onChange={(e) => setRating(Number(e.target.value))}
        >
          <option value="0">No rating</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} of 5
            </option>
          ))}
        </SelectNative>
        {rating > 0 && <Stars value={rating} />}
      </div>
      <Textarea
        rows={2}
        aria-label="Performance remark"
        placeholder="e.g. Delivered complete and on time"
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!remark.trim() || add.isPending}
        onClick={() =>
          add
            .mutateAsync({ packageId, rating: rating || null, remark })
            .then(() => {
              toast.success('Remark added')
              setRemark('')
              setRating(0)
            })
            .catch((e) => toast.error(errorMessage(e)))
        }
      >
        <PlusIcon /> Add remark
      </Button>
    </div>
  )
}
