// Pure helpers for the customizable dashboard. No React here, so it is unit-tested.

export const GRID_COLUMNS = 12
export const MAX_ROWS = 14

/** Built-in cards plus one "card:<id>" per sheet card. */
export type WidgetId = string

export interface WidgetDef {
  id: WidgetId
  title: string
  w: number
  h: number
}

// In the order of the default dashboard: money from the WFP, then where it goes
// (by phase and by activity), then physical progress and status.
export const BUILT_IN: WidgetDef[] = [
  // Totals of the WFP sheet; they fill in by themselves once a WFP is saved.
  { id: 'wfp_budget', title: 'WFP budget', w: 3, h: 2 },
  { id: 'wfp_obligated', title: 'Obligated', w: 3, h: 2 },
  { id: 'wfp_disbursed', title: 'Disbursed', w: 3, h: 2 },
  { id: 'wfp_balance', title: 'Unobligated balance', w: 3, h: 2 },
  { id: 'phase_budget', title: 'Budget, obligated and disbursed by phase', w: 8, h: 5 },
  { id: 'activity_status', title: 'Activities by status', w: 4, h: 5 },
  { id: 'physical_progress', title: 'Physical targets vs accomplishments', w: 7, h: 6 },
  { id: 'quarter_targets', title: 'Physical targets by quarter', w: 5, h: 6 },
  { id: 'top_activities', title: 'Largest activities: budget use', w: 12, h: 8 },
  { id: 'kpi_budget', title: 'Total budget for the year', w: 4, h: 2 },
  { id: 'attention', title: 'Needs attention', w: 4, h: 5 },
  { id: 'status', title: 'Status', w: 4, h: 5 },
  { id: 'funnel', title: 'Packages by stage', w: 4, h: 5 },
  { id: 'overdue', title: 'Overdue', w: 8, h: 6 },
  { id: 'deliveries', title: 'Pending deliveries', w: 4, h: 6 },
  { id: 'compliance', title: 'Compliance scorecard', w: 12, h: 6 },
]

/**
 * Panels that read the older records (packages, directives, stage dates). They stay
 * in the Cards list, switched off until someone turns them on.
 */
const OFF_BY_DEFAULT = new Set([
  'kpi_budget',
  'attention',
  'status',
  'funnel',
  'overdue',
  'deliveries',
  'compliance',
])
const fresh = ({ id, w, h }: WidgetDef): LayoutItem =>
  OFF_BY_DEFAULT.has(id) ? { id, w, h, hidden: true } : { id, w, h }

export const cardWidgetId = (cardId: string) => `card:${cardId}`
export const cardIdOf = (id: WidgetId) => (id.startsWith('card:') ? id.slice(5) : null)

/** All cards that can be shown; cards made from sheet cells follow the WFP totals. */
export function widgetCatalog(cards: { id: string; title: string }[] = []): WidgetDef[] {
  const at = BUILT_IN.findIndex((w) => w.id === 'wfp_balance') + 1
  return [
    ...BUILT_IN.slice(0, at),
    ...cards.map((c) => ({ id: cardWidgetId(c.id), title: c.title, w: 3, h: 2 })),
    ...BUILT_IN.slice(at),
  ]
}

export interface LayoutItem {
  id: WidgetId
  w: number
  h: number
  hidden?: boolean
}

export const defaultLayout = (catalog: WidgetDef[]): LayoutItem[] => catalog.map(fresh)

export const DEFAULT_LAYOUT = defaultLayout(widgetCatalog())

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)))

/**
 * Cleans a stored layout: drops unknown or repeated cards, limits sizes, and adds
 * cards introduced since it was saved, each after the card that comes before it.
 */
export function normalizeLayout(
  saved: unknown,
  catalog: WidgetDef[] = widgetCatalog(),
): LayoutItem[] {
  if (!Array.isArray(saved) || saved.length === 0) return defaultLayout(catalog)
  const known = new Map(catalog.map((w) => [w.id, w]))
  const seen = new Set<string>()
  const out: LayoutItem[] = []
  for (const raw of saved as Partial<LayoutItem>[]) {
    const widget = known.get(String(raw?.id))
    if (!widget || seen.has(widget.id)) continue
    seen.add(widget.id)
    out.push({
      id: widget.id,
      w: clamp(Number(raw.w) || widget.w, 2, GRID_COLUMNS),
      h: clamp(Number(raw.h) || widget.h, 2, MAX_ROWS),
      ...(raw.hidden ? { hidden: true } : {}),
    })
  }
  catalog.forEach((widget, i) => {
    if (seen.has(widget.id)) return
    const before = catalog
      .slice(0, i)
      .reverse()
      .find((w) => seen.has(w.id))
    const at = before ? out.findIndex((x) => x.id === before.id) + 1 : 0
    out.splice(at, 0, fresh(widget))
    seen.add(widget.id)
  })
  return out
}

/** Moves a card to where another card is. */
export function moveWidget(layout: LayoutItem[], id: WidgetId, overId: WidgetId) {
  const from = layout.findIndex((x) => x.id === id)
  const to = layout.findIndex((x) => x.id === overId)
  if (from < 0 || to < 0 || from === to) return layout
  const next = layout.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Moves a card one place among the visible cards. */
export function shiftWidget(layout: LayoutItem[], id: WidgetId, direction: -1 | 1) {
  const visible = layout.filter((x) => !x.hidden)
  const index = visible.findIndex((x) => x.id === id)
  const neighbor = visible[index + direction]
  return neighbor ? moveWidget(layout, id, neighbor.id) : layout
}

export function resizeWidget(layout: LayoutItem[], id: WidgetId, w: number, h: number) {
  return layout.map((x) =>
    x.id === id ? { ...x, w: clamp(w, 2, GRID_COLUMNS), h: clamp(h, 2, MAX_ROWS) } : x,
  )
}

export function toggleWidget(layout: LayoutItem[], id: WidgetId, visible: boolean) {
  return layout.map((x) => {
    if (x.id !== id) return x
    if (visible) return { id: x.id, w: x.w, h: x.h }
    return { ...x, hidden: true }
  })
}
