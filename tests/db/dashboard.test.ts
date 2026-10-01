import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const FY2026 = '20000000-0000-4000-8000-000000002026'

interface Summary {
  program_ids: string[]
  kpis: Record<string, number>
  packages: Record<string, number>
  activities: Record<string, number>
  monthly: { month: string; obligated: number; disbursed: number }[]
  funnel: { phase: string; packages: number; amount: number }[]
  aging: { bucket: string; count: number; amount: number }[]
  by_supplier: { name: string; contract: number; paid: number }[]
  overdue_activities: { id: string; program_id: string; days_late: number }[]
  overdue_packages: { id: string; program_id: string; days_late: number }[]
  attention: Record<string, number>
  compliance: { program_id: string; activities: number; on_schedule: number }[]
}

const summary = (
  s: { q: <T>(sql: string, p?: unknown[]) => Promise<T[]> },
  programs: string[] | null,
) =>
  s
    .q<{ r: Summary }>(`select public.dashboard_summary($1, $2) as r`, [FY2026, programs])
    .then((rows) => rows[0].r)

const sum = (xs: number[]) => xs.reduce((a, b) => a + Number(b), 0)

describe('dashboard_summary', () => {
  it('requires a signed-in user', async () => {
    await inTx(db, async (s) => {
      await s.as(null)
      await expect(summary(s, null)).rejects.toThrow(/permission denied|Not signed in/)
    })
  })

  it('totals agree with the underlying records', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      const r = await summary(s, null)
      expect(r.program_ids).toEqual(expect.arrayContaining(Object.values(PROGRAMS)))

      await s.asAdmin()
      const [o] = await s.q<{ total: string }>(
        `select coalesce(sum(amount), 0) as total from public.obligations where fiscal_year_id = $1 and status = 'active'`,
        [FY2026],
      )
      const [p] = await s.q<{ n: string }>(
        `select count(*) as n from public.procurement_packages
         where fiscal_year_id = $1 and deleted_at is null and status <> 'cancelled'`,
        [FY2026],
      )
      expect(Number(r.kpis.obligated_all)).toBeCloseTo(Number(o.total), 2)
      expect(r.packages.total).toBe(Number(p.n))
      // Every non-cancelled package lands in exactly one funnel phase.
      expect(sum(r.funnel.map((f) => f.packages))).toBe(Number(p.n))
      // Monthly flow covers the whole fiscal year and adds up.
      expect(r.monthly).toHaveLength(12)
      expect(sum(r.monthly.map((m) => m.obligated))).toBeCloseTo(Number(o.total), 2)
      // Aging buckets add up to the unpaid part of all ORS.
      expect(r.aging.map((a) => a.bucket)).toEqual([
        '0–30 days',
        '31–60 days',
        '61–90 days',
        'Over 90 days',
      ])
      const [u] = await s.q<{ unpaid: string }>(
        `select coalesce(sum(o.amount - coalesce(l.paid, 0)), 0) as unpaid
         from public.obligations o
         left join lateral (select sum(x.amount) as paid from public.disbursement_obligations x
                            join public.disbursements d on d.id = x.disbursement_id and d.status = 'active'
                            where x.obligation_id = o.id) l on true
         where o.fiscal_year_id = $1 and o.status = 'active' and o.amount - coalesce(l.paid, 0) > 0`,
        [FY2026],
      )
      expect(sum(r.aging.map((a) => a.amount))).toBeCloseTo(Number(u.unpaid), 2)
      expect(r.by_supplier.length).toBeLessThanOrEqual(8)
      for (const c of r.compliance) expect(c.on_schedule).toBeLessThanOrEqual(c.activities)
    })
  })

  it('only covers programs the caller can access', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      const r = await summary(s, [PROGRAMS.AMIA, PROGRAMS.HVC])
      expect(r.program_ids).toEqual([PROGRAMS.AMIA])
      expect(r.compliance.map((c) => c.program_id)).toEqual([PROGRAMS.AMIA])
      for (const a of r.overdue_activities) expect(a.program_id).toBe(PROGRAMS.AMIA)
      for (const p of r.overdue_packages) expect(p.program_id).toBe(PROGRAMS.AMIA)

      // Asking only for a foreign program yields an empty scope, not its data.
      const none = await summary(s, [PROGRAMS.HVC])
      expect(none.program_ids).toEqual([])
      expect(none.packages.total).toBe(0)
      expect(Number(none.kpis.obligated_all)).toBe(0)
    })
  })

  it('counts the caller’s own pending directives and decisions', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const before = await summary(s, [PROGRAMS.AMIA])
      await s.q(
        `select public.issue_directive($1, 'Submit the Q3 report', 'Please send it by Friday.', $2)`,
        [PROGRAMS.AMIA, [USERS.amiaStaff1]],
      )
      await s.as(USERS.amiaStaff1)
      const after = await summary(s, [PROGRAMS.AMIA])
      expect(after.attention.my_directives).toBeGreaterThanOrEqual(1)
      // The admin's own count is unaffected by a directive addressed to staff.
      await s.as(USERS.amiaAdmin)
      const admin = await summary(s, [PROGRAMS.AMIA])
      expect(admin.attention.my_directives).toBe(before.attention.my_directives)
    })
  })
})
