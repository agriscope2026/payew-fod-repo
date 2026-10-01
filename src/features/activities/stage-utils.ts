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
