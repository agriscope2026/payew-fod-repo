import { differenceInCalendarDays, parseISO } from 'date-fns'
import { todayManila } from '@/lib/format'
import type { StageProgressRow } from '@/types/database'

/** Days late: finished after the plan, or still open past the planned end. */
export function stageLateness(s: StageProgressRow, today = todayManila()) {
  if (!s.planned_end) return 0
  const end = s.status === 'completed' || s.status === 'skipped' ? s.actual_end : today
  if (!end || s.status === 'skipped') return 0
  return Math.max(0, differenceInCalendarDays(parseISO(end), parseISO(s.planned_end)))
}

/** Required fields still empty on a record (mirrors activity/package_missing_fields in SQL). */
export function recordMissingFields(
  record: Record<string, unknown>,
  fields: string[],
  extra: { beneficiariesCount?: number } = {},
) {
  return fields.filter((f) => {
    if (f === 'beneficiaries') return (extra.beneficiariesCount ?? 0) === 0
    const v = record[f]
    return v === null || v === undefined || String(v).trim() === ''
  })
}
