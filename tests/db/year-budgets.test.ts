import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const FY2026 = '20000000-0000-4000-8000-000000002026'
const FY2027 = '20000000-0000-4000-8000-000000002027'

const setBudget = (s: Session, amount: number, program: string = PROGRAMS.AMIA) =>
  s.q<{ total_budget: string }>(
    `insert into public.program_year_budgets (program_id, fiscal_year_id, total_budget)
     values ($1, $2, $3)
     on conflict (program_id, fiscal_year_id) do update set total_budget = excluded.total_budget
     returning total_budget`,
    [program, FY2026, amount],
  )

describe('program_year_budgets', () => {
  it('lets a program admin set and change the total, one row per year', () =>
    inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      await setBudget(s, 15000000)
      const [row] = await setBudget(s, 16000000)
      expect(Number(row.total_budget)).toBe(16000000)
      expect(await s.q('select id from public.program_year_budgets')).toHaveLength(1)
    }))

  it('lets program staff read it but not change it', () =>
    inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      await setBudget(s, 15000000)
      await s.as(USERS.amiaStaff1)
      expect(await s.q('select id from public.program_year_budgets')).toHaveLength(1)
      await expect(setBudget(s, 1)).rejects.toThrow()
    }))

  it('keeps other programs out', () =>
    inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      await setBudget(s, 15000000)
      await s.as(USERS.hvcAdmin)
      expect(await s.q('select id from public.program_year_budgets')).toHaveLength(0)
      await expect(setBudget(s, 1, PROGRAMS.AMIA)).rejects.toThrow()
    }))

  it('rejects a negative total', () =>
    inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      await expect(setBudget(s, -1)).rejects.toThrow()
    }))

  it('cannot be changed in a locked fiscal year', () =>
    inTx(db, async (s) => {
      await s.asAdmin()
      await s.q(`update public.fiscal_years set status = 'locked' where id = $1`, [FY2026])
      await s.as(USERS.amiaAdmin)
      await expect(setBudget(s, 1)).rejects.toThrow(/locked/)
    }))
})

describe('v_wfp_reported', () => {
  const planRow = { description: 'Training', amount: 100000, obligated: 90000, disbursed: 40000 }
  const makeWfp = async (s: Session) => {
    await s.as(USERS.amiaAdmin)
    const [plan] = await s.q<{ id: string }>(
      `select public.ensure_finance_plan($1, $2, 'WFP') as id`,
      [PROGRAMS.AMIA, FY2027],
    )
    return plan.id
  }
  const reported = (s: Session) =>
    s.q<{ obligated: string; disbursed: string; has_ors: boolean }>(
      'select obligated, disbursed, has_ors from public.v_wfp_reported where program_id = $1 and fiscal_year_id = $2',
      [PROGRAMS.AMIA, FY2027],
    )

  it('totals what save_plan_rows stored, and keeps it when a row is saved again', () =>
    inTx(db, async (s) => {
      const id = await makeWfp(s)
      await s.q(`select public.save_plan_rows($1, $2)`, [id, JSON.stringify([planRow])])
      const [saved] = await s.q<{ id: string }>(
        'select id from public.finance_plan_rows where plan_id = $1',
        [id],
      )
      await s.q(`select public.save_plan_rows($1, $2)`, [
        id,
        JSON.stringify([{ ...planRow, id: saved.id, description: 'Renamed' }]),
      ])
      const [row] = await reported(s)
      expect([Number(row.obligated), Number(row.disbursed), row.has_ors]).toEqual([
        90000,
        40000,
        false,
      ])
    }))

  it('rejects a negative amount', () =>
    inTx(db, async (s) => {
      const id = await makeWfp(s)
      await expect(
        s.q(`select public.save_plan_rows($1, $2)`, [
          id,
          JSON.stringify([{ ...planRow, obligated: -1 }]),
        ]),
      ).rejects.toThrow()
    }))

  it('keeps other programs out', () =>
    inTx(db, async (s) => {
      const id = await makeWfp(s)
      await s.q(`select public.save_plan_rows($1, $2)`, [id, JSON.stringify([planRow])])
      await s.as(USERS.hvcAdmin)
      expect(await reported(s)).toHaveLength(0)
    }))
})
