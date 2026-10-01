import {
  CheckCircle2Icon,
  CircleDotIcon,
  CircleIcon,
  ClipboardListIcon,
  Loader2Icon,
  PencilIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  UserIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Badge } from '@/components/ui/badge'
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
import { ROLE_LABELS } from '@/features/auth/permissions'

import { formatDate, todayManila } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { ActivityTaskRow, StageProgressRow } from '@/types/database'
import { useStageAction, useUpdateStagePlan, type StageAction } from '../api'
import { stageLateness } from '../stage-utils'

interface Props {
  stages: StageProgressRow[]
  tasks: ActivityTaskRow[]
  /** False when the activity/package is cancelled or in Trash (read-only stepper). */
  active: boolean
  canEdit: boolean
  canManage: boolean
  members: { id: string; full_name: string }[]
  personName: (id: string | null) => string
  /** Required fields still empty on the record (mirrors *_missing_fields in SQL). */
  missingFields: (fields: string[]) => string[]
  fieldLabels: Record<string, string>
  /** Where to fill the fields, e.g. "Edit activity". */
  editHint: string
  /** Activity track: open packages (an override needs a justification) and their summary. */
  openPackages?: number
  packagesSlot?: ReactNode
  /** Offer "Request skip" on the current stage when it can't be skipped directly. */
  onRequestSkip?: (stage: StageProgressRow) => void
}

/** Stage list with actions for one track: an activity's own stages or one package's. */
export function WorkflowStepper({
  stages,
  tasks,
  active,
  canEdit,
  canManage,
  members,
  personName,
  missingFields,
  fieldLabels,
  editHint,
  openPackages = 0,
  packagesSlot,
  onRequestSkip,
}: Props) {
  const [dialog, setDialog] = useState<{ stage: StageProgressRow; action: StageAction } | null>(
    null,
  )
  const [planning, setPlanning] = useState<StageProgressRow | null>(null)
  const top = stages.filter((s) => !s.parent_id).sort((a, b) => a.sort_order - b.sort_order)
  const current = top.find((s) => s.status === 'pending' || s.status === 'in_progress')
  const openTasks = (stageId: string) =>
    tasks.filter((t) => t.stage_progress_id === stageId && t.is_required && !t.is_done)
  const doneTasks = (stageId: string) =>
    tasks.filter((t) => t.stage_progress_id === stageId && t.is_required && t.is_done)

  return (
    <>
      <ol className="relative space-y-1">
        {top.map((stage, i) => {
          const subs = stages
            .filter((s) => s.parent_id === stage.id)
            .sort((a, b) => a.sort_order - b.sort_order)
          const isCurrent = stage.id === current?.id
          return (
            <li key={stage.id} className="relative pl-10">
              {i < top.length - 1 && (
                <span
                  className="bg-border absolute top-8 bottom-0 left-[15px] w-px"
                  aria-hidden="true"
                />
              )}
              <StageIcon status={stage.status} className="absolute top-2 left-1.5" />
              <StageCard
                stage={stage}
                isCurrent={isCurrent}
                openTasks={openTasks(stage.id).length}
                doneTasks={doneTasks(stage.id).length}
                personName={personName}
                actions={
                  active && canEdit ? (
                    <StageActions
                      stage={stage}
                      allowed={isCurrent}
                      canManage={canManage}
                      onRequestSkip={onRequestSkip && (() => onRequestSkip(stage))}
                      onAction={(action) => setDialog({ stage, action })}
                      onPlan={() => setPlanning(stage)}
                    />
                  ) : null
                }
              >
                {stage.tracks_packages && packagesSlot && (
                  <div className="mt-3 border-t pt-3">{packagesSlot}</div>
                )}
                {subs.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t pt-3">
                    {subs.map((sub) => (
                      <li
                        key={sub.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                      >
                        <StageIcon status={sub.status} small />
                        <span
                          className={cn(
                            'min-w-0 flex-1',
                            sub.status === 'skipped' && 'text-muted-foreground line-through',
                          )}
                        >
                          {sub.name}
                        </span>
                        <DateLine stage={sub} compact />
                        {active &&
                          canEdit &&
                          isCurrent &&
                          sub.status !== 'completed' &&
                          sub.status !== 'skipped' && (
                            <span className="flex gap-1">
                              {sub.status === 'pending' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7"
                                  onClick={() => setDialog({ stage: sub, action: 'start' })}
                                >
                                  Start
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7"
                                onClick={() => setDialog({ stage: sub, action: 'complete' })}
                              >
                                Done
                              </Button>
                              {sub.skippable && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7"
                                  onClick={() => setDialog({ stage: sub, action: 'skip' })}
                                >
                                  Skip
                                </Button>
                              )}
                            </span>
                          )}
                      </li>
                    ))}
                  </ul>
                )}
                {isCurrent && active && (
                  <Requirements
                    missing={missingFields(stage.required_fields).map((f) => fieldLabels[f] ?? f)}
                    editHint={editHint}
                    openTasks={openTasks(stage.id)}
                    openSubs={
                      subs.filter((s) => s.status !== 'completed' && s.status !== 'skipped').length
                    }
                  />
                )}
              </StageCard>
            </li>
          )
        })}
      </ol>

      {dialog && (
        <StageActionDialog
          stage={dialog.stage}
          action={dialog.action}
          openPackages={dialog.stage.tracks_packages ? openPackages : 0}
          onClose={() => setDialog(null)}
        />
      )}
      {planning && (
        <StagePlanDialog stage={planning} members={members} onClose={() => setPlanning(null)} />
      )}
    </>
  )
}

