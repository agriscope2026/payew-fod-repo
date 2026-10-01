import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import {
  AlarmClockIcon,
  CheckCircle2Icon,
  GavelIcon,
  InboxIcon,
  ListChecksIcon,
  ScrollTextIcon,
  ShieldAlertIcon,
  WorkflowIcon,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ProgramChip } from '@/components/common/Badges'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { TYPE_META } from '@/features/approvals/meta'
import { useWorkspace } from '@/features/workspace/workspace-context'
import { formatDate, todayManila } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { ApprovalType, WorkItem, WorkItemKind } from '@/types/database'
import { useCompleteTask, useMyWorkItems, workItemHref } from './api'

const KIND: Record<WorkItemKind, { label: string; plural: string; icon: LucideIcon }> = {
  stage: { label: 'Workflow stage', plural: 'Stages', icon: WorkflowIcon },
  task: { label: 'Checklist task', plural: 'Tasks', icon: ListChecksIcon },
  directive: { label: 'Directive', plural: 'Directives', icon: ScrollTextIcon },
  approval: { label: 'Approval', plural: 'Approvals', icon: GavelIcon },
  issue: { label: 'Issue / risk', plural: 'Issues', icon: ShieldAlertIcon },
}
const KINDS = Object.keys(KIND) as WorkItemKind[]

type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'none'
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Due today' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'later', label: 'Later' },
  { key: 'none', label: 'No due date' },
]

function bucketOf(due: string | null, today: string): Bucket {
  if (!due) return 'none'
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  return due <= format(addDays(parseISO(today), 7), 'yyyy-MM-dd') ? 'week' : 'later'
}

/** /tasks — everything waiting on the signed-in user, by due date. */
export default function TasksPage() {
  const { programs, selectedProgramIds } = useWorkspace()
  const { data, isPending, isError, refetch } = useMyWorkItems()
  const [kind, setKind] = useState<WorkItemKind | 'all'>('all')
  const today = todayManila()

  const items = useMemo(
    () => (data ?? []).filter((i) => selectedProgramIds.includes(i.program_id)),
    [data, selectedProgramIds],
  )
  const shown = kind === 'all' ? items : items.filter((i) => i.kind === kind)
  const grouped = BUCKETS.map((b) => ({
    ...b,
    items: shown
      .filter((i) => bucketOf(i.due_date, today) === b.key)
      .sort(
        (a, b) =>
          (a.due_date ?? '').localeCompare(b.due_date ?? '') || a.title.localeCompare(b.title),
      ),
  })).filter((g) => g.items.length)
  const programById = new Map(programs.map((p) => [p.id, p]))

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Tasks"
        description="Workflow stages, checklist tasks, directives, approvals and issues waiting on you."
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
        <FilterChip active={kind === 'all'} onClick={() => setKind('all')} count={items.length}>
          All
        </FilterChip>
        {KINDS.map((k) => (
          <FilterChip
            key={k}
            active={kind === k}
            onClick={() => setKind(k)}
            count={items.filter((i) => i.kind === k).length}
            icon={KIND[k].icon}
          >
            {KIND[k].plural}
          </FilterChip>
        ))}
      </div>

      {isError ? (
        <Card>
          <ErrorState onRetry={() => void refetch()} />
        </Card>
      ) : isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : grouped.length === 0 ? (
        <Card>
          <EmptyState
            icon={kind === 'all' ? CheckCircle2Icon : InboxIcon}
            title={
              kind === 'all' ? "You're all caught up" : `No ${KIND[kind].plural.toLowerCase()}`
            }
            description="New assignments, directives and approval requests show up here."
          />
        </Card>
      ) : (
        grouped.map((g) => (
          <section key={g.key} className="space-y-2">
            <h2
              className={cn(
                'flex items-center gap-2 text-sm font-semibold',
                g.key === 'overdue' && 'text-destructive',
              )}
            >
              {g.key === 'overdue' && <AlarmClockIcon className="size-4" />}
              {g.label}
              <span className="text-muted-foreground font-normal tabular-nums">
                {g.items.length}
              </span>
            </h2>
            <Card className="py-0">
              <ul className="divide-y">
                {g.items.map((i) => (
                  <TaskRow
                    key={`${i.kind}-${i.item_id}`}
                    item={i}
                    today={today}
                    program={programById.get(i.program_id)}
                    showProgram={selectedProgramIds.length > 1}
                  />
                ))}
              </ul>
            </Card>
          </section>
        ))
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  count,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  icon?: LucideIcon
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card hover:bg-muted text-foreground',
      )}
    >
      {Icon && <Icon className="size-3.5" />}
      {children}
      <span className={cn('tabular-nums', active ? 'opacity-90' : 'text-muted-foreground')}>
        {count}
      </span>
    </button>
  )
}

function TaskRow({
  item: i,
  today,
  program,
  showProgram,
}: {
  item: WorkItem
  today: string
  program: { code: string; name: string; color: string } | undefined
  showProgram: boolean
}) {
  const complete = useCompleteTask()
  const meta = KIND[i.kind]
  const days = i.due_date ? differenceInCalendarDays(parseISO(i.due_date), parseISO(today)) : null
  const tag =
    i.kind === 'approval' && i.priority
      ? (TYPE_META[i.priority as ApprovalType]?.label ?? i.priority)
      : i.priority

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {i.kind === 'task' && i.can_complete ? (
        <Checkbox
          className="mt-1"
          aria-label={`Mark "${i.title}" done`}
          disabled={complete.isPending}
          onCheckedChange={() =>
            complete.mutate(i.item_id, {
              onSuccess: () => toast.success('Task done'),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        />
      ) : (
        <meta.icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <Link to={workItemHref(i)} className="group min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium group-hover:underline">{i.title}</span>
          {tag && (
            <Badge
              variant="outline"
              className={cn(
                'capitalize',
                ['critical', 'high', 'urgent'].includes(tag) &&
                  'border-destructive/40 text-destructive',
              )}
            >
              {tag}
            </Badge>
          )}
        </span>
        <span className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          <span>{meta.label}</span>
          {i.context && <span className="truncate">· {i.context}</span>}
          {showProgram && program && <ProgramChip program={program} />}
        </span>
      </Link>
      <span className="shrink-0 text-right text-xs">
        {i.due_date ? (
          <>
            <span className="block">{formatDate(i.due_date)}</span>
            <span
              className={cn(
                'tabular-nums',
                days! < 0 ? 'text-destructive font-medium' : 'text-muted-foreground',
              )}
            >
              {days! < 0
                ? `${-days!} day${days === -1 ? '' : 's'} late`
                : days === 0
                  ? 'today'
                  : `in ${days} day${days === 1 ? '' : 's'}`}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">No due date</span>
        )}
      </span>
    </li>
  )
}
