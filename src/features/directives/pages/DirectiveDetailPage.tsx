import {
  ArrowLeftIcon,
  BanIcon,
  CheckCheckIcon,
  CheckCircle2Icon,
  EyeIcon,
  Loader2Icon,
  SearchXIcon,
  SendIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ProgramChip } from '@/components/common/Badges'
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
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram } from '@/features/auth/permissions'
import { CommentsPanel } from '@/features/discussion/components/CommentsPanel'
import { useProfileNames } from '@/features/users/api'
import { formatDate, formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { DirectiveRecipientRow, DirectiveView } from '@/types/database'
import { useDirective, useDirectiveActions, useDirectiveRecipients } from '../api'
import {
  DirectiveStatusBadge,
  PriorityBadge,
  RecipientStatusBadge,
} from '../components/DirectiveBadges'
import { KIND_LABEL } from '../status'

export default function DirectiveDetailPage() {
  const { id } = useParams()
  const { user, profile, programs } = useAuth()
  const { data: d, isPending, isError, refetch } = useDirective(id)
  const { data: recipients = [] } = useDirectiveRecipients(id)
  const { data: names } = useProfileNames()
  const [closing, setClosing] = useState<'close' | 'withdraw' | null>(null)

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (!d) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title="Directive not found"
        description="It may not be addressed to you, or it belongs to a program you can't access."
        action={
          <Button asChild variant="outline">
            <Link to="/directives">Back to Directives</Link>
          </Button>
        }
      />
    )
  }

  const personName = (uid: string | null) => (uid ? (names?.get(uid) ?? '') : '')
  const program = programs.find((p) => p.id === d.program_id)
  const canManage =
    d.issued_by === user?.id ||
    canManageProgram(
      profile,
      programs.map((p) => p.id),
      d.program_id,
    )
  const mine = recipients.find((r) => r.user_id === user?.id)
  const entityLink =
    d.entity_type === 'activity'
      ? `/activities/${d.entity_id}`
      : d.entity_type === 'beneficiary'
        ? `/beneficiaries/${d.entity_id}`
        : null
  const participants = [d.issued_by, ...recipients.map((r) => r.user_id)]
    .filter((x): x is string => !!x && x !== user?.id)
    .map((x) => ({ id: x, full_name: personName(x) }))
    .filter((p) => p.full_name)

  return (
    <div className="space-y-6">
      <Link
        to="/directives"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> Directives
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{KIND_LABEL[d.kind]}</Badge>
            <DirectiveStatusBadge directive={d} />
            <PriorityBadge priority={d.priority} />
            {d.escalation_level > 0 && d.status === 'open' && (
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                Escalated · level {d.escalation_level}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{d.title}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {program && <ProgramChip program={program} />}
            <span>
              From {personName(d.issued_by) || 'a user'} · {formatDateTime(d.issued_at)}
            </span>
            {d.response_due && (
              <span className={d.is_overdue ? 'text-destructive font-medium' : undefined}>
                Respond by {formatDate(d.response_due)}
              </span>
            )}
            {entityLink && d.entity_label && (
              <Link to={entityLink} className="text-primary hover:underline">
                {d.entity_code ? `${d.entity_code} · ` : ''}
                {d.entity_label}
              </Link>
            )}
          </div>
        </div>
        {canManage && d.status === 'open' && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setClosing('withdraw')}>
              <BanIcon /> Withdraw
            </Button>
            <Button onClick={() => setClosing('close')}>
              <CheckCheckIcon /> Close
            </Button>
          </div>
        )}
      </div>

      {d.status !== 'open' && (
        <div className="bg-muted/50 rounded-md border p-3 text-sm">
          <strong>{d.status === 'closed' ? 'Closed' : 'Withdrawn'}</strong>{' '}
          {d.closed_at && `on ${formatDateTime(d.closed_at)}`}
          {d.closed_by && ` by ${personName(d.closed_by) || 'a user'}`}.
          {d.close_note && <p className="mt-1 whitespace-pre-line">{d.close_note}</p>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardContent>
              <p className="text-sm whitespace-pre-line">{d.body}</p>
            </CardContent>
          </Card>

          {mine && <MyResponse directive={d} mine={mine} />}

          <Card>
            <CardHeader>
              <CardTitle>Discussion</CardTitle>
              <CardDescription>
                Visible to the issuer, recipients and program admins.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CommentsPanel
                entityType="directive"
                entityId={d.id}
                people={participants}
                personName={personName}
                canModerate={canManage}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">
              Recipients · {d.responded_count}/{d.recipients_total} responded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {recipients
                .slice()
                .sort((a, b) => personName(a.user_id).localeCompare(personName(b.user_id)))
                .map((r) => (
                  <li key={r.user_id} className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{personName(r.user_id) || 'Former user'}</span>
                      <RecipientStatusBadge status={r.status} />
                    </div>
                    {r.response && (
                      <p className="bg-muted/50 rounded-md p-2 text-xs whitespace-pre-line">
                        {r.response}
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs">
                      {r.responded_at
                        ? `Responded ${formatDateTime(r.responded_at)}`
                        : r.acknowledged_at
                          ? `Seen ${formatDateTime(r.acknowledged_at)}`
                          : 'Not yet acknowledged'}
                      {r.proposed_date && ` · proposes ${formatDate(r.proposed_date)}`}
                    </p>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {closing && (
        <CloseDialog
          directiveId={d.id}
          withdraw={closing === 'withdraw'}
          onClose={() => setClosing(null)}
        />
      )}
    </div>
  )
}

function MyResponse({
  directive: d,
  mine,
}: {
  directive: DirectiveView
  mine: DirectiveRecipientRow
}) {
  const { acknowledge, respond } = useDirectiveActions(d.id)
  const [editing, setEditing] = useState(mine.status !== 'responded')
  const [response, setResponse] = useState(mine.response ?? '')
  const [proposed, setProposed] = useState(mine.proposed_date ?? '')
  const open = d.status === 'open'
  const isNotice = d.kind === 'overdue_notice'

  return (
    <Card className={open && mine.status !== 'responded' ? 'border-primary/50' : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Your response <RecipientStatusBadge status={mine.status} />
        </CardTitle>
        <CardDescription>
          {isNotice
            ? 'Give a status update and a revised target date. To move the due date, submit an extension request from the activity page.'
            : 'Acknowledge that you have read it, then respond when done.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {open && mine.status === 'pending' && (
          <Button
            variant="outline"
            disabled={acknowledge.isPending}
            onClick={() =>
              acknowledge
                .mutateAsync()
                .then(() => toast.success('Acknowledged'))
                .catch((e) => toast.error(errorMessage(e)))
            }
          >
            {acknowledge.isPending ? <Loader2Icon className="animate-spin" /> : <EyeIcon />}
            Acknowledge
          </Button>
        )}
        {open && editing ? (
          <div className="space-y-3">
            <FormField id="dir-response" label="Response">
              <Textarea
                id="dir-response"
                rows={4}
                maxLength={5000}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
              />
            </FormField>
            <FormField
              id="dir-proposed"
              label={isNotice ? 'Revised target date' : 'Target / completion date (optional)'}
            >
              <Input
                id="dir-proposed"
                type="date"
                className="w-44"
                value={proposed}
                onChange={(e) => setProposed(e.target.value)}
              />
            </FormField>
            <div className="flex gap-2">
              <Button
                disabled={!response.trim() || respond.isPending}
                onClick={() =>
                  respond
                    .mutateAsync({ response, proposedDate: proposed || null })
                    .then(() => {
                      toast.success('Response sent')
                      setEditing(false)
                    })
                    .catch((e) => toast.error(errorMessage(e)))
                }
              >
                {respond.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
                {mine.status === 'responded' ? 'Update response' : 'Send response'}
              </Button>
              {mine.status === 'responded' && (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : mine.response ? (
          <div className="space-y-2">
            <p className="bg-muted/50 rounded-md p-3 text-sm whitespace-pre-line">
              {mine.response}
            </p>
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <CheckCircle2Icon className="text-success size-3.5" />
              Sent {formatDateTime(mine.responded_at)}
              {mine.proposed_date && ` · proposed ${formatDate(mine.proposed_date)}`}
            </p>
            {open && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit response
              </Button>
            )}
          </div>
        ) : (
          !open && <p className="text-muted-foreground text-sm">No response was sent.</p>
        )}
      </CardContent>
    </Card>
  )
}

function CloseDialog({
  directiveId,
  withdraw,
  onClose,
}: {
  directiveId: string
  withdraw: boolean
  onClose: () => void
}) {
  const { close } = useDirectiveActions(directiveId)
  const [note, setNote] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{withdraw ? 'Withdraw directive' : 'Close directive'}</DialogTitle>
          <DialogDescription>
            {withdraw
              ? 'Use this when the directive was sent by mistake or is no longer needed.'
              : 'Close it once the instruction has been complied with. Recipients are notified.'}
          </DialogDescription>
        </DialogHeader>
        <FormField id="close-note" label="Note (optional)">
          <Textarea
            id="close-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={withdraw ? 'destructive' : 'default'}
            disabled={close.isPending}
            onClick={() =>
              close
                .mutateAsync({ note, withdraw })
                .then(() => {
                  toast.success(withdraw ? 'Directive withdrawn' : 'Directive closed')
                  onClose()
                })
                .catch((e) => toast.error(errorMessage(e)))
            }
          >
            {close.isPending && <Loader2Icon className="animate-spin" />}
            {withdraw ? 'Withdraw' : 'Close directive'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
