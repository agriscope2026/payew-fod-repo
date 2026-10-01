import { AlarmClockIcon, Loader2Icon, SendIcon } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { usePackageOverdueDraft, useSendPackageOverdueNotice } from '@/features/packages/api'
import { todayManila } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { DirectivePriority, OverdueNoticeDraft } from '@/types/database'
import { useOverdueDraft, useSendOverdueNotice } from '../api'
import { PRIORITY } from '../status'
import { useProgramMembers } from '../use-program-members'
import { RecipientPicker } from './RecipientPicker'

/**
 * "Send Overdue Notice": a directive prefilled from Settings → overdue notice
 * template, addressed to the stage assignee / responsible person by default.
 * Works for an activity or for one procurement package (`kind="package"`).
 */
export function OverdueNoticeDialog({
  activity,
  kind = 'activity',
  onClose,
}: {
  activity: { id: string; code: string | null; title: string; program_id: string }
  kind?: 'activity' | 'package'
  onClose: () => void
}) {
  const activityDraft = useOverdueDraft(activity.id, kind === 'activity')
  const packageDraft = usePackageOverdueDraft(activity.id, kind === 'package')
  const draft = kind === 'package' ? packageDraft : activityDraft

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlarmClockIcon className="text-destructive size-5" /> Send overdue notice
          </DialogTitle>
          <DialogDescription>
            {activity.code} · {activity.title}. Recipients must respond with a status update and a
            revised target date; unanswered notices escalate automatically.
          </DialogDescription>
        </DialogHeader>
        {draft.isError ? (
          <div className="space-y-3">
            <p className="text-destructive text-sm" role="alert">
              {errorMessage(draft.error)}
            </p>
            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : draft.data ? (
          <NoticeForm activity={activity} kind={kind} draft={draft.data} onClose={onClose} />
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-28" />
            <Skeleton className="h-40" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function NoticeForm({
  activity,
  kind,
  draft,
  onClose,
}: {
  activity: { id: string; program_id: string }
  kind: 'activity' | 'package'
  draft: OverdueNoticeDraft
  onClose: () => void
}) {
  const { user } = useAuth()
  const { membersOf } = useProgramMembers()
  const sendActivity = useSendOverdueNotice()
  const sendPackage = useSendPackageOverdueNotice()
  const send = kind === 'package' ? sendPackage : sendActivity
  const [title, setTitle] = useState(draft.title)
  const [body, setBody] = useState(draft.body)
  const [due, setDue] = useState(draft.response_due)
  const [priority, setPriority] = useState<DirectivePriority>('high')
  const [recipients, setRecipients] = useState<string[]>(() =>
    draft.recipients.filter((id) => id !== user?.id),
  )
  const people = membersOf(activity.program_id)

  const submit = async () => {
    try {
      const common = { recipients, title, body, responseDue: due || null, priority }
      if (kind === 'package') await sendPackage.mutateAsync({ packageId: activity.id, ...common })
      else await sendActivity.mutateAsync({ activityId: activity.id, ...common })
      toast.success('Overdue notice sent')
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <div className="grid gap-4">
        <p className="bg-destructive/5 text-destructive rounded-md px-3 py-2 text-sm">
          {draft.days_overdue} day{draft.days_overdue === 1 ? '' : 's'} overdue
        </p>
        <FormField id="on-title" label="Subject *">
          <Input
            id="on-title"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FormField>
        <FormField id="on-body" label="Message *">
          <Textarea
            id="on-body"
            rows={5}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="on-due" label="Respond by">
            <Input
              id="on-due"
              type="date"
              min={todayManila()}
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </FormField>
          <FormField id="on-priority" label="Priority">
            <SelectNative
              id="on-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as DirectivePriority)}
            >
              {(Object.keys(PRIORITY) as DirectivePriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY[p].label}
                </option>
              ))}
            </SelectNative>
          </FormField>
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Recipients *</span>
          {draft.recipients.length === 0 && (
            <p className="text-muted-foreground text-xs">
              No responsible person is set. Choose who should respond.
            </p>
          )}
          <RecipientPicker people={people} value={recipients} onChange={setRecipients} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!title.trim() || !body.trim() || !recipients.length || send.isPending}
          onClick={() => void submit()}
        >
          {send.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send notice
        </Button>
      </div>
    </>
  )
}