function StageIcon({
  status,
  small,
  className,
}: {
  status: StageProgressRow['status']
  small?: boolean
  className?: string
}) {
  const size = small ? 'size-4' : 'size-5'
  const label = {
    pending: 'Pending',
    in_progress: 'In progress',
    completed: 'Completed',
    skipped: 'Skipped',
  }[status]
  const cls = cn(size, 'shrink-0', className)
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={cn('bg-background flex', className)}
    >
      {status === 'completed' ? (
        <CheckCircle2Icon className={cn(cls, 'text-success')} />
      ) : status === 'skipped' ? (
        <SkipForwardIcon className={cn(cls, 'text-muted-foreground')} />
      ) : status === 'in_progress' ? (
        <CircleDotIcon className={cn(cls, 'text-primary')} />
      ) : (
        <CircleIcon className={cn(cls, 'text-muted-foreground/60')} />
      )}
    </span>
  )
}

function DateLine({ stage, compact }: { stage: StageProgressRow; compact?: boolean }) {
  const late = stageLateness(stage)
  const done = stage.status === 'completed' || stage.status === 'skipped'
  return (
    <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
      <span>
        Plan {formatDate(stage.planned_start)} – {formatDate(stage.planned_end)}
      </span>
      {!compact && stage.actual_start && (
        <span>
          · Actual {formatDate(stage.actual_start)}
          {stage.actual_end ? ` – ${formatDate(stage.actual_end)}` : ' – now'}
        </span>
      )}
      {late > 0 && (
        <Badge
          variant="outline"
          className="border-destructive/40 text-destructive py-0 text-[11px]"
        >
          {done ? `Done ${late}d late` : `${late}d overdue`}
        </Badge>
      )}
    </span>
  )
}

