import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  Loader2Icon,
  MegaphoneIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  SearchXIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { FormField } from '@/components/common/FormField'
import { PageHeader } from '@/components/layout/PageHeader'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { canManageProgram } from '@/features/auth/permissions'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatDateTime, formatRelative, TIMEZONE } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { AnnouncementPriority, AnnouncementView } from '@/types/database'
import {
  useAnnouncement,
  useAnnouncementMutations,
  useAnnouncements,
  type AnnouncementInput,
} from './api'

const PRIORITY: Record<AnnouncementPriority, { label: string; className: string }> = {
  normal: { label: 'Normal', className: '' },
  important: {
    label: 'Important',
    className: 'border-[oklch(0.5_0.13_70)]/40 text-[oklch(0.5_0.13_70)] dark:text-warning',
  },
  urgent: { label: 'Urgent', className: 'border-destructive/40 text-destructive' },
}

/** ISO → value for <input type="datetime-local"> in Manila time. */
function toLocalInput(iso: string | null) {
  return iso ? format(new TZDate(new Date(iso), TIMEZONE), "yyyy-MM-dd'T'HH:mm") : ''
}
/** <input type="datetime-local"> value (Manila) → ISO. */
function fromLocalInput(v: string) {
  const [d, t] = v.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  return new TZDate(y, m - 1, day, h, mi, TIMEZONE).toISOString()
}

/** Who may post where: superadmin anywhere (incl. everyone); program admins their programs. */
function usePostTargets() {
  const { profile, programs } = useAuth()
  const ids = programs.map((p) => p.id)
  const targets = programs.filter((p) => canManageProgram(profile, ids, p.id))
  return { canPostAll: profile?.role === 'superadmin', targets }
}

/** /announcements, /announcements/:id */
export default function AnnouncementsModule() {
  return (
    <Routes>
      <Route index element={<AnnouncementsList />} />
      <Route path=":id" element={<AnnouncementDetail />} />
    </Routes>
  )
}

