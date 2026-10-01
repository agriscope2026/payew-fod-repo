import { HistoryIcon } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { FIELD_LABEL } from '@/features/workflows/constants'
import { formatDateTime } from '@/lib/format'
import type { HistoryEntry, StageTransitionRow } from '@/types/database'

const TABLE_LABEL: Record<string, string> = {
  activities: 'Activity',
  activity_stage_progress: 'Stage',
  activity_tasks: 'Checklist item',
  activity_beneficiaries: 'Beneficiary link',
  procurement_packages: 'Package',
}

const IGNORED = new Set([
  'updated_at',
  'current_stage_id',
  'completed_by',
  'completed_at',
  'done_by',
  'done_at',
])

function describe(e: HistoryEntry) {
  const data = (e.new_data ?? e.old_data ?? {}) as Record<string, unknown>
  const what = TABLE_LABEL[e.table_name] ?? e.table_name
  const label = String(data.title ?? data.name ?? '')
  if (e.action === 'INSERT') return `${what} added${label ? `: ${label}` : ''}`
  if (e.action === 'DELETE') return `${what} removed${label ? `: ${label}` : ''}`
  if (e.action === 'SOFT_DELETE') return `${what} moved to Trash`
  if (e.action === 'RESTORE') return `${what} restored from Trash`
  const fields = (e.changed_fields ?? []).filter((f) => !IGNORED.has(f))
  if (e.table_name === 'activity_tasks' && fields.includes('is_done')) {
    return `${(e.new_data as Record<string, unknown>)?.is_done ? 'Checked' : 'Unchecked'}: ${label}`
  }
  if (!fields.length) return null
  return `${what}${label ? ` "${label}"` : ''} updated: ${fields.map((f) => FIELD_LABEL[f] ?? f.replace(/_/g, ' ')).join(', ')}`
}

const TRANSITION_LABEL: Record<StageTransitionRow['action'], string> = {
  start: 'Started',
  complete: 'Completed',
  skip: 'Skipped',
  reopen: 'Moved back to',
  migrate: 'Changed workflow',
  cancel: 'Cancelled',
  uncancel: 'Restored',
  award: 'Awarded',
  re_award: 'Re-awarded',
  contract_change: 'Changed contract',
  split: 'Split',
  merge: 'Merged',
  reorder: 'Reordered stages',
}

/** Package events carry their own description in the note. */
const SELF_DESCRIBING = new Set<StageTransitionRow['action']>([
  'migrate',
  'cancel',
  'uncancel',
  'award',
  're_award',
  'contract_change',
  'split',
  'merge',
  'reorder',
])

export function TransitionLog({
  transitions,
  personName,
}: {
  transitions: StageTransitionRow[]
  personName: (id: string | null) => string
}) {
  if (!transitions.length)
    return <p className="text-muted-foreground text-sm">No stage moves yet.</p>
  return (
    <ol className="space-y-2">
      {transitions.map((t) => (
        <li key={t.id} className="text-sm">
          <span className="font-medium">{TRANSITION_LABEL[t.action]}</span>{' '}
          {!SELF_DESCRIBING.has(t.action) && t.stage_name}
          <span className="text-muted-foreground block text-xs">
            {formatDateTime(t.created_at)} · {personName(t.created_by) || 'System'}
            {t.note && ` · “${t.note}”`}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function HistoryPanel({
  entries,
  loading,
  personName,
}: {
  entries: HistoryEntry[] | undefined
  loading: boolean
  personName: (id: string | null) => string
}) {
  if (loading) return <Skeleton className="h-40" />
  const rows = (entries ?? []).map((e) => ({ e, text: describe(e) })).filter((r) => r.text)
  if (!rows.length) return <EmptyState icon={HistoryIcon} title="No changes recorded yet" />
  return (
    <ol className="divide-y rounded-lg border">
      {rows.map(({ e, text }, i) => (
        <li key={i} className="px-3 py-2 text-sm">
          {text}
          <span className="text-muted-foreground block text-xs">
            {formatDateTime(e.occurred_at)} · {personName(e.actor_id) || 'System'}
          </span>
        </li>
      ))}
    </ol>
  )
}
