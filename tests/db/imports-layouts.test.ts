import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const FY2026 = '20000000-0000-4000-8000-000000002026'
const COUNT = 'select count(*)::int as n from public.'
const count = async (s: Session, table: string) => (await s.q<{ n: number }>(COUNT + table))[0].n

async function activity(s: Session, program: string = PROGRAMS.AMIA) {
  const [row] = await s.q<{ id: string }>(
    `insert into public.activities (program_id, fiscal_year_id, title, budget_amount)
     values ($1, $2, 'Imported activity', 500000) returning id`,
    [program, FY2026],
  )
  return row.id
}

const importRows = (s: Session, kind: string, rows: unknown[]) =>
  s
    .q<{ r: { saved: number; flagged: unknown[] } }>(
      'select public.import_finance_records($1, $2) as r',
      [kind, JSON.stringify(rows)],
    )
    .then((x) => x[0].r)

describe('import_finance_records', () => {
  it('saves every ORS and then a DV charged to one of them', () =>
    inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const id = await activity(s)
      const res = await importRows(s, 'obligations', [
        { activity_id: id, ors_no: 'IMP-1', ors_date: '2026-03-01', amount: 1000 },
        { activity_id: id, ors_no: 'IMP-2', ors_date: '2026-03-02', amount: 2000 },
      ])
      expect(res.saved).toBe(2)
      const [ors] = await s.q<{ id: string }>(
        `select id from public.obligations where ors_no = 'IMP-1'`,
      )
      const dv = await importRows(s, 'disbursements', [
        {
          activity_id: id,
          dv_no: 'DV-1',
          dv_date: '2026-03-05',
          gross_amount: 1000,
          links: [{ obligation_id: ors.id, amount: 1000 }],
        },
      ])
      expect(dv.saved).toBe(1)
    }))

  it('saves nothing when one row fails, and names the row', () =>
    inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const id = await activity(s)
      const before = await count(s, 'obligations')
      await expect(
        importRows(s, 'obligations', [
          { activity_id: id, ors_no: 'OK-1', ors_date: '2026-03-01', amount: 1000 },
          { activity_id: id, ors_no: 'BAD-2', ors_date: '2026-03-01', amount: 0 },
        ]),
      ).rejects.toThrow(/Row 2: Enter the ORS amount/)
      expect(await count(s, 'obligations')).toBe(before)
    }))

  it('keeps the same permission checks as the form', () =>
    inTx(db, async (s) => {
      await s.as(USERS.hvcAdmin)
      const id = await activity(s, PROGRAMS.HVC)
      await s.as(USERS.amiaAdmin)
      await expect(
        importRows(s, 'obligations', [
          { activity_id: id, ors_no: 'X-1', ors_date: '2026-03-01', amount: 1 },
        ]),
      ).rejects.toThrow(/Row 1: You are not allowed/)
    }))
})

describe('import templates', () => {
  const add = (s: Session, name: string) =>
    s.q<{ id: string }>(
      `insert into public.import_templates (target, name, created_by)
       values ('WFP', $1, auth.uid()) returning id`,
      [name],
    )

  it('are shared for reading, but only the owner or a superadmin changes them', () =>
    inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      const [t] = await add(s, 'Mine')

      await s.as(USERS.hvcStaff1)
      expect(
        await s.q('select id from public.import_templates where id = $1', [t.id]),
      ).toHaveLength(1)
      const updated = await s.q(
        `update public.import_templates set name = 'Stolen' where id = $1 returning id`,
        [t.id],
      )
      expect(updated).toHaveLength(0)

      await s.as(USERS.superadmin)
      const byAdmin = await s.q(
        `update public.import_templates set name = 'Renamed' where id = $1 returning id`,
        [t.id],
      )
      expect(byAdmin).toHaveLength(1)
    }))

  it('cannot be created in someone else’s name', () =>
    inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      await expect(
        s.q(
          `insert into public.import_templates (target, name, created_by) values ('WFP', 'x', $1)`,
          [USERS.hvcStaff1],
        ),
      ).rejects.toThrow()
    }))
})

describe('dashboard layouts', () => {
  const layout = JSON.stringify([{ id: 'flow', w: 6, h: 4 }])

  it('are private to each user', () =>
    inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      await s.q(`insert into public.dashboard_layouts (user_id, layout) values (auth.uid(), $1)`, [
        layout,
      ])
      expect(await s.q('select user_id from public.dashboard_layouts')).toHaveLength(1)

      await s.as(USERS.hvcStaff1)
      expect(await s.q('select user_id from public.dashboard_layouts')).toHaveLength(0)
      await expect(
        s.q(`insert into public.dashboard_layouts (user_id, layout) values ($1, $2)`, [
          USERS.amiaStaff1,
          layout,
        ]),
      ).rejects.toThrow()
    }))

  it('have a default only a superadmin can set', () =>
    inTx(db, async (s) => {
      const change = `update public.app_settings set value = '[{"id":"flow"}]'::jsonb
                      where key = 'dashboard_default_layout' returning key`
      await s.as(USERS.amiaAdmin)
      expect(await s.q(change)).toHaveLength(0)
      await s.as(USERS.superadmin)
      expect(await s.q(change)).toHaveLength(1)
    }))
})

describe('clear_demo_data.sql', () => {
  const script = readFileSync(
    join(resolve(import.meta.dirname, '../..'), 'supabase/scripts/clear_demo_data.sql'),
    'utf8',
  )
  const cleared = [
    'activities',
    'procurement_packages',
    'obligations',
    'disbursements',
    'package_deliveries',
    'allotments',
    'finance_plans',
    'finance_plan_rows',
    'savings_entries',
    'suppliers',
    'beneficiaries',
    'directives',
    'issues',
    'announcements',
    'approval_requests',
    'comments',
    'notes',
    'notifications',
    'progress_updates',
  ]
  const kept = [
    'profiles',
    'programs',
    'program_memberships',
    'fiscal_years',
    'expense_classes',
    'uacs_codes',
    'fund_sources',
    'units',
    'workflow_templates',
    'app_settings',
    'provinces',
    'municipalities',
  ]

  it('removes the sample records and keeps accounts and master data', () =>
    inTx(db, async (s) => {
      await s.asAdmin()
      for (const t of kept) expect(await count(s, t), `${t} before`).toBeGreaterThan(0)
      const accounts = await count(s, 'profiles')
      await db.exec(script)
      for (const t of cleared) expect(await count(s, t), t).toBe(0)
      for (const t of kept) expect(await count(s, t), t).toBeGreaterThan(0)
      expect(await count(s, 'profiles')).toBe(accounts)
    }))

  it('refuses to run when real accounts exist', () =>
    inTx(db, async (s) => {
      await s.asAdmin()
      const before = await count(s, 'activities')
      await s.q(`update public.profiles set email = 'real.person@da.gov.ph'
                 where id = '${USERS.amiaStaff1}'`)
      await expect(s.q(script.slice(0, script.indexOf('truncate table')))).rejects.toThrow(
        /Nothing was deleted/,
      )
      expect(await count(s, 'activities')).toBe(before)
    }))
})
