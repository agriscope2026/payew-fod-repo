import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const FY2026 = '20000000-0000-4000-8000-000000002026'

const wfp = async (s: Session) => {
  await s.as(USERS.amiaAdmin)
  const [{ id }] = await s.q<{ id: string }>(
    `select public.create_finance_sheet($1, $2, 'WFP', '{}'::jsonb) as id`,
    [PROGRAMS.AMIA, FY2026],
  )
  return id
}
const item = (row: string, title: string, extra: Record<string, unknown> = {}) => ({
  row_id: row,
  title,
  unit: 'Training',
  target: 2,
  budget: 100000,
  obligated: 90000,
  disbursed: 40000,
  ...extra,
})
const sync = (s: Session, sheet: string, items: unknown[]) =>
  s.q<{ r: { created: number; updated: number; removed: number } }>(
    'select public.sync_wfp_activities($1, $2::jsonb) as r',
    [sheet, JSON.stringify(items)],
  )
const linked = (s: Session, sheet: string) =>
  s.q<{
    title: string
    target_quantity: string
    wfp_obligated: string
    wfp_removed_at: string | null
  }>(
    `select a.title, a.target_quantity, p.wfp_obligated, p.wfp_removed_at
     from public.activity_physical p join public.activities a on a.id = p.activity_id
     where p.wfp_sheet_id = $1 order by p.wfp_order`,
    [sheet],
  )

describe('sync_wfp_activities', () => {
  it('creates activities from WFP rows, then updates them in place', () =>
    inTx(db, async (s) => {
      const sheet = await wfp(s)
      const [{ r }] = await sync(s, sheet, [item('r1', 'Training on vermi-composting')])
      expect(r).toEqual({ created: 1, updated: 0, removed: 0 })
      const [again] = await sync(s, sheet, [
        item('r1', 'Training on vermi-composting', { target: 3, obligated: 95000 }),
      ])
      expect(again.r).toEqual({ created: 0, updated: 1, removed: 0 })
      const [row] = await linked(s, sheet)
      expect([row.title, Number(row.target_quantity), Number(row.wfp_obligated)]).toEqual([
        'Training on vermi-composting',
        3,
        95000,
      ])
    }))

  it('adopts an activity typed in earlier with the same title', () =>
    inTx(db, async (s) => {
      const sheet = await wfp(s)
      await s.q(
        `insert into public.activities (program_id, fiscal_year_id, title) values ($1, $2, 'Mid-year  assessment')`,
        [PROGRAMS.AMIA, FY2026],
      )
      const [{ r }] = await sync(s, sheet, [item('r9', 'Mid-year assessment')])
      expect(r.created).toBe(0)
      const n = await s.q(`select id from public.activities where title ilike 'mid-year%'`)
      expect(n).toHaveLength(1)
    }))

  it('marks activities whose row left the WFP, without deleting them', () =>
    inTx(db, async (s) => {
      const sheet = await wfp(s)
      await sync(s, sheet, [item('r1', 'Activity one'), item('r2', 'Activity two')])
      const [{ r }] = await sync(s, sheet, [item('r1', 'Activity one')])
      expect(r.removed).toBe(1)
      const rows = await linked(s, sheet)
      expect(rows.map((x) => [x.title, x.wfp_removed_at !== null])).toEqual([
        ['Activity one', false],
        ['Activity two', true],
      ])
    }))

  it('keeps other programs out, and WFP figures read-only for everyone', () =>
    inTx(db, async (s) => {
      const sheet = await wfp(s)
      await sync(s, sheet, [item('r1', 'Activity one')])
      await expect(s.q('update public.activity_physical set wfp_obligated = 1')).rejects.toThrow(
        /permission denied/,
      )
      await s.q(
        `update public.activity_physical set monthly_targets = array[0,0,1,0,0,1,0,0,0,0,0,0]::numeric[]`,
      )
      await s.as(USERS.hvcAdmin)
      expect(await s.q('select activity_id from public.activity_physical')).toHaveLength(0)
      await expect(sync(s, sheet, [])).rejects.toThrow(/not allowed/)
    }))

  it('keeps the phase and status, and fills empty monthly targets only', () =>
    inTx(db, async (s) => {
      const sheet = await wfp(s)
      const months = [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0]
      await sync(s, sheet, [
        item('r1', 'Activity one', { phase: 'Phase 2', status: 'Ongoing', targets: months }),
      ])
      await s.q(
        `update public.activity_physical set monthly_targets = array_fill(2::numeric, array[12])`,
      )
      await sync(s, sheet, [
        item('r1', 'Activity one', { phase: 'Phase 2', status: 'Accomplished', targets: months }),
      ])
      const [row] = await s.q<{ wfp_phase: string; wfp_status: string; monthly_targets: string[] }>(
        'select wfp_phase, wfp_status, monthly_targets from public.activity_physical',
      )
      expect([row.wfp_phase, row.wfp_status, row.monthly_targets.map(Number)[0]]).toEqual([
        'Phase 2',
        'Accomplished',
        2,
      ])
    }))

  it('rejects negative or wrongly sized monthly figures', () =>
    inTx(db, async (s) => {
      const sheet = await wfp(s)
      await sync(s, sheet, [item('r1', 'Activity one')])
      await expect(
        s.q(`update public.activity_physical set monthly_done = array[1,2]::numeric[]`),
      ).rejects.toThrow()
      await expect(
        s.q(
          `update public.activity_physical set monthly_targets = array_fill(-1::numeric, array[12])`,
        ),
      ).rejects.toThrow()
    }))
})
