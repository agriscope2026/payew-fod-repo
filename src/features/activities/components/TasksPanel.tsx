import { FileTextIcon, Loader2Icon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { formatDate } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { ActivityTaskRow, StageProgressRow } from '@/types/database'
import { useTaskMutations } from '../api'

/** Checklist grouped by stage. Document items tick themselves when a matching file is attached. */
export function TasksPanel({
  activityId,
  tasks,
  stages,
  canEdit,
  members,
  personName,
}: {
  activityId: string
  tasks: ActivityTaskRow[]
  stages: StageProgressRow[]
  canEdit: boolean
  members: { id: string; full_name: string }[]
  personName: (id: string | null) => string
}) {
  const { add, toggle, remove } = useTaskMutations(activityId)
  const [title, setTitle] = useState('')
  const [stageId, setStageId] = useState('')
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState('')
  const [required, setRequired] = useState(false)

  const stageById = new Map(stages.map((s) => [s.id, s]))
  const order = (s: StageProgressRow | undefined) =>
    s
      ? s.parent_id
        ? (stageById.get(s.parent_id)?.sort_order ?? 0) * 100 + s.sort_order
        : s.sort_order * 100
      : 99_999
  const groups = new Map<string, ActivityTaskRow[]>()
  for (const t of [...tasks].sort(
    (a, b) =>
      order(stageById.get(a.stage_progress_id ?? '')) -
      order(stageById.get(b.stage_progress_id ?? '')),
  )) {
    const key = t.stage_progress_id ?? 'general'
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  const open = tasks.filter((t) => !t.is_done).length

  const submit = async () => {
    try {
      await add.mutateAsync({
        title: title.trim(),
        stage_progress_id: stageId || null,
        is_required: required,
        due_date: due || null,
        assigned_to: assignee || null,
      })
      setTitle('')
      setDue('')
      setRequired(false)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {open} of {tasks.length} item{tasks.length === 1 ? '' : 's'} open. Required items must be
        done before their stage can be completed.
      </p>

      {canEdit && (
        <div className="bg-muted/30 flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <Input
            aria-label="New checklist item"
            placeholder="Add a checklist item…"
            className="min-w-56 flex-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && title.trim() && void submit()}
          />
          <SelectNative
            aria-label="Stage"
            className="w-48"
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
          >
            <option value="">General</option>
            {stages
              .filter((s) => !s.parent_id)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </SelectNative>
          <SelectNative
            aria-label="Assignee"
            className="w-40"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </SelectNative>
          <Input
            aria-label="Due date"
            type="date"
            className="w-40"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <label className="flex h-9 items-center gap-2 text-sm">
            <Checkbox checked={required} onCheckedChange={(c) => setRequired(!!c)} /> Required
          </label>
          <Button disabled={!title.trim() || add.isPending} onClick={() => void submit()}>
            {add.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Add
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {[...groups.entries()].map(([key, items]) => {
          const stage = stageById.get(key)
          return (
            <section key={key}>
              <h3 className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                {stage
                  ? stage.parent_id
                    ? `${stageById.get(stage.parent_id)?.name} › ${stage.name}`
                    : stage.name
                  : 'General'}
              </h3>
              <ul className="divide-y rounded-lg border">
                {items.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox
                      checked={t.is_done}
                      disabled={!canEdit || toggle.isPending}
                      onCheckedChange={(c) =>
                        toggle.mutate(
                          { id: t.id, done: !!c },
                          { onError: (e) => toast.error(errorMessage(e)) },
                        )
                      }
                      aria-label={t.title}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn('text-sm', t.is_done && 'text-muted-foreground line-through')}
                      >
                        {t.doc_type_code && (
                          <FileTextIcon className="text-muted-foreground mr-1 inline size-3.5 align-[-2px]" />
                        )}
                        {t.title}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {[
                          t.assigned_to && personName(t.assigned_to),
                          t.due_date && `Due ${formatDate(t.due_date)}`,
                          t.is_done && t.done_by && `Done by ${personName(t.done_by)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    {t.is_required && <Badge variant="outline">Required</Badge>}
                    {canEdit && !t.is_auto && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive size-8"
                        aria-label={`Delete ${t.title}`}
                        onClick={() =>
                          remove.mutate(t.id, { onError: (e) => toast.error(errorMessage(e)) })
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