function StageCard({
  stage,
  isCurrent,
  openTasks,
  doneTasks,
  personName,
  actions,
  children,
}: {
  stage: StageProgressRow
  isCurrent: boolean
  openTasks: number
  doneTasks: number
  personName: (id: string | null) => string
  actions: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'bg-card mb-2 rounded-lg border p-3',
        isCurrent && 'border-primary/50 ring-primary/20 shadow-xs ring-1',
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p
            className={cn(
              'font-medium',
              stage.status === 'skipped' && 'text-muted-foreground line-through',
            )}
          >
            {stage.name}
            {isCurrent && <Badge className="ml-2 align-middle">Current</Badge>}
          </p>
          <DateLine stage={stage} />
          <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {stage.responsible_role && <span>{ROLE_LABELS[stage.responsible_role]}</span>}
            {stage.assigned_to && (
              <span className="inline-flex items-center gap-1">
                <UserIcon className="size-3" /> {personName(stage.assigned_to)}
              </span>
            )}
            {openTasks + doneTasks > 0 && (
              <span className="inline-flex items-center gap-1">
                <ClipboardListIcon className="size-3" /> {doneTasks}/{openTasks + doneTasks}{' '}
                documents
              </span>
            )}
            {stage.skippable && <span>Optional</span>}
          </div>
          {stage.notes && <p className="text-xs whitespace-pre-line">{stage.notes}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

function StageActions({
  stage,
  allowed,
  canManage,
  onAction,
  onPlan,
  onRequestSkip,
}: {
  stage: StageProgressRow
  allowed: boolean
  canManage: boolean
  onAction: (a: StageAction) => void
  onPlan: () => void
  onRequestSkip?: () => void
}) {
  const finished = stage.status === 'completed' || stage.status === 'skipped'
  return (
    <div className="flex flex-wrap gap-1">
      {allowed && stage.status === 'pending' && (
        <Button size="sm" variant="outline" onClick={() => onAction('start')}>
          <PlayIcon /> Start
        </Button>
      )}
      {allowed && !finished && (
        <Button size="sm" onClick={() => onAction('complete')}>
          <CheckCircle2Icon /> Complete
        </Button>
      )}
      {allowed && !finished && stage.skippable && (
        <Button size="sm" variant="ghost" onClick={() => onAction('skip')}>
          <SkipForwardIcon /> Skip
        </Button>
      )}
      {allowed && !finished && !stage.skippable && onRequestSkip && !stage.tracks_packages && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onRequestSkip}
          title="Required stage: skipping needs approval"
        >
          <SkipForwardIcon /> Request skip
        </Button>
      )}
      {finished && canManage && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAction('reopen')}
          title="Move the workflow back to this stage"
        >
          <RotateCcwIcon /> Move back here
        </Button>
      )}
      {!finished && (
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={onPlan}
          aria-label={`Edit plan for ${stage.name}`}
        >
          <PencilIcon />
        </Button>
      )}
    </div>
  )
}

function Requirements({
  missing,
  editHint,
  openTasks,
  openSubs,
}: {
  missing: string[]
  editHint: string
  openTasks: ActivityTaskRow[]
  openSubs: number
}) {
  if (!missing.length && !openTasks.length && !openSubs) return null
  return (
    <div className="border-warning/50 bg-warning/10 mt-3 rounded-md border p-2.5 text-xs">
      <p className="mb-1 font-medium">Before completing this stage:</p>
      <ul className="list-inside list-disc space-y-0.5">
        {missing.length > 0 && (
          <li>
            Fill in: {missing.join(', ')} ({editHint})
          </li>
        )}
        {openTasks.map((t) => (
          <li key={t.id}>
            {t.title}
            {t.doc_type_code && ' (upload it under Attachments with this document type)'}
          </li>
        ))}
        {openSubs > 0 && <li>Finish or skip {openSubs} sub-step(s)</li>}
      </ul>
    </div>
  )
}

const ACTION_COPY: Record<
  StageAction,
  { title: string; button: string; noteRequired: boolean; dateLabel: string }
> = {
  start: { title: 'Start stage', button: 'Start', noteRequired: false, dateLabel: 'Start date' },
  complete: {
    title: 'Complete stage',
    button: 'Mark complete',
    noteRequired: false,
    dateLabel: 'Completion date',
  },
  skip: { title: 'Skip stage', button: 'Skip stage', noteRequired: true, dateLabel: 'Date' },
  reopen: {
    title: 'Move back to this stage',
    button: 'Move back',
    noteRequired: true,
    dateLabel: 'Date',
  },
}