function AnnouncementsList() {
  const { selectedProgramIds } = useWorkspace()
  const { data, isPending, isError, refetch } = useAnnouncements(selectedProgramIds)
  const { canPostAll, targets } = usePostTargets()
  const [editing, setEditing] = useState<AnnouncementView | 'new' | null>(null)
  const [show, setShow] = useState<'live' | 'unread' | 'scheduled' | 'expired'>('live')
  const canPost = canPostAll || targets.length > 0

  const [now] = useState(Date.now)
  const rows = (data ?? []).filter((a) => {
    const scheduled = Date.parse(a.publish_at) > now
    const expired = !!a.expires_at && Date.parse(a.expires_at) <= now
    if (show === 'scheduled') return scheduled
    if (show === 'expired') return expired
    if (show === 'unread') return a.is_live && !a.is_read
    return !scheduled && !expired
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Memos and reminders from the FOD and your programs."
        actions={
          canPost && (
            <Button onClick={() => setEditing('new')}>
              <PlusIcon /> New announcement
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        {(
          [
            ['live', 'Current'],
            ['unread', 'Unread'],
            ...(canPost
              ? [
                  ['scheduled', 'Scheduled'],
                  ['expired', 'Expired'],
                ]
              : []),
          ] as [typeof show, string][]
        ).map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={show === k ? 'default' : 'outline'}
            aria-pressed={show === k}
            onClick={() => setShow(k)}
          >
            {label}
          </Button>
        ))}
      </div>

      {isError ? (
        <Card>
          <ErrorState onRetry={() => void refetch()} />
        </Card>
      ) : isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={MegaphoneIcon}
            title={show === 'unread' ? 'All read' : 'No announcements'}
            description={
              show === 'live' ? 'Memos and reminders from the FOD will appear here.' : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => (
            <Link key={a.id} to={a.id} className="group block">
              <Card
                className={cn(
                  'group-hover:border-primary/50 gap-2 py-4 transition-colors',
                  !a.is_read && a.is_live && 'border-l-primary border-l-4',
                )}
              >
                <CardContent className="space-y-1.5 px-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.pinned && <PinIcon className="text-primary size-4" aria-label="Pinned" />}
                    <h2
                      className={cn(
                        'font-semibold group-hover:underline',
                        !a.is_read && 'font-bold',
                      )}
                    >
                      {a.title}
                    </h2>
                    {a.priority !== 'normal' && (
                      <Badge variant="outline" className={PRIORITY[a.priority].className}>
                        {PRIORITY[a.priority].label}
                      </Badge>
                    )}
                    {!a.is_read && a.is_live && (
                      <Badge variant="secondary" className="text-[10px]">
                        New
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground line-clamp-2 text-sm whitespace-pre-line">
                    {a.body}
                  </p>
                  <Meta a={a} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {editing && (
        <AnnouncementDialog
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function Meta({ a }: { a: AnnouncementView }) {
  const [now] = useState(Date.now)
  const scheduled = Date.parse(a.publish_at) > now
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
      <span>{a.program_code ?? 'All programs'}</span>
      <span>·</span>
      <span>{a.author_name ?? 'FOD'}</span>
      <span>·</span>
      {scheduled ? (
        <span className="flex items-center gap-1">
          <CalendarClockIcon className="size-3" /> Scheduled {formatDateTime(a.publish_at)}
        </span>
      ) : (
        <span title={formatDateTime(a.publish_at)}>{formatRelative(a.publish_at)}</span>
      )}
      {a.expires_at && (
        <>
          <span>·</span>
          <span>until {formatDateTime(a.expires_at)}</span>
        </>
      )}
    </p>
  )
}

function AnnouncementDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: a, isPending, isError, refetch } = useAnnouncement(id)
  const { trash, markRead } = useAnnouncementMutations()
  const { canPostAll, targets } = usePostTargets()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  // Opening a live announcement marks it read.
  const shouldMark = !!a && a.is_live && !a.is_read
  useEffect(() => {
    if (shouldMark && id) markRead.mutate(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldMark, id])

  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (isPending) return <Skeleton className="h-64" />
  if (!a)
    return (
      <EmptyState
        icon={SearchXIcon}
        title="Announcement not found"
        description="It may have been removed or is not addressed to your programs."
        action={
          <Button asChild variant="outline">
            <Link to="/announcements">All announcements</Link>
          </Button>
        }
      />
    )

  const canEdit = a.program_id
    ? canPostAll || targets.some((t) => t.id === a.program_id)
    : canPostAll

  return (
    <div className="max-w-3xl space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/announcements">
          <ArrowLeftIcon /> All announcements
        </Link>
      </Button>
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-start gap-2">
            <h1 className="min-w-0 flex-1 text-xl font-semibold">{a.title}</h1>
            {a.priority !== 'normal' && (
              <Badge variant="outline" className={PRIORITY[a.priority].className}>
                {PRIORITY[a.priority].label}
              </Badge>
            )}
            {a.pinned && (
              <Badge variant="secondary">
                <PinIcon className="size-3" /> Pinned
              </Badge>
            )}
          </div>
          <Meta a={a} />
          <div className="text-sm leading-relaxed whitespace-pre-line">{a.body}</div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <span className="text-muted-foreground mr-auto text-xs">
                Read by {a.read_count} {a.read_count === 1 ? 'person' : 'people'}
              </span>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <PencilIcon /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() =>
                  setConfirm({
                    title: 'Move this announcement to Trash?',
                    description: 'Readers will no longer see it. You can restore it from Trash.',
                    confirmLabel: 'Move to Trash',
                    destructive: true,
                    onConfirm: async () => {
                      try {
                        await trash.mutateAsync(a.id)
                        toast.success('Moved to Trash')
                        navigate('/announcements')
                      } catch (err) {
                        toast.error(errorMessage(err))
                      }
                    },
                  })
                }
              >
                <Trash2Icon /> Delete
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {editing && <AnnouncementDialog initial={a} onClose={() => setEditing(false)} />}
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

function AnnouncementDialog({
  initial,
  onClose,
}: {
  initial: AnnouncementView | null
  onClose: () => void
}) {
  const { canPostAll, targets } = usePostTargets()
  const { save } = useAnnouncementMutations()
  const navigate = useNavigate()
  const defaultProgram = initial ? initial.program_id : canPostAll ? null : (targets[0]?.id ?? null)
  const [form, setForm] = useState({
    program_id: defaultProgram ?? '',
    title: initial?.title ?? '',
    body: initial?.body ?? '',
    priority: initial?.priority ?? ('normal' as AnnouncementPriority),
    pinned: initial?.pinned ?? false,
    publish_at: toLocalInput(initial?.publish_at ?? null),
    expires_at: toLocalInput(initial?.expires_at ?? null),
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const error = useMemo(() => {
    if (form.title.trim().length < 3) return 'Add a title (at least 3 characters).'
    if (!form.body.trim()) return 'Write the message.'
    if (!canPostAll && !form.program_id) return 'Choose a program.'
    if (form.expires_at && form.publish_at && form.expires_at <= form.publish_at)
      return 'The expiry must be after the publish time.'
    return null
  }, [form, canPostAll])

  const submit = async () => {
    const input: AnnouncementInput = {
      program_id: form.program_id || null,
      title: form.title.trim(),
      body: form.body.trim(),
      priority: form.priority,
      pinned: form.pinned,
      publish_at: form.publish_at ? fromLocalInput(form.publish_at) : new Date().toISOString(),
      expires_at: form.expires_at ? fromLocalInput(form.expires_at) : null,
    }
    try {
      const id = await save.mutateAsync({ id: initial?.id, input })
      toast.success(initial ? 'Announcement updated' : 'Announcement posted')
      onClose()
      if (!initial) navigate(`/announcements/${id}`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit announcement' : 'New announcement'}</DialogTitle>
          <DialogDescription>
            Readers are notified when it goes live. Leave the publish time empty to post now.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField id="an-program" label="Audience *">
            <SelectNative
              id="an-program"
              value={form.program_id}
              onChange={(e) => set('program_id', e.target.value)}
            >
              {canPostAll && <option value="">All programs</option>}
              {!canPostAll && !form.program_id && <option value="">Choose a program…</option>}
              {targets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </SelectNative>
          </FormField>
          <FormField id="an-title" label="Title *">
            <Input
              id="an-title"
              maxLength={200}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </FormField>
          <FormField id="an-body" label="Message *">
            <Textarea
              id="an-body"
              rows={8}
              maxLength={10000}
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="an-priority" label="Priority">
              <SelectNative
                id="an-priority"
                value={form.priority}
                onChange={(e) => set('priority', e.target.value as AnnouncementPriority)}
              >
                {(Object.keys(PRIORITY) as AnnouncementPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY[p].label}
                  </option>
                ))}
              </SelectNative>
            </FormField>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Switch checked={form.pinned} onCheckedChange={(v) => set('pinned', v)} />
              Pin to the top
            </label>
            <FormField id="an-publish" label="Publish at" hint="Manila time. Empty = now.">
              <Input
                id="an-publish"
                type="datetime-local"
                value={form.publish_at}
                onChange={(e) => set('publish_at', e.target.value)}
              />
            </FormField>
            <FormField id="an-expires" label="Expires at" hint="Optional.">
              <Input
                id="an-expires"
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => set('expires_at', e.target.value)}
              />
            </FormField>
          </div>
          {error && <p className="text-muted-foreground text-xs">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!!error || save.isPending} onClick={() => void submit()}>
            {save.isPending && <Loader2Icon className="animate-spin" />}
            {initial ? 'Save' : 'Post'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
