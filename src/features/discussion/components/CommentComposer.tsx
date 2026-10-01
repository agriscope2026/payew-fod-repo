import { Loader2Icon, SendHorizontalIcon } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  activeMention,
  extractMentions,
  initials,
  insertMention,
  matchPeople,
  type Mentionable,
} from '../mentions'

/**
 * Textarea with "@" autocomplete. Type @ and part of a name, pick with ↑/↓ and
 * Enter (or click). Ctrl/⌘+Enter sends.
 */
export function CommentComposer({
  people,
  initialBody = '',
  placeholder = 'Write a comment… Type @ to mention someone.',
  submitLabel = 'Comment',
  busy,
  autoFocus,
  onSubmit,
  onCancel,
  footer,
}: {
  people: Mentionable[]
  initialBody?: string
  placeholder?: string
  submitLabel?: string
  busy?: boolean
  autoFocus?: boolean
  onSubmit: (body: string, mentions: string[]) => Promise<unknown>
  onCancel?: () => void
  /** Extra controls shown left of the buttons (e.g. a visibility picker). */
  footer?: ReactNode
}) {
  const listId = useId()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [body, setBody] = useState(initialBody)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [highlight, setHighlight] = useState(0)

  const options = mention ? matchPeople(people, mention.query) : []
  const open = options.length > 0

  const refresh = (text: string, caret: number) => {
    setMention(activeMention(text, caret))
    setHighlight(0)
  }

  const pick = (person: Mentionable) => {
    const el = ref.current
    if (!el || !mention) return
    const next = insertMention(body, mention.start, el.selectionStart, person.full_name)
    setBody(next.text)
    setMention(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.caret, next.caret)
    })
  }

  const submit = async () => {
    if (!body.trim() || busy) return
    try {
      await onSubmit(body, extractMentions(body, people))
      setBody('')
      setMention(null)
    } catch {
      // the caller shows the error; keep the draft
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={ref}
          rows={3}
          value={body}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          maxLength={5000}
          onChange={(e) => {
            setBody(e.target.value)
            refresh(e.target.value, e.target.selectionStart)
          }}
          onClick={(e) => refresh(body, e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (open) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const step = e.key === 'ArrowDown' ? 1 : -1
                setHighlight((h) => (h + step + options.length) % options.length)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                pick(options[highlight])
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setMention(null)
                return
              }
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              void submit()
            }
            if (e.key === 'Escape' && onCancel) onCancel()
          }}
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Mention someone"
            className="bg-popover absolute top-full left-0 z-20 mt-1 w-64 overflow-hidden rounded-md border p-1 shadow-md"
          >
            {options.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === highlight}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm',
                  i === highlight && 'bg-accent',
                )}
                onMouseDown={(e) => {
                  e.preventDefault() // keep focus in the textarea
                  pick(p)
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-full text-[10px] font-semibold">
                  {initials(p.full_name)}
                </span>
                {p.full_name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {footer ?? (
          <span className="text-muted-foreground hidden text-xs sm:inline">
            Ctrl+Enter to send · @ to mention
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={!body.trim() || busy}
            onClick={() => void submit()}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <SendHorizontalIcon />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
