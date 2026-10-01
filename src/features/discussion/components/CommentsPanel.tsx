import {
  LockIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ReplyIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { ConfirmDialog, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SelectNative } from '@/components/ui/select-native'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { formatDateTime, formatRelative } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { CommentEntity, CommentRow, CommentVisibility } from '@/types/database'
import { useCommentMutations, useComments, useCommentsRealtime } from '../api'
import { initials, segmentMentions, type Mentionable } from '../mentions'
import { CommentComposer } from './CommentComposer'

/**
 * Discussion thread for one record. Replies are one level deep. `people` are the
 * users who can see the record (offered for @mentions); `canModerate` lets program
 * admins remove other people's comments.
 */
export function CommentsPanel({
  entityType,
  entityId,
  people,
  personName,
  canModerate = false,
  canComment = true,
}: {
  entityType: CommentEntity
  entityId: string
  people: Mentionable[]
  personName: (id: string | null) => string
  canModerate?: boolean
  canComment?: boolean
}) {
  const { user, isSuperadmin } = useAuth()
  const [visibility, setVisibility] = useState<CommentVisibility>('program')
  const visibilityOptions: [CommentVisibility, string][] = [
    ['program', 'Everyone who can see this'],
    ...(canModerate ? [['admins', 'Admins only'] as [CommentVisibility, string]] : []),
    ...(isSuperadmin ? [['superadmin', 'Superadmin only'] as [CommentVisibility, string]] : []),
  ]
  const { data: comments = [], isPending } = useComments(entityType, entityId)
  const { add, edit, remove } = useCommentMutations(entityType, entityId)
  useCommentsRealtime(entityType, entityId)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const anchor = useAnchoredComment(comments.length > 0)

  const others = people.filter((p) => p.id !== user?.id)
  const roots = comments.filter((c) => !c.parent_id)
  // Replies whose root was deleted still show, under a placeholder.
  const rootIds = new Set(roots.map((c) => c.id))
  const orphanRoots = [
    ...new Set(
      comments.filter((c) => c.parent_id && !rootIds.has(c.parent_id)).map((c) => c.parent_id!),
    ),
  ]
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id)

  const send = (body: string, mentions: string[], parentId?: string) =>
    add
      .mutateAsync({ body, mentions, parentId, visibility: parentId ? undefined : visibility })
      .catch((err) => {
        toast.error(errorMessage(err))
        throw err
      })

  const renderComment = (c: CommentRow, isReply: boolean) => {
    const mine = c.author_id === user?.id
    const name = personName(c.author_id) || 'Former user'
    return (
      <article
        key={c.id}
        id={`comment-${c.id}`}
        className={cn(
          'flex scroll-mt-24 gap-3 rounded-md p-2 transition-colors',
          anchor === c.id && 'bg-primary/5 ring-primary/40 ring-2',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'bg-primary/10 text-primary flex shrink-0 items-center justify-center rounded-full font-semibold',
            isReply ? 'size-7 text-[10px]' : 'size-8 text-xs',
          )}
        >
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium">{name}</span>
            <time
              dateTime={c.created_at}
              title={formatDateTime(c.created_at)}
              className="text-muted-foreground text-xs"
            >
              {formatRelative(c.created_at)}
            </time>
            {c.visibility !== 'program' && (
              <span className="bg-gold/20 inline-flex items-center gap-1 rounded px-1.5 text-[11px] font-medium">
                <LockIcon className="size-3" />
                {c.visibility === 'admins' ? 'Admins only' : 'Superadmin only'}
              </span>
            )}
            {c.edited_at && (
              <span className="text-muted-foreground text-xs" title={formatDateTime(c.edited_at)}>
                (edited)
              </span>
            )}
            {(mine || canModerate) && editing !== c.id && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-7"
                    aria-label="Comment actions"
                  >
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {mine && (
                    <DropdownMenuItem onSelect={() => setEditing(c.id)}>
                      <PencilIcon /> Edit
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() =>
                      setConfirm({
                        title: 'Delete this comment?',
                        description: mine
                          ? 'It is removed from the discussion.'
                          : `You are removing ${name}'s comment as a program admin.`,
                        confirmLabel: 'Delete',
                        destructive: true,
                        onConfirm: () =>
                          remove
                            .mutateAsync(c.id)
                            .then(() => toast.success('Comment deleted'))
                            .catch((e) => toast.error(errorMessage(e))),
                      })
                    }
                  >
                    <Trash2Icon /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {editing === c.id ? (
            <div className="mt-1">
              <CommentComposer
                people={others}
                initialBody={c.body}
                submitLabel="Save"
                autoFocus
                busy={edit.isPending}
                onCancel={() => setEditing(null)}
                onSubmit={(body, mentions) =>
                  edit
                    .mutateAsync({ id: c.id, body, mentions })
                    .then(() => setEditing(null))
                    .catch((err) => {
                      toast.error(errorMessage(err))
                      throw err
                    })
                }
              />
            </div>
          ) : (
            <CommentBody body={c.body} names={c.mentions.map((id) => personName(id))} />
          )}
          {!isReply && canComment && editing !== c.id && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground -ml-2 h-7"
              onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
            >
              <ReplyIcon /> Reply
            </Button>
          )}
        </div>
      </article>
    )
  }

  const renderThread = (rootId: string, root: CommentRow | null) => {
    const replies = repliesOf(rootId)
    return (
      <li key={rootId} className="py-2">
        {root ? (
          renderComment(root, false)
        ) : (
          <p className="text-muted-foreground px-2 py-1 text-xs italic">Comment deleted</p>
        )}
        {(replies.length > 0 || replyTo === rootId) && (
          <div className="border-muted ml-6 space-y-1 border-l-2 pl-3 sm:ml-10">
            {replies.map((r) => renderComment(r, true))}
            {replyTo === rootId && (
              <div className="py-1">
                <CommentComposer
                  people={others}
                  placeholder="Write a reply…"
                  submitLabel="Reply"
                  autoFocus
                  busy={add.isPending}
                  onCancel={() => setReplyTo(null)}
                  onSubmit={(body, mentions) =>
                    send(body, mentions, rootId).then(() => setReplyTo(null))
                  }
                />
              </div>
            )}
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-4">
      {canComment && (
        <CommentComposer
          people={others}
          busy={add.isPending && !replyTo}
          onSubmit={(body, mentions) => send(body, mentions)}
          footer={
            visibilityOptions.length > 1 ? (
              <SelectNative
                aria-label="Who can see this comment"
                className="h-8 w-52 text-xs"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as CommentVisibility)}
              >
                {visibilityOptions.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </SelectNative>
            ) : undefined
          }
        />
      )}
      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : comments.length === 0 ? (
        <EmptyState
          icon={MessageSquareIcon}
          title="No comments yet"
          description="Start the discussion. Mentioned people are notified."
        />
      ) : (
        <ul className="divide-y">
          {[
            ...roots.map((r) => ({ id: r.id, root: r as CommentRow | null, at: r.created_at })),
            ...orphanRoots.map((id) => ({ id, root: null, at: repliesOf(id)[0].created_at })),
          ]
            .sort((a, b) => b.at.localeCompare(a.at))
            .map((t) => renderThread(t.id, t.root))}
        </ul>
      )}
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

function CommentBody({ body, names }: { body: string; names: string[] }) {
  return (
    <p className="text-sm break-words whitespace-pre-line">
      {segmentMentions(body, names).map((s, i) =>
        s.mention ? (
          <span key={i} className="bg-primary/10 text-primary rounded px-0.5 font-medium">
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  )
}

/** Scrolls to #comment-<id> from a notification link once comments are loaded. */
function useAnchoredComment(ready: boolean) {
  const { hash } = useLocation()
  const id = hash.startsWith('#comment-') ? hash.slice('#comment-'.length) : null
  useEffect(() => {
    if (!ready || !id) return
    document
      .getElementById(`comment-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [ready, id])
  return id
}
