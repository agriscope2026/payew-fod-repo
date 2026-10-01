import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const FY2026 = '20000000-0000-4000-8000-000000002026'

interface WorkItem {
  kind: string
  item_id: string
  title: string
  due_date: string | null
  program_id: string
  can_complete: boolean
}

interface CalEvent {
  kind: string
  ref_id: string
  start_date: string
  end_date: string
  program_id: string
  package_id: string | null
  category_code: string | null
}

describe('my_work_items', () => {
  it('lists stages, tasks, directives and decisions for the caller only', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const [act] = await s.q<{ id: string }>(
        `insert into public.activities (program_id, fiscal_year_id, title, start_date, due_date, responsible_user_id)
         values ($1, $2, 'Inbox test activity', '2026-03-02', '2026-06-30', $3) returning id`,
        [PROGRAMS.AMIA, FY2026, USERS.amiaStaff1],
      )
      const [stage] = await s.q<{ id: string }>(
        `select id from public.activity_stage_progress where activity_id = $1 and package_id is null
         order by sort_order limit 1`,
        [act.id],
      )
      await s.q(`update public.activity_stage_progress set assigned_to = $2 where id = $1`, [
        stage.id,
        USERS.amiaStaff2,
      ])
      const [task] = await s.q<{ id: string }>(
        `insert into public.activity_tasks (activity_id, title, assigned_to, due_date)
         values ($1, 'Collect attendance sheets', $2, '2026-04-01') returning id`,
        [act.id, USERS.amiaStaff1],
      )
      await s.q(
        `select public.issue_directive($1, 'Submit the Q3 report', 'Please send it by Friday.', $2, '2026-10-09')`,
        [PROGRAMS.AMIA, [USERS.amiaStaff1]],
      )

      await s.as(USERS.amiaStaff1)
      const mine = await s.q<WorkItem>(
        `select kind, item_id, title, due_date::text as due_date, program_id, can_complete from public.my_work_items()`,
      )
      expect(mine.find((i) => i.kind === 'task' && i.item_id === task.id)).toBeTruthy()
      expect(
        mine.find((i) => i.kind === 'directive' && i.title === 'Submit the Q3 report')?.due_date,
      ).toBe('2026-10-09')
      // The first stage is assigned to staff 2, so it is not staff 1's.
      expect(mine.find((i) => i.kind === 'stage' && i.item_id === stage.id)).toBeUndefined()

      await s.as(USERS.amiaStaff2)
      const theirs = await s.q<WorkItem>(
        `select kind, item_id, title, due_date::text as due_date, program_id, can_complete from public.my_work_items()`,
      )
      expect(theirs.find((i) => i.kind === 'stage' && i.item_id === stage.id)).toBeTruthy()
      expect(theirs.find((i) => i.item_id === task.id)).toBeUndefined()

      // Completing the task removes it from the inbox.
      await s.asAdmin()
      await s.q(`update public.activity_tasks set is_done = true where id = $1`, [task.id])
      await s.as(USERS.amiaStaff1)
      const after = await s.q<WorkItem>(
        `select kind, item_id, title, due_date::text as due_date, program_id, can_complete from public.my_work_items()`,
      )
      expect(after.find((i) => i.item_id === task.id)).toBeUndefined()
    })
  })

  it('shows pending approvals to the people who can decide them', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const items = await s.q<WorkItem>(
        `select kind, item_id, title, due_date::text as due_date, program_id, can_complete from public.my_work_items() where kind = 'approval'`,
      )
      await s.asAdmin()
      const [{ n }] = await s.q<{ n: string }>(
        `select count(*) as n from public.approval_requests where status = 'pending' and program_id = $1
           and requested_by <> $2`,
        [PROGRAMS.AMIA, USERS.amiaAdmin],
      )
      expect(items.length).toBe(Number(n))
      for (const i of items) expect(i.program_id).toBe(PROGRAMS.AMIA)
    })
  })
})

