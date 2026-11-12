import { ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatPeso } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { ActivityPhysicalRow, ActivityView } from '@/types/database'
import { bedColumns, sum, twelve, useSavePhysical } from '../physical'
import { ActivityStatusBadge } from './ActivityStatusBadge'
import { WfpStatusSelect } from './WfpStatusSelect'

const pct = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—'

/** Everything about one activity: workflow, physical targets and its money in the WFP. */
export function ActivityDialog({
  activity,
  physical,
  unitName,
  canEdit,
  onClose,
}: {
  activity: ActivityView
  physical: ActivityPhysicalRow | undefined
  unitName: string
  canEdit: boolean
  onClose: () => void
}) {
  const save = useSavePhysical()
  const [targets, setTargets] = useState(() => twelve(physical?.monthly_targets))
  const [done, setDone] = useState(() => twelve(physical?.monthly_done))
  const [note, setNote] = useState(physical?.status_note ?? '')
  const annual = Number(activity.target_quantity ?? 0)
  const fromWfp = !!physical?.wfp_row_id && !physical.wfp_removed_at
  const budget = Number(physical?.wfp_budget ?? activity.budget_amount ?? 0)
  const obligated = Number(physical?.wfp_obligated ?? 0)
  const disbursed = Number(physical?.wfp_disbursed ?? 0)
  const dirty =
    JSON.stringify(targets) !== JSON.stringify(twelve(physical?.monthly_targets)) ||
    JSON.stringify(done) !== JSON.stringify(twelve(physical?.monthly_done)) ||
    note !== (physical?.status_note ?? '')

  const submit = () =>
    save
      .mutateAsync({
        activityId: activity.id,
        targets,
        done,
        statusNote: note.trim() || null,
        exists: !!physical,
      })
      .then(() => {
        toast.success('Physical targets saved')
        onClose()
      })
      .catch((e) => toast.error(errorMessage(e)))

  const grid = (values: number[], set: (v: number[]) => void, label: string) => (
    <tr>
      <th
        scope="row"
        className="bg-card sticky left-0 pr-2 text-left text-xs font-medium whitespace-nowrap"
      >
        {label}
      </th>
      {bedColumns(values).map((col) => (
        <td key={col.label} className={cn('p-0.5', col.quarter && 'bg-muted/60')}>
          {col.month !== undefined && canEdit ? (
            <input
              aria-label={`${label} ${col.label}`}
              inputMode="decimal"
              className="bg-background focus:ring-ring h-8 w-14 rounded border px-1 text-right text-sm tabular-nums outline-none focus:ring-1"
              value={values[col.month] || ''}
              placeholder="–"
              onChange={(e) => {
                const n = Number(e.target.value.replace(/,/g, ''))
                if (!Number.isFinite(n) || n < 0) return
                const next = [...values]
                next[col.month!] = n
                set(next)
              }}
            />
          ) : (
            <span
              className={cn(
                'block w-14 px-1 text-right text-sm tabular-nums',
                col.quarter && 'font-semibold',
              )}
            >
              {col.value || '–'}
            </span>
          )}
        </td>
      ))}
    </tr>
  )

  const doneTotal = sum(done)
  const targetTotal = sum(targets)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[min(96vw,1400px)]">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">{activity.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{activity.code}</span>
            <ActivityStatusBadge status={activity.display_status} />
            {physical?.wfp_status && <Badge variant="outline">{physical.wfp_status}</Badge>}
            {physical?.wfp_phase && <span>{physical.wfp_phase}</span>}
            {fromWfp ? (
              <Badge variant="outline">From the WFP</Badge>
            ) : physical?.wfp_removed_at ? (
              <Badge variant="outline" className="border-warning/50 text-warning">
                Removed from the WFP
              </Badge>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Workflow</h3>
            <Button asChild size="sm" variant="outline">
              <Link to={`/activities/${activity.id}`}>
                <ExternalLinkIcon /> Track the workflow
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {activity.current_stage_name ??
                (activity.status === 'completed' ? 'All stages done' : 'Not started')}
            </span>
            <div className="bg-primary/15 h-2 w-40 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full"
                style={{
                  width: `${activity.stages_total ? (activity.stages_done / activity.stages_total) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="text-muted-foreground text-xs tabular-nums">
              {activity.stages_done}/{activity.stages_total} stages
            </span>
          </div>
          <WfpStatusSelect physical={physical} canEdit={canEdit} id="dialog-wfp-status" />
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Physical</h3>
            <p className="text-muted-foreground text-xs">
              Annual target <b className="text-foreground">{annual || '—'}</b> {unitName} ·
              accomplished <b className="text-foreground">{doneTotal}</b> (
              {pct(doneTotal, targetTotal || annual)})
            </p>
          </div>
          <div className="overflow-x-auto rounded-md border p-2">
            <table className="border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="bg-card sticky left-0" />
                  {bedColumns(targets).map((c) => (
                    <th
                      key={c.label}
                      className={cn(
                        'text-muted-foreground px-1 pb-1 text-right text-[11px] font-medium',
                        c.quarter && 'bg-muted/60 text-foreground',
                      )}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid(targets, setTargets, 'Target')}
                {grid(done, setDone, 'Accomplished')}
              </tbody>
            </table>
          </div>
          {annual > 0 && targetTotal > 0 && targetTotal !== annual && (
            <p className="text-warning text-xs">
              The monthly targets add up to {targetTotal}, but the annual target is {annual}. Some
              targets, like sites monitored every month, repeat by design.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="status-note">Status / remarks</Label>
            <Textarea
              id="status-note"
              rows={2}
              maxLength={1000}
              readOnly={!canEdit}
              placeholder="e.g. Obligated, PO under processing at accounting"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Financial</h3>
            <p className="text-muted-foreground text-xs">
              {fromWfp ? 'From the WFP sheet; edit the amounts there.' : 'Not linked to a WFP row.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Figure label="Budget" value={formatPeso(budget)} />
            <Figure
              label="Obligated"
              value={formatPeso(obligated)}
              hint={`${pct(obligated, budget)} of budget`}
            />
            <Figure
              label="Disbursed"
              value={formatPeso(disbursed)}
              hint={`${pct(disbursed, obligated)} of obligated`}
            />
            <Figure
              label="Balance"
              value={formatPeso(budget - obligated)}
              danger={budget - obligated < 0}
            />
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          {canEdit && (
            <Button disabled={!dirty || save.isPending} onClick={() => void submit()}>
              {save.isPending && <Loader2Icon className="animate-spin" />} Save
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Figure({
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
    <div className="rounded-md border p-2.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn('text-base font-semibold tabular-nums', danger && 'text-destructive')}>
        {value}
      </p>
      {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
    </div>
  )
}
