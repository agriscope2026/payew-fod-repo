import {
  BellOffIcon,
  CheckCheckIcon,
  Loader2Icon,
  PlayIcon,
  SlidersHorizontalIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/features/auth/auth-context'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  MUTABLE_TYPES,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useRunSweep,
  useSaveNotificationPrefs,
  useUnreadCount,
} from '../api'
import { NotificationItem } from '../components/NotificationItem'

const TYPES = [
  ['', 'All types'],
  ['comment', 'Comments'],
  ['mention', 'Mentions'],
  ['directive', 'Directives'],
  ['directive_due', 'Response due'],
  ['overdue', 'Overdue activities'],
  ['escalation', 'Escalations'],
  ['assignment', 'Assignments'],
  ['stage', 'Stage moves'],
  ['stage_due', 'Stage deadlines'],
  ['task_due', 'Checklist deadlines'],
  ['supplier_doc', 'Supplier papers'],
  ['delivery', 'Deliveries'],
  ['payment', 'Payments pending'],
  ['issue', 'Issues & risks'],
  ['progress', 'Progress updates due'],
  ['approval', 'Approvals'],
  ['announcement', 'Announcements'],
  ['system', 'System'],
] as const

export default function NotificationsPage() {
  const { programs } = useWorkspace()
  const { isSuperadmin } = useAuth()
  const [prefsOpen, setPrefsOpen] = useState(false)
  const sweep = useRunSweep()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [type, setType] = useState('')
  const [programId, setProgramId] = useState('')
  const { data, isPending, isError, refetch } = useNotifications({
    unreadOnly,
    type: type || undefined,
    programId: programId || undefined,
    limit: 200,
  })
  const { data: unread = 0 } = useUnreadCount()
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={`${unread} unread`}
        actions={
          <>
            {isSuperadmin && (
              <Button
                variant="outline"
                title="Reminders and escalations normally run daily at 7:00 AM"
                disabled={sweep.isPending}
                onClick={() =>
                  sweep
                    .mutateAsync()
                    .then((r) => {
                      const sent = Object.entries(r)
                        .filter(([k]) => k !== 'date')
                        .reduce((sum, [, v]) => sum + Number(v), 0)
                      toast.success(`Reminder sweep done: ${sent} notification(s) sent`)
                    })
                    .catch((e) => toast.error(errorMessage(e)))
                }
              >
                {sweep.isPending ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
                Run reminders now
              </Button>
            )}
            <Button variant="outline" onClick={() => setPrefsOpen(true)}>
              <SlidersHorizontalIcon /> Preferences
            </Button>
            <Button
              variant="outline"
              disabled={!unread || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheckIcon /> Mark all read
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="bg-card inline-flex rounded-md border p-0.5"
          role="group"
          aria-label="Read state"
        >
          {[
            [false, 'All'],
            [true, 'Unread'],
          ].map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={unreadOnly === value}
              onClick={() => setUnreadOnly(value as boolean)}
              className={cn(
                'rounded px-3 py-1 text-sm',
                unreadOnly === value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {label as string}
            </button>
          ))}
        </div>
        <SelectNative
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Type"
          className="w-44"
        >
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectNative>
        {programs.length > 1 && (
          <SelectNative
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            aria-label="Program"
            className="w-44"
          >
            <option value="">All programs</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </SelectNative>
        )}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : isPending ? (
          <div className="space-y-4 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={BellOffIcon}
            title="No notifications"
            description="Nothing matches these filters."
          />
        ) : (
          <div className="divide-y">
            {data.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onOpen={(item) => !item.is_read && markRead.mutate([item.id])}
              />
            ))}
          </div>
        )}
      </Card>
      {prefsOpen && <PreferencesDialog onClose={() => setPrefsOpen(false)} />}
    </div>
  )
}

function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth()
  const save = useSaveNotificationPrefs()
  const prefs = profile?.notification_prefs
  const initial =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs) && Array.isArray(prefs.muted)
      ? prefs.muted.filter((x): x is string => typeof x === 'string')
      : []
  const [muted, setMuted] = useState<string[]>(initial)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notification preferences</DialogTitle>
          <DialogDescription>
            Directives, overdue notices, escalations and system announcements always arrive.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-md border">
          {MUTABLE_TYPES.map(([type, label]) => (
            <li key={type} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <label htmlFor={`pref-${type}`} className="text-sm">
                {label}
              </label>
              <Switch
                id={`pref-${type}`}
                checked={!muted.includes(type)}
                onCheckedChange={(on) =>
                  setMuted(on ? muted.filter((m) => m !== type) : [...muted, type])
                }
              />
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() =>
              save
                .mutateAsync(muted)
                .then(() => {
                  toast.success('Preferences saved')
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
