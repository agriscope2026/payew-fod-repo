import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, USERS } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const FY2026 = '20000000-0000-4000-8000-000000002026'

/**
 * Roll-up logic (Addendum B): on the full B7 seed, every summary must agree with
 * the records underneath — package → activity → program → dashboard/reports.
 * Each query returns the rows that disagree, so a failure names them.
 */
describe('roll-ups on the seeded B7 scenarios', () => {
  it('package summaries keep their invariants', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      const bad = await s.q(
        `select code, ceiling, obligated, delivered, accepted, disbursed, unobligated_balance,
                obligated_undelivered, delivered_unpaid
         from public.v_package_financial_summary
         where accepted > delivered
            or obligated_undelivered < 0 or delivered_unpaid < 0
            or unobligated_balance <> ceiling - obligated
            or obligated_undelivered <> greatest(obligated - accepted, 0)
            or delivered_unpaid <> greatest(accepted - disbursed, 0)`,
      )
      expect(bad).toEqual([])
    })
  })

  it('activity money = its packages + activity-level expenses', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      const bad = await s.q(
        `select f.code, f.obligated, f.disbursed, x.pkg_obligated, x.direct_obligated, x.dv
         from public.v_activity_financials f
         cross join lateral (
           select
             (select coalesce(sum(p.obligated), 0) from public.v_package_financial_summary p
               where p.activity_id = f.activity_id) as pkg_obligated,
             (select coalesce(sum(o.amount), 0) from public.obligations o
               where o.activity_id = f.activity_id and o.package_id is null and o.status = 'active') as direct_obligated,
             (select coalesce(sum(d.gross_amount), 0) from public.disbursements d
               where d.activity_id = f.activity_id and d.status = 'active') as dv
         ) x
         where f.obligated_packages <> x.pkg_obligated
            or f.obligated_direct <> x.direct_obligated
            or f.obligated <> x.pkg_obligated + x.direct_obligated
            or f.disbursed <> x.dv`,
      )
      expect(bad).toEqual([])
    })
  })

  it('activity package counts and totals match the packages', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      const bad = await s.q(
        `select a.code, a.packages_total, a.packages_closed, a.packages_cancelled, a.packages_abc_total, x.*
         from public.v_activities a
         cross join lateral (
           select count(*) filter (where p.status <> 'cancelled') as total,
                  count(*) filter (where p.status = 'closed') as closed,
                  count(*) filter (where p.status = 'cancelled') as cancelled,
                  coalesce(sum(p.abc_amount) filter (where p.status <> 'cancelled'), 0) as abc
           from public.procurement_packages p where p.activity_id = a.id and p.deleted_at is null
         ) x
         where a.deleted_at is null
           and (a.packages_total <> x.total or a.packages_closed <> x.closed
                or a.packages_cancelled <> x.cancelled or a.packages_abc_total <> x.abc)`,
      )
      expect(bad).toEqual([])
    })
  })

  it('a finished container stage means every live package is closed (or an audited override)', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      const bad = await s.q(
        `select a.code, s.name, s.status, s.notes
         from public.activity_stage_progress s
         join public.activities a on a.id = s.activity_id and a.deleted_at is null
         where s.tracks_packages and s.package_id is null and s.status = 'completed'
           and exists (select 1 from public.procurement_packages p
                       where p.activity_id = a.id and p.deleted_at is null
                         and p.status in ('not_started', 'ongoing'))
           and coalesce(s.notes, '') = ''`,
      )
      expect(bad).toEqual([])
    })
  })

  it('program finance, the dashboard and the reports agree', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      const [d] = await s.q<{ r: Record<string, Record<string, number> & unknown> }>(
        `select public.dashboard_summary($1) as r`,
        [FY2026],
      )
      const summary = d.r as unknown as {
        kpis: { obligated_all: number; disbursed_all: number; delivered_unpaid: number }
        packages: { total: number }
        compliance: { obligated: number }[]
      }
      const [t] = await s.q<{
        obligated: string
        disbursed: string
        packages: string
        unpaid: string
      }>(
        `select
           (select coalesce(sum(obligated), 0) from public.v_activity_financials where fiscal_year_id = $1) as obligated,
           (select coalesce(sum(disbursed), 0) from public.v_activity_financials where fiscal_year_id = $1) as disbursed,
           (select coalesce(sum(packages_total), 0) from public.v_activities
             where fiscal_year_id = $1 and deleted_at is null) as packages,
           (select coalesce(sum(delivered_unpaid), 0) from public.v_package_financial_summary
             where fiscal_year_id = $1 and status <> 'cancelled') as unpaid`,
        [FY2026],
      )
      expect(Number(summary.kpis.obligated_all)).toBeCloseTo(Number(t.obligated), 2)
      expect(Number(summary.kpis.disbursed_all)).toBeCloseTo(Number(t.disbursed), 2)
      expect(Number(summary.packages.total)).toBe(Number(t.packages))
      expect(Number(summary.kpis.delivered_unpaid)).toBeCloseTo(Number(t.unpaid), 2)
      const byProgram = summary.compliance.reduce((a, c) => a + Number(c.obligated), 0)
      expect(byProgram).toBeCloseTo(Number(t.obligated), 2)

      // Payables report = the dashboard's delivered-but-unpaid.
      const [p] = await s.q<{ n: string }>(
        `select coalesce(sum(delivered_unpaid), 0) as n from public.v_payables
         where fiscal_year_id = $1 and status <> 'cancelled'`,
        [FY2026],
      )
      expect(Number(p.n)).toBeCloseTo(Number(summary.kpis.delivered_unpaid), 2)
    })
  })

  it('covers the B7 scenario mix', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      const [c] = await s.q<Record<string, string>>(
        `select
           (select count(*) from public.suppliers where deleted_at is null) as suppliers,
           (select count(*) from public.suppliers where status = 'suspended') as suspended,
           (select count(*) from public.suppliers where status = 'blacklisted') as blacklisted,
           (select count(*) from public.v_suppliers where expiring_docs + expired_docs > 0) as papers,
           (select count(*) from public.procurement_packages where status = 'cancelled') as cancelled,
           (select count(distinct package_id) from public.package_supplier_history) as reawarded,
           (select count(*) from public.v_packages where display_status = 'delayed') as overdue,
           (select count(*) from public.procurement_packages where savings_amount > 0) as savings,
           (select count(*) from public.procurement_packages where obligation_timing = 'before_delivery') as obligate_first,
           (select count(*) from (select package_id from public.package_deliveries
                                  group by package_id having count(*) > 1) x) as partial_deliveries,
           (select count(*) from (select package_id from public.disbursements where status = 'active' and package_id is not null
                                  group by package_id having count(*) > 1) x) as staged_payments,
           (select count(*) from public.v_activities a where a.packages_closed > 0
              and a.packages_total > a.packages_closed) as closed_alongside_open`,
      )
      expect(Number(c.suppliers)).toBeGreaterThanOrEqual(20)
      expect(Number(c.suppliers)).toBeLessThanOrEqual(30)
      for (const k of [
        'suspended',
        'blacklisted',
        'papers',
        'cancelled',
        'reawarded',
        'overdue',
        'savings',
        'obligate_first',
        'partial_deliveries',
        'staged_payments',
        'closed_alongside_open',
      ])
        expect(Number(c[k]), k).toBeGreaterThan(0)
    })
  })
})