function StageActionDialog({
  stage,
  action,
  openPackages,
  onClose,
}: {
  stage: StageProgressRow
  action: StageAction
  openPackages: number
  onClose: () => void
}) {
  const run = useStageAction()
  const [date, setDate] = useState(todayManila())
  const [note, setNote] = useState('')
  const copy = ACTION_COPY[action]
  const override = action === 'complete' && openPackages > 0
  const noteRequired = copy.noteRequired || override
  const noteMissing = noteRequired && !note.trim()

  const submit = async () => {
    try {
      await run.mutateAsync({ stageId: stage.id, action, note, date })
      toast.success(
        action === 'complete'
          ? `${stage.name} completed`
          : action === 'skip'
            ? `${stage.name} skipped`
            : action === 'start'
              ? `${stage.name} started`
              : `Moved back to ${stage.name}`,
      )
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {stage.name}
            {action === 'reopen' && '. Later stages return to pending and are logged.'}
          </DialogDescription>
        </DialogHeader>
        {override && (
          <p className="border-warning/50 bg-warning/10 rounded-md border p-2.5 text-sm">
            {openPackages} package{openPackages === 1 ? ' is' : 's are'} still open. Completing now
            is an admin override: give the justification (it is recorded in the history).
          </p>
        )}
        <div className="space-y-4">
          {action !== 'reopen' && (
            <FormField id="stage-date" label={copy.dateLabel}>
              <Input
                id="stage-date"
                type="date"
                value={date}
                max={todayManila()}
                onChange={(e) => setDate(e.target.value)}
              />
            </FormField>
          )}
          <FormField
            id="stage-note"
            label={
              override ? 'Override justification *' : noteRequired ? 'Reason *' : 'Note (optional)'
            }
            error={noteMissing && note !== '' ? 'Required' : undefined}
          >
            <Textarea
              id="stage-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={action === 'reopen' ? 'destructive' : 'default'}
            disabled={run.isPending || noteMissing || !date}
            onClick={() => void submit()}
          >
            {run.isPending && <Loader2Icon className="animate-spin" />}
            {copy.button}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StagePlanDialog({
  stage,
  members,
  onClose,
}: {
  stage: StageProgressRow
  members: { id: string; full_name: string }[]
  onClose: () => void
}) {
  const update = useUpdateStagePlan()
  const [assigned, setAssigned] = useState(stage.assigned_to ?? '')
  const [start, setStart] = useState(stage.planned_start ?? '')
  const [end, setEnd] = useState(stage.planned_end ?? '')
  const [notes, setNotes] = useState(stage.notes ?? '')
  const invalid = !!start && !!end && end < start

  const submit = async () => {
    try {
      await update.mutateAsync({
        stageId: stage.id,
        changes: {
          assigned_to: assigned || null,
          planned_start: start || null,
          planned_end: end || null,
          notes: notes.trim() || null,
        },
      })
      toast.success('Stage plan updated')
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Plan: {stage.name}</DialogTitle>
          <DialogDescription>
            Adjust the planned window, assignee and notes for this stage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField id="plan-assigned" label="Assigned to">
            <SelectNative
              id="plan-assigned"
              value={assigned}
              onChange={(e) => setAssigned(e.target.value)}
            >
              <option value="">—</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="plan-start" label="Planned start">
              <Input
                id="plan-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </FormField>
            <FormField
              id="plan-end"
              label="Planned end"
              error={invalid ? 'Before the start' : undefined}
            >
              <Input
                id="plan-end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </FormField>
          </div>
          <FormField id="plan-notes" label="Notes">
            <Textarea
              id="plan-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={invalid || update.isPending} onClick={() => void submit()}>
            {update.isPending && <Loader2Icon className="animate-spin" />} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
