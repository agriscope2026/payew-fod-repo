import { describe, expect, it } from 'vitest'
import type { StageProgressRow } from '@/types/database'
import { stageLateness } from './stage-utils'

const stage = (p: Partial<StageProgressRow>) =>
  ({ status: 'pending', planned_end: '2026-03-10', actual_end: null, ...p }) as StageProgressRow

describe('stageLateness', () => {
  it('counts days past the plan for open stages', () => {
    expect(stageLateness(stage({ status: 'in_progress' }), '2026-03-15')).toBe(5)
    expect(stageLateness(stage({ status: 'pending' }), '2026-03-09')).toBe(0)
  })

  it('uses the actual end for finished stages and ignores skipped ones', () => {
    expect(
      stageLateness(stage({ status: 'completed', actual_end: '2026-03-12' }), '2026-09-01'),
    ).toBe(2)
    expect(
      stageLateness(stage({ status: 'completed', actual_end: '2026-03-01' }), '2026-09-01'),
    ).toBe(0)
    expect(
      stageLateness(stage({ status: 'skipped', actual_end: '2026-05-01' }), '2026-09-01'),
    ).toBe(0)
  })

  it('is zero without a plan', () => {
    expect(stageLateness(stage({ planned_end: null, status: 'in_progress' }), '2026-09-01')).toBe(0)
  })
})