describe('calendar_events', () => {
  it('returns events in range, scoped by RLS and program filter', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      const all = await s.q<CalEvent>(
        `select kind, ref_id, start_date::text as start_date, end_date::text as end_date, program_id, package_id, category_code from public.calendar_events('2026-01-01', '2026-12-31')`,
      )
      const kinds = new Set(all.map((e) => e.kind))
      for (const k of ['activity', 'activity_due', 'stage_due', 'pkg_award', 'delivery'])
        expect(kinds.has(k)).toBe(true)
      for (const e of all) {
        expect(e.start_date <= '2026-12-31').toBe(true)
        expect(e.end_date >= '2026-01-01').toBe(true)
      }
      // Package events carry their category for colour coding.
      expect(
        all
          .filter((e) => e.package_id)
          .every(
            (e) =>
              e.kind.startsWith('pkg_') ||
              ['delivery', 'payment_due', 'issue_due', 'directive_due'].includes(e.kind),
          ),
      ).toBe(true)
      expect(all.some((e) => e.kind === 'delivery' && e.category_code)).toBe(true)

      const amia = await s.q<CalEvent>(
        `select kind, ref_id, start_date::text as start_date, end_date::text as end_date, program_id, package_id, category_code from public.calendar_events('2026-01-01', '2026-12-31', $1)`,
        [[PROGRAMS.AMIA]],
      )
      expect(amia.length).toBeGreaterThan(0)
      expect(amia.every((e) => e.program_id === PROGRAMS.AMIA)).toBe(true)

      await s.as(USERS.hvcStaff1)
      const hvc = await s.q<CalEvent>(
        `select kind, ref_id, start_date::text as start_date, end_date::text as end_date, program_id, package_id, category_code from public.calendar_events('2026-01-01', '2026-12-31')`,
      )
      expect(hvc.length).toBeGreaterThan(0)
      expect(hvc.every((e) => e.program_id === PROGRAMS.HVC)).toBe(true)

      await expect(
        s.q(
          `select kind, ref_id, start_date::text as start_date, end_date::text as end_date, program_id, package_id, category_code from public.calendar_events('2026-01-01', '2027-12-31')`,
        ),
      ).rejects.toThrow(/at most 400 days/)
    })
  })
})

describe('reports', () => {
  it('report_suppliers totals match the package financial summary', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      const rows = await s.q<{
        supplier_id: string
        contract: string
        paid: string
        deliveries: string
        deliveries_on_time: string
      }>(`select * from public.report_suppliers($1)`, [FY2026])
      expect(rows.length).toBeGreaterThan(0)
      const [t] = await s.q<{ contract: string; paid: string }>(
        `select coalesce(sum(f.contract_amount), 0) as contract, coalesce(sum(f.disbursed), 0) as paid
         from public.v_package_financial_summary f
         join public.procurement_packages p on p.id = f.package_id
         where f.fiscal_year_id = $1 and f.status <> 'cancelled' and f.supplier_id is not null and p.deleted_at is null`,
        [FY2026],
      )
      const sum = (k: 'contract' | 'paid') => rows.reduce((a, r) => a + Number(r[k]), 0)
      expect(sum('contract')).toBeCloseTo(Number(t.contract), 2)
      expect(sum('paid')).toBeCloseTo(Number(t.paid), 2)
      for (const r of rows)
        expect(Number(r.deliveries_on_time)).toBeLessThanOrEqual(Number(r.deliveries))
    })
  })

  it('report_beneficiaries only covers visible programs', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      const all = await s.q<{ programs: string }>(`select * from public.report_beneficiaries($1)`, [
        FY2026,
      ])
      expect(all.length).toBeGreaterThan(0)
      await s.as(USERS.amiaStaff1)
      const amia = await s.q<{ programs: string }>(
        `select * from public.report_beneficiaries($1)`,
        [FY2026],
      )
      expect(amia.length).toBeGreaterThan(0)
      expect(amia.every((r) => r.programs.split(', ').every((c) => c === 'AMIA'))).toBe(true)
    })
  })
})
