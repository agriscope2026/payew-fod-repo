import {
  LockIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  StickyNoteIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { formatDateTime, formatRelative } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { NoteRow, NoteVisibility } from '@/types/database'
import { useNoteMutations, useNotes } from '../api'

/** Private notes (only you) and notes shared with the program, pinned first. */
export function NotesPanel({
  entityType,
  entityId,
  personName,
  canModerate = false,
  sharedLabel = 'Program',
}: {
  entityType: NoteRow['entity_type']
  entityId: string
  personName: (id: string | null) => string
  canModerate?: boolean
  /** Who can read a shared note ("Program" for activities, "Everyone" for the registry). */
  sharedLabel?: string
}) {
  const { user } = useAuth()
  const { data: notes = [], isPending } = useNotes(entityType, entityId)
  const { save, pin, remove } = useNoteMutations(entityType, entityId)
  const [draft, setDraft] = useState<{
    id?: string
    body: string
    visibility: NoteVisibility
  } | null>(null)

  const submit = async () => {
    if (!draft?.body.trim()) return
    try {
      await save.mutateAsync(draft)
      setDraft(null)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-3">
      {draft ? (
        <div className="space-y-2 rounded-md border p-2">
          <Textarea
            rows={3}
            autoFocus
            aria-label="Note"
            placeholder="Contacts, reminders, context for the team…"
            maxLength={5000}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && void submit()}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="bg-muted inline-flex rounded-md p-0.5"
              role="group"
              aria-label="Who can see it"
            >
              {(
                [
                  ['private', 'Only me', LockIcon],
                  ['program', sharedLabel, UsersIcon],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={draft.visibility === value}
                  onClick={() => setDraft({ ...draft, visibility: value })}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-2 py-1 text-xs',
                    draft.visibility === value
                      ? 'bg-background shadow-sm'
                      : 'text-muted-foreground',
                  )}
                >
                  <Icon className="size-3" /> {label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!draft.body.trim() || save.isPending}
                onClick={() => void submit()}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDraft({ body: '', visibility: 'private' })}
        >
          <PlusIcon /> Add note
        </Button>
      )}

      {isPending ? null : notes.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <StickyNoteIcon className="size-4" /> No notes yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => {
            const mine = n.author_id === user?.id
            return (
              <li
                key={n.id}
                className={cn(
                  'rounded-md border p-3 text-sm',
                  n.is_pinned && 'border-gold/60 bg-gold/10',
                )}
              >
                <p className="break-words whitespace-pre-line">{n.body}</p>
                <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  {n.visibility === 'private' ? (
                    <span className="inline-flex items-center gap-1">
                      <LockIcon className="size-3" /> Only you
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <UsersIcon className="size-3" /> {mine ? 'You' : personName(n.author_id)}
                    </span>
                  )}
                  <time dateTime={n.updated_at} title={formatDateTime(n.updated_at)}>
                    {formatRelative(n.updated_at)}
                  </time>
                  <span className="ml-auto flex">
                    {mine && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={n.is_pinned ? 'Unpin' : 'Pin'}
                          onClick={() =>
                            pin
                              .mutateAsync({ id: n.id, pinned: !n.is_pinned })
                              .catch((e) => toast.error(errorMessage(e)))
                          }
                        >
                          {n.is_pinned ? <PinOffIcon /> : <PinIcon />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label="Edit note"
                          onClick={() =>
                            setDraft({ id: n.id, body: n.body, visibility: n.visibility })
                          }
                        >
                          <PencilIcon />
                        </Button>
                      </>
                    )}
                    {(mine || (canModerate && n.visibility === 'program')) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label="Delete note"
                        onClick={() =>
                          remove
                            .mutateAsync(n.id)
                            .then(() => toast.success('Note deleted'))
                            .catch((e) => toast.error(errorMessage(e)))
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
