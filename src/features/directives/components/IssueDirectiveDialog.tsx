import { addDays, format, parseISO } from 'date-fns'
import { Loader2Icon, SendIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram } from '@/features/auth/permissions'
import { todayManila } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type { DirectivePriority } from '@/types/database'
import { useIssueDirective } from '../api'
import { PRIORITY } from '../status'
import { useProgramMembers } from '../use-program-members'
import { RecipientPicker } from './RecipientPicker'

export interface LinkedRecord {
  type: 'activity' | 'package' | 'beneficiary'
  id: string
  programId: string
  label: string
}

/** Compose a directive. Mount only while open so each opening starts clean. */
export function IssueDirectiveDialog({
  onClose,
  linked,
}: {
  onClose: () => void
  /** Pre-linked record (e.g. from an activity page); fixes the program. */
  linked?: LinkedRecord
}) {
  const navigate = useNavigate()
  const { profile, programs } = useAuth()
  const programIds = programs.map((p) => p.id)
  const managed = programs.filter((p) => canManageProgram(profile, programIds, p.id))
  const { membersOf } = useProgramMembers()
  const issue = useIssueDirective()

  const [programId, setProgramId] = useState(linked?.programId ?? managed[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [recipients, setRecipients] = useState<string[]>([])
  const [due, setDue] = useState(format(addDays(parseISO(todayManila()), 5), 'yyyy-MM-dd'))
  const [priority, setPriority] = useState<DirectivePriority>('normal')

  const valid = programId && title.trim().length >= 3 && body.trim() && recipients.length > 0

  const submit = async () => {
    try {
      const id = await issue.mutateAsync({
        programId,
        title,
        body,
        recipients,
        responseDue: due || null,
        priority,
        entityType: linked?.type ?? null,
        entityId: linked?.id ?? null,
      })
      toast.success(
        `Directive sent to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}`,
      )
      onClose()
      navigate(`/directives/${id}`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New directive</DialogTitle>
          <DialogDescription>
            {linked
              ? `About ${linked.label}. Recipients are notified and asked to acknowledge and respond.`
              : 'Recipients are notified and asked to acknowledge and respond.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {!linked && managed.length > 1 && (
            <FormField id="dir-program" label="Program *">
              <SelectNative
                id="dir-program"
                value={programId}
                onChange={(e) => {
                  setProgramId(e.target.value)
                  setRecipients([])
                }}
              >
                {managed.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </SelectNative>
            </FormField>
          )}
          <FormField id="dir-title" label="Subject *">
            <Input
              id="dir-title"
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Submit Q3 physical accomplishment report"
            />
          </FormField>
          <FormField id="dir-body" label="Instructions *">
            <Textarea
              id="dir-body"
              rows={5}
              maxLength={5000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="dir-due"
              label="Respond by"
              hint="Reminders and escalation use this date."
            >
              <Input
                id="dir-due"
                type="date"
                min={todayManila()}
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </FormField>
            <FormField id="dir-priority" label="Priority">
              <SelectNative
                id="dir-priority"
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
            <RecipientPicker
              people={programId ? membersOf(programId) : []}
              value={recipients}
              onChange={setRecipients}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || issue.isPending} onClick={() => void submit()}>
            {issue.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send
            directive
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
