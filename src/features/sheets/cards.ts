// Dashboard cards: how they point at sheet cells, and their choices.
import type { CardAggregate, CardRange, DashboardCardRow } from '@/types/database'
import type { Range, Sheet } from './model'

export const AGGREGATES: { value: CardAggregate; label: string }[] = [
  { value: 'sum', label: 'Sum' },
  { value: 'average', label: 'Average' },
  { value: 'count', label: 'Count of filled cells' },
  { value: 'min', label: 'Smallest' },
  { value: 'max', label: 'Largest' },
  { value: 'value', label: 'Value of the first cell' },
]
export const CARD_FORMATS: { value: DashboardCardRow['number_format']; label: string }[] = [
  { value: 'peso', label: 'Peso' },
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Whole number' },
  { value: 'percent', label: 'Percent' },
]

/** Row and column ids for a range, so the card keeps pointing at the same cells. */
export const rangeToIds = (sheet: Sheet, r: Range): CardRange | null => {
  const a = sheet.rows[r.r1]
  const b = sheet.rows[r.r2]
  const c = sheet.cols[r.c1]
  const d = sheet.cols[r.c2]
  return a && b && c && d ? { r1: a.id, r2: b.id, c1: c.id, c2: d.id } : null
}

/** Current positions of a stored range; null when its rows or columns were deleted. */
export const idsToRange = (sheet: Sheet, ids: CardRange): Range | null => {
  const r1 = sheet.rows.findIndex((x) => x.id === ids.r1)
  const r2 = sheet.rows.findIndex((x) => x.id === ids.r2)
  const c1 = sheet.cols.findIndex((x) => x.id === ids.c1)
  const c2 = sheet.cols.findIndex((x) => x.id === ids.c2)
  if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return null
  return { r1: Math.min(r1, r2), r2: Math.max(r1, r2), c1: Math.min(c1, c2), c2: Math.max(c1, c2) }
}
