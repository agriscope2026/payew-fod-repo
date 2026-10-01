import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClockAlertIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { MiniLineChart } from '@/components/charts/MiniLineChart'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { formatDate, formatPeso, todayManila } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { ActivityView, ProgressFlag, ProgressUpdateRow } from '@/types/database'
import { useProgressMutations, useProgressUpdates } from '../api'

const FLAG: Record<ProgressFlag, { label: string; icon: LucideIcon; className: string }> = {
  on_track: { label: 'On track', icon: CheckCircle2Icon, className: 'text-success' },
  at_risk: {
    label: 'At risk',
    icon: AlertTriangleIcon,
    className: 'text-[oklch(0.5_0.13_70)] dark:text-warning',
  },
  delayed: { label: 'Delayed', icon: ClockAlertIcon, className: 'text-destructive' },
}

/** Physical and financial accomplishment updates for one activity. */
export function ProgressTab({
  activity,
  canEdit,
  canManage,
  personName,
}: {
  activity: ActivityView
  canEdit: boolean
  canManage: boolean
  personName: (id: string | null) => string
}) {
  const { user } = useAuth()
  const { data: updates = [], isPending } = useProgressUpdates(activity.id)
  const { remove } = useProgressMutations(activity.id)
  const [editing, setEditing] = useState<ProgressUpdateRow | 'new' | null>(null)
  const budget = Number(activity.budget_amount ?? 0)

  if (isPending) return <Skeleton className="h-64" />
  const latest = updates[0]

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-0">
            <MiniLineChart
              title="Physical accomplishment (%)"
              points={updates.map((u) => ({ date: u.as_of_date, value: Number(u.physical_pct) }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <MiniLineChart
              title="Financial accomplishment — obligated (% of budget)"
              points={
                budget > 0
                  ? updates
                      .filter((u) => u.obligated_snapshot !== null)
                      .map((u) => ({
                        date: u.as_of_date,
                        value: (Number(u.obligated_snapshot) / budget) * 100,
                      }))
                  : []
              }
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Progress updates</CardTitle>
            <CardDescription>
              {latest
                ? `Latest as of ${formatDate(latest.as_of_date)}: ${Number(latest.physical_pct)}% physical`
                : 'No update yet. Ongoing activities are reminded every 30 days.'}
            </CardDescription>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setEditing('new')}>
              <PlusIcon /> Progress update
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {updates.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing reported yet.</p>
          ) : (
            <ol className="space-y-4">
              {updates.map((u) => {
                const f = FLAG[u.status_flag]
                const mine = u.created_by === user?.id
                return (
                  <li key={u.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium">{formatDate(u.as_of_date)}</span>
                      <span className="tabular-nums">{Number(u.physical_pct)}% physical</span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-xs font-medium',
                          f.className,
                        )}
                      >
                        <f.icon className="size-3.5" /> {f.label}
                      </span>
                      {u.quantity_accomplished !== null && (
                        <span className="text-muted-foreground text-xs">
                          {Number(u.quantity_accomplished).toLocaleString()} of{' '}
                          {Number(activity.target_quantity ?? 0).toLocaleString()}
                        </span>
                      )}
                      {(u.participants_male !== null || u.participants_female !== null) && (
                        <span className="text-muted-foreground text-xs">
                          {u.participants_male ?? 0} male · {u.participants_female ?? 0} female
                        </span>
                      )}
                      <span className="ml-auto flex">
                        {mine && canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label="Edit update"
                            onClick={() => setEditing(u)}
                          >
                            <PencilIcon />
                          </Button>
                        )}
                        {(mine || canManage) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label="Delete update"
                            onClick={() =>
                              remove.mutateAsync(u.id).catch((e) => toast.error(errorMessage(e)))
                            }
                          >
                            <Trash2Icon />
                          </Button>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-line">{u.narrative}</p>
                    {u.next_steps && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        <strong>Next:</strong> {u.next_steps}
                      </p>
                    )}
                    <p className="text-muted-foreground mt-1 text-xs">
                      {personName(u.created_by) || 'System'}
                      {u.obligated_snapshot !== null &&
                        ` · at that date: obligated ${formatPeso(u.obligated_snapshot)}, disbursed ${formatPeso(u.disbursed_snapshot)}`}
                    </p>
                  </li>
                )
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {editing && (
        <ProgressDialog
          activity={activity}
          update={editing === 'new' ? null : editing}
          previous={updates[0]}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ProgressDialog({
  activity,
  update,
  previous,
  onClose,
}: {
  activity: ActivityView
  update: ProgressUpdateRow | null
  previous?: ProgressUpdateRow
  onClose: () => void
}) {
  const { save } = useProgressMutations(activity.id)
  const [date, setDate] = useState(update?.as_of_date ?? todayManila())
  const [pct, setPct] = useState(String(update?.physical_pct ?? previous?.physical_pct ?? ''))
  const [qty, setQty] = useState(
    update?.quantity_accomplished !== undefined && update?.quantity_accomplished !== null
      ? String(update.quantity_accomplished)
      : '',
  )
  const [male, setMale] = useState(update?.participants_male?.toString() ?? '')
  const [female, setFemale] = useState(update?.participants_female?.toString() ?? '')
  const [flag, setFlag] = useState<ProgressFlag>(
    update?.status_flag ?? (activity.display_status === 'delayed' ? 'delayed' : 'on_track'),
  )
  const [narrative, setNarrative] = useState(update?.narrative ?? '')
  const [next, setNext] = useState(update?.next_steps ?? '')
  const p = Number(pct)
  const valid = date && pct !== '' && p >= 0 && p <= 100 && narrative.trim().length >= 3
  const int = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.round(Number(s))))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{update ? 'Edit progress update' : 'Progress update'}</DialogTitle>
          <DialogDescription>
            The financial figures (obligated / disbursed) are captured automatically from the
            Financial Tracker.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="pg-date" label="As of *">
            <Input
              id="pg-date"
              type="date"
              max={todayManila()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </FormField>
          <FormField
            id="pg-pct"
            label="Physical accomplishment (%) *"
            error={pct && !(p >= 0 && p <= 100) ? '0 to 100' : undefined}
          >
            <Input
              id="pg-pct"
              inputMode="decimal"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
            />
          </FormField>
          {activity.target_quantity !== null && (
            <FormField
              id="pg-qty"
              label="Quantity accomplished"
              hint={`Target ${Number(activity.target_quantity).toLocaleString()}`}
            >
              <Input
                id="pg-qty"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </FormField>
          )}
          <FormField id="pg-flag" label="Self-assessment">
            <SelectNative
              id="pg-flag"
              value={flag}
              onChange={(e) => setFlag(e.target.value as ProgressFlag)}
            >
              {Object.entries(FLAG).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <FormField id="pg-male" label="Participants reached (male)">
            <Input
              id="pg-male"
              inputMode="numeric"
              value={male}
              onChange={(e) => setMale(e.target.value)}
            />
          </FormField>
          <FormField id="pg-female" label="Participants reached (female)">
            <Input
              id="pg-female"
              inputMode="numeric"
              value={female}
              onChange={(e) => setFemale(e.target.value)}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="pg-narr" label="What was accomplished *">
              <Textarea
                id="pg-narr"
                rows={4}
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField id="pg-next" label="Next steps">
              <Textarea
                id="pg-next"
                rows={2}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </FormField>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || save.isPending}
            onClick={() =>
              save
                .mutateAsync({
                  id: update?.id,
                  input: {
                    as_of_date: date,
                    physical_pct: p,
                    quantity_accomplished: qty.trim() === '' ? null : Number(qty),
                    participants_male: int(male),
                    participants_female: int(female),
                    status_flag: flag,
                    narrative: narrative.trim(),
                    next_steps: next.trim() || null,
                  },
                })
                .then(() => {
                  toast.success('Progress update saved')
                  onClose()
                })
                .catch((e) => toast.error(errorMessage(e)))
            }
          >
            {save.isPending && <Loader2Icon className="animate-spin" />} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
