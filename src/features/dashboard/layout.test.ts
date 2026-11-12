import { describe, expect, it } from 'vitest'
import {
  BUILT_IN,
  DEFAULT_LAYOUT,
  moveWidget,
  normalizeLayout,
  resizeWidget,
  shiftWidget,
  toggleWidget,
  widgetCatalog,
  type LayoutItem,
} from './layout'

describe('dashboard layout', () => {
  it('uses the built-in layout when nothing is stored', () => {
    expect(normalizeLayout([])).toEqual(DEFAULT_LAYOUT)
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT)
  })
  it('drops unknown and repeated cards, limits sizes and adds new cards', () => {
    const out = normalizeLayout([
      { id: 'overdue', w: 99, h: 1 },
      { id: 'overdue', w: 4, h: 4 },
      { id: 'removed-card', w: 4, h: 4 },
    ])
    expect(out.find((x) => x.id === 'overdue')).toEqual({ id: 'overdue', w: 12, h: 2 })
    expect(out).toHaveLength(BUILT_IN.length)
    expect(new Set(out.map((x) => x.id)).size).toBe(BUILT_IN.length)
  })
  it('puts a new sheet card after the WFP totals, even in a saved layout', () => {
    const saved = normalizeLayout([], widgetCatalog())
    const out = normalizeLayout(saved, widgetCatalog([{ id: 'abc', title: 'Obligated' }]))
    expect(out.map((x) => x.id).slice(3, 5)).toEqual(['wfp_balance', 'card:abc'])
    // A card that was deleted disappears.
    expect(normalizeLayout(out, widgetCatalog()).some((x) => x.id === 'card:abc')).toBe(false)
  })
  it('keeps hidden cards hidden', () => {
    const out = normalizeLayout([{ id: 'status', w: 4, h: 5, hidden: true }])
    expect(out.find((x) => x.id === 'status')?.hidden).toBe(true)
  })
  it('moves a card onto another card', () => {
    const a: LayoutItem[] = [
      { id: 'overdue', w: 8, h: 5 },
      { id: 'funnel', w: 4, h: 5 },
      { id: 'status', w: 4, h: 5 },
    ]
    expect(moveWidget(a, 'status', 'overdue').map((x) => x.id)).toEqual([
      'status',
      'overdue',
      'funnel',
    ])
    expect(moveWidget(a, 'overdue', 'overdue')).toBe(a)
  })
  it('shifts past hidden cards and stops at the ends', () => {
    const a: LayoutItem[] = [
      { id: 'overdue', w: 8, h: 5 },
      { id: 'funnel', w: 4, h: 5, hidden: true },
      { id: 'status', w: 4, h: 5 },
    ]
    expect(shiftWidget(a, 'overdue', 1).map((x) => x.id)).toEqual(['funnel', 'status', 'overdue'])
    expect(shiftWidget(a, 'overdue', -1)).toBe(a)
  })
  it('limits resizing', () => {
    const a: LayoutItem[] = [{ id: 'overdue', w: 8, h: 5 }]
    expect(resizeWidget(a, 'overdue', 40, 0)[0]).toEqual({ id: 'overdue', w: 12, h: 2 })
  })
  it('hides and shows a card', () => {
    const a: LayoutItem[] = [{ id: 'overdue', w: 8, h: 5 }]
    const hidden = toggleWidget(a, 'overdue', false)
    expect(hidden[0].hidden).toBe(true)
    expect(toggleWidget(hidden, 'overdue', true)[0]).toEqual({ id: 'overdue', w: 8, h: 5 })
  })
})
