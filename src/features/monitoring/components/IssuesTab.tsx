import {
  AlertOctagonIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  ShieldIcon,
  Trash2Icon,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { useActivityPackages } from '@/features/packages/api'
import { formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type {
  IssueCategory,
  IssueKind,
  IssueSeverity,
  IssueStatus,
  IssueView,
} from '@/types/database'
import { useActivityIssues, useIssueMutations } from '../api'

const SEVERITY: Record<IssueSeverity, { label: string; icon: LucideIcon; className: string }> = {
  low: { label: 'Low', icon: CircleDotIcon, className: 'text-muted-foreground' },
  medium: {
    label: 'Medium',
    icon: AlertTriangleIcon,
    className: 'text-[oklch(0.5_0.13_70)] dark:text-warning',
  },
  high: { label: 'High', icon: AlertTriangleIcon, className: 'text-destructive' },
  critical: {
    label: 'Critical',
    icon: AlertOctagonIcon,
    className: 'text-destructive font-semibold',
  },
}

const STATUS: Record<IssueStatus, string> = {
  open: 'Open',
  mitigating: 'Being addressed',
  resolved: 'Resolved',
  accepted: 'Risk accepted',
  closed: 'Closed',
}

const CATEGORY: Record<IssueCategory, string> = {
  procurement: 'Procurement',
  supplier: 'Supplier',
  budget: 'Budget / funds',
  weather: 'Weather / disaster',
  beneficiaries: 'Beneficiaries',
  logistics: 'Logistics',
  peace_and_order: 'Peace and order',
  personnel: 'Personnel',
  other: 'Other',
}

export function SeverityLabel({ severity }: { severity: IssueSeverity }) {
  const s = SEVERITY[severity]
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', s.className)}>
      <s.icon className="size-3.5" /> {s.label}
    </span>
  )
}

/** Issues & risks of an activity (any program member can raise one). */
export function IssuesTab({
  activityId,
  canWrite,
  members,
  personName,
}: {
  activityId: string
  canWrite: boolean
  members: { id: string; full_name: string }[]
  personName: (id: string | null) => string
}) {
  const { user } = useAuth()
  const { data: issues = [], isPending } = useActivityIssues(activityId)
  const [showClosed, setShowClosed] = useState(false)
  const [editing, setEditing] = useState<IssueView | 'new' | null>(null)
  if (isPending) return <Skeleton className="h-64" />
  const open = issues.filter((i) => i.status === 'open' || i.status === 'mitigating')
  const shown = showClosed ? issues : open

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {open.length} open · {issues.length - open.length} resolved/closed. Any program member can
          raise an issue or risk; high and critical ones notify the program admins.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowClosed(!showClosed)}>
            {showClosed ? 'Hide closed' : 'Show closed'}
          </Button>
          <Button size="sm" onClick={() => setEditing('new')}>
            <PlusIcon /> Issue / risk
          </Button>
        </div>
      </div>
      {shown.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground text-sm">
            No {showClosed ? '' : 'open '}issues or risks.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((i) => {
            const canEditThis = canWrite || i.owner_id === user?.id || i.raised_by === user?.id
            return (
              <li key={i.id}>
                <Card
                  className={cn(
                    'py-3',
                    i.status !== 'open' && i.status !== 'mitigating' && 'opacity-70',
                  )}
                >
                  <CardContent className="space-y-1 px-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="gap-1">
                        {i.kind === 'risk' ? <ShieldIcon /> : <AlertTriangleIcon />}{' '}
                        {i.kind === 'risk' ? 'Risk' : 'Issue'}
                      </Badge>
                      <span className="font-medium">{i.title}</span>
                      <SeverityLabel severity={i.severity} />
                      {i.likelihood && (
                        <span className="text-muted-foreground text-xs">
                          likelihood {i.likelihood}
                        </span>
                      )}
                      <Badge variant="secondary">{STATUS[i.status]}</Badge>
                      {i.is_overdue && <Badge variant="destructive">Overdue</Badge>}
                      {canEditThis && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-auto size-7"
                          aria-label="Edit"
                          onClick={() => setEditing(i)}
                        >
                          <PencilIcon />
                        </Button>
                      )}
                    </div>
                    {i.description && <p className="whitespace-pre-line">{i.description}</p>}
                    {i.mitigation && (
                      <p className="text-xs">
                        <strong>{i.kind === 'risk' ? 'Mitigation' : 'Action'}:</strong>{' '}
                        {i.mitigation}
                      </p>
                    )}
                    {i.resolution && (
                      <p className="text-success flex items-start gap-1 text-xs">
                        <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0" /> {i.resolution}
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs">
                      {CATEGORY[i.category]}
                      {i.package_code && ` · ${i.package_code}`} · owner{' '}
                      {personName(i.owner_id) || '—'}
                      {i.due_date && ` · target ${formatDate(i.due_date)}`} · raised by{' '}
                      {personName(i.raised_by) || '—'}
                    </p>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      {editing && (
        <IssueDialog
          activityId={activityId}
          issue={editing === 'new' ? null : editing}
          members={members}
          canDelete={canWrite}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function IssueDialog({
  activityId,
  issue,
  members,
  canDelete,
  onClose,
}: {
  activityId: string
  issue: IssueView | null
  members: { id: string; full_name: string }[]
  canDelete: boolean
  onClose: () => void
}) {
  const { save, remove } = useIssueMutations(activityId)
  const { data: packages = [] } = useActivityPackages(activityId)
  const [kind, setKind] = useState<IssueKind>(issue?.kind ?? 'issue')
  const [title, setTitle] = useState(issue?.title ?? '')
  const [description, setDescription] = useState(issue?.description ?? '')
  const [category, setCategory] = useState<IssueCategory>(issue?.category ?? 'other')
  const [severity, setSeverity] = useState<IssueSeverity>(issue?.severity ?? 'medium')
  const [likelihood, setLikelihood] = useState(issue?.likelihood ?? 'medium')
  const [status, setStatus] = useState<IssueStatus>(issue?.status ?? 'open')
  const [owner, setOwner] = useState(issue?.owner_id ?? '')
  const [due, setDue] = useState(issue?.due_date ?? '')
  const [pkg, setPkg] = useState(issue?.package_id ?? '')
  const [mitigation, setMitigation] = useState(issue?.mitigation ?? '')
  const [resolution, setResolution] = useState(issue?.resolution ?? '')
  const needsResolution = status === 'resolved' || status === 'closed'
  const valid = title.trim().length >= 3 && (!needsResolution || resolution.trim())

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{issue ? 'Edit' : 'Raise'} an issue or risk</DialogTitle>
          <DialogDescription>
            An issue is happening now; a risk might happen. Both get an owner and a target date.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="is-kind" label="Type">
            <SelectNative
              id="is-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as IssueKind)}
            >
              <option value="issue">Issue</option>
              <option value="risk">Risk</option>
            </SelectNative>
          </FormField>
          <FormField id="is-cat" label="Category">
            <SelectNative
              id="is-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as IssueCategory)}
            >
              {Object.entries(CATEGORY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="is-title" label="Title *">
              <Input
                id="is-title"
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField id="is-desc" label="Description">
              <Textarea
                id="is-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormField>
          </div>
          <FormField id="is-sev" label={kind === 'risk' ? 'Impact' : 'Severity'}>
            <SelectNative
              id="is-sev"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
            >
              {Object.entries(SEVERITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </SelectNative>
          </FormField>
          {kind === 'risk' ? (
            <FormField id="is-lik" label="Likelihood">
              <SelectNative
                id="is-lik"
                value={likelihood}
                onChange={(e) => setLikelihood(e.target.value as 'low' | 'medium' | 'high')}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </SelectNative>
            </FormField>
          ) : (
            <FormField id="is-status" label="Status">
              <SelectNative
                id="is-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as IssueStatus)}
              >
                {Object.entries(STATUS)
                  .filter(([k]) => k !== 'accepted')
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </SelectNative>
            </FormField>
          )}
          {kind === 'risk' && (
            <FormField id="is-status" label="Status">
              <SelectNative
                id="is-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as IssueStatus)}
              >
                {Object.entries(STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </SelectNative>
            </FormField>
          )}
          <FormField id="is-owner" label="Owner">
            <SelectNative id="is-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <FormField id="is-due" label="Target date">
            <Input id="is-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </FormField>
          {packages.length > 0 && (
            <FormField id="is-pkg" label="Package (optional)">
              <SelectNative id="is-pkg" value={pkg} onChange={(e) => setPkg(e.target.value)}>
                <option value="">Whole activity</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.title}
                  </option>
                ))}
              </SelectNative>
            </FormField>
          )}
          <div className="sm:col-span-2">
            <FormField
              id="is-mit"
              label={kind === 'risk' ? 'Mitigation plan' : 'Action being taken'}
            >
              <Textarea
                id="is-mit"
                rows={2}
                value={mitigation}
                onChange={(e) => setMitigation(e.target.value)}
              />
            </FormField>
          </div>
          {(needsResolution || issue?.resolution) && (
            <div className="sm:col-span-2">
              <FormField id="is-res" label={needsResolution ? 'Resolution *' : 'Resolution'}>
                <Textarea
                  id="is-res"
                  rows={2}
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                />
              </FormField>
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {issue && canDelete && (
            <Button
              variant="ghost"
              className="text-destructive mr-auto"
              onClick={() =>
                remove
                  .mutateAsync(issue.id)
                  .then(() => {
                    toast.success('Deleted')
                    onClose()
                  })
                  .catch((e) => toast.error(errorMessage(e)))
              }
            >
              <Trash2Icon /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || save.isPending}
            onClick={() =>
              save
                .mutateAsync({
                  id: issue?.id,
                  input: {
                    kind,
                    title: title.trim(),
                    description: description.trim() || null,
                    category,
                    severity,
                    likelihood: kind === 'risk' ? likelihood : null,
                    status,
                    owner_id: owner || null,
                    due_date: due || null,
                    mitigation: mitigation.trim() || null,
                    resolution: resolution.trim() || null,
                    package_id: pkg || null,
                  },
                })
                .then(() => {
                  toast.success(issue ? 'Saved' : `${kind === 'risk' ? 'Risk' : 'Issue'} raised`)
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
