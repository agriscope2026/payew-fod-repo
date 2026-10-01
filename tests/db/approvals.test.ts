import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const FY2026 = '20000000-0000-4000-8000-000000002026'

/** Ongoing AMIA activity (first stage started) with an awarded package; staff 1 may edit. */
async function setup(s: Session) {
  await s.asAdmin()
  await s.q('update public.profiles set can_edit_activities = true where id = $1', [USERS.amiaStaff1])
  const [{ id: supplier }] = await s.q<{ id: string }>(
    `insert into public.suppliers (business_name, tin) values ('Approval Test Supplies', '777-111-222') returning id`,
  )
  const [{ id: other }] = await s.q<{ id: string }>(
    `insert into public.suppliers (business_name, tin) values ('Second Supplier Trading', '777-111-333') returning id`,
  )
  await s.as(USERS.amiaAdmin)
  const [act] = await s.q<{ id: string; code: string }>(
    `insert into public.activities (program_id, fiscal_year_id, title, start_date, due_date, budget_amount, responsible_user_id)
     values ($1, $2, 'Approval test activity', '2026-03-02', '2026-06-30', 500000, $3) returning id, code`,
    [PROGRAMS.AMIA, FY2026, USERS.amiaStaff1],
  )
  const [first] = await s.q<{ id: string }>(
    `select id from public.activity_stage_progress where activity_id = $1 and package_id is null order by sort_order limit 1`,
    [act.id],
  )
  await s.q(`select public.activity_stage_action($1, 'start')`, [first.id])
  const [pkg] = await s.q<{ id: string }>(
    `insert into public.procurement_packages (activity_id, title, abc_amount) values ($1, 'Supplies', 100000) returning id`,
    [act.id],
  )
  await s.q(`select public.award_package($1, $2, 90000, '2026-03-10')`, [pkg.id, supplier])
  return { activity: act.id, code: act.code, pkg: pkg.id, supplier, other, stage: first.id }
}

const submit = (s: Session, type: string, entityType: string, id: string, payload: unknown = {}, fy: string | null = null) =>
  s
    .q<{ id: string }>(`select public.submit_approval($1, $2, $3, 'Because the field team asked', $4, $5) as id`, [
      type,
      entityType,
      id,
      JSON.stringify(payload),
      fy,
    ])
    .then((r) => r[0].id)

const decide = (s: Session, id: string, decision: string, note: string | null = null) =>
  s.q(`select public.decide_approval($1, $2, $3)`, [id, decision, note])

describe('extensions', () => {
  it('staff must request; admins decide; the change is applied on approval', async () => {
    await inTx(db, async (s) => {
      const { activity } = await setup(s)
      await s.as(USERS.amiaStaff1)
      await expect(
        s.q(`update public.activities set due_date = '2026-08-31' where id = $1`, [activity]),
      ).rejects.toThrow(/needs approval: use "Request extension"/)
      // Shortening is fine.
      await s.q(`update public.activities set due_date = '2026-06-15' where id = $1`, [activity])

      const id = await submit(s, 'extension', 'activity', activity, { new_due_date: '2026-08-31' })
      await expect(submit(s, 'extension', 'activity', activity, { new_due_date: '2026-09-30' })).rejects.toThrow(/already pending/)
      await expect(decide(s, id, 'approved')).rejects.toThrow(/cannot decide/)

      await s.asAdmin()
      const deciders = await s.q<{ user_id: string }>(
        `select user_id from public.notifications where entity_id = $1 and type = 'approval'`,
        [id],
      )
      expect(deciders.map((d) => d.user_id)).toEqual(expect.arrayContaining([USERS.amiaAdmin, USERS.superadmin]))

      await s.as(USERS.amiaAdmin)
      const [v] = await s.q<{ can_decide: boolean }>(`select can_decide from public.v_approval_requests where id = $1`, [id])
      expect(v.can_decide).toBe(true)
      await expect(decide(s, id, 'rejected')).rejects.toThrow(/reason for rejecting/)
      await decide(s, id, 'approved', 'OK, typhoon delays')
      const [a] = await s.q<{ due_date: string; end_date: string }>(
        `select due_date::text, end_date::text from public.activities where id = $1`,
        [activity],
      )
      expect(a.due_date).toBe('2026-08-31')
      await s.asAdmin()
      const [n] = await s.q<{ title: string }>(
        `select title from public.notifications where user_id = $1 and entity_id = $2`,
        [USERS.amiaStaff1, id],
      )
      expect(n.title).toMatch(/^Approved: Extend/)
    })
  })

  it("routes a program admin's request to the superadmin; nobody decides their own", async () => {
    await inTx(db, async (s) => {
      const { pkg } = await setup(s)
      await s.as(USERS.amiaAdmin)
      const id = await submit(s, 'cancellation', 'package', pkg)
      await expect(decide(s, id, 'approved')).rejects.toThrow(/cannot decide/)
      await s.as(USERS.superadmin)
      await decide(s, id, 'approved')
      const [p] = await s.q<{ status: string; cancelled_reason: string }>(
        `select status, cancelled_reason from public.procurement_packages where id = $1`,
        [pkg],
      )
      expect(p).toEqual({ status: 'cancelled', cancelled_reason: 'Because the field team asked' })
    })
  })
})

describe('Addendum B request types', () => {
  it('re-awards and changes contracts through approval; blacklisted suppliers are refused up front', async () => {
    await inTx(db, async (s) => {
      const { pkg, other } = await setup(s)
      await s.as(USERS.superadmin)
      const [{ id: black }] = await s.q<{ id: string }>(
        `insert into public.suppliers (business_name, status, status_reason) values ('Blacklisted Co', 'blacklisted', 'BAC 2026-1') returning id`,
      )
      await s.as(USERS.amiaStaff1)
      await expect(
        submit(s, 'supplier_reaward', 'package', pkg, { supplier_id: black, contract_amount: 95000 }),
      ).rejects.toThrow(/Cannot award: Blacklisted/)
      const re = await submit(s, 'supplier_reaward', 'package', pkg, { supplier_id: other, contract_amount: 95000 })
      await s.as(USERS.amiaAdmin)
      await decide(s, re, 'approved')
      const var1 = await (async () => {
        await s.as(USERS.amiaStaff1)
        return submit(s, 'contract_variation', 'package', pkg, { contract_amount: 97500 })
      })()
      await s.as(USERS.amiaAdmin)
      await decide(s, var1, 'approved')
      const [p] = await s.q<{ supplier_id: string; contract_amount: string }>(
        `select supplier_id, contract_amount::text from public.procurement_packages where id = $1`,
        [pkg],
      )
      expect(p).toEqual({ supplier_id: other, contract_amount: '97500.00' })
      const hist = await s.q<{ action: string }>(
        `select action from public.package_supplier_history where package_id = $1 order by created_at`,
        [pkg],
      )
      expect(hist.map((h) => h.action)).toEqual(['award', 're_award', 'contract_change'])
    })
  })

  it('raises an obligation-order exception from a delivery before the ORS', async () => {
    await inTx(db, async (s) => {
      const { activity } = await setup(s)
      await s.as(USERS.superadmin)
      const [{ id: sup }] = await s.q<{ id: string }>(
        `insert into public.suppliers (business_name, tin) values ('Obligate First Co', '777-999-111') returning id`,
      )
      await s.as(USERS.amiaAdmin)
      const [{ id: pkg }] = await s.q<{ id: string }>(
        `insert into public.procurement_packages (activity_id, title, abc_amount, obligation_timing) values ($1, 'Lodging', 50000, 'before_delivery') returning id`,
        [activity],
      )
      await s.q(`select public.award_package($1, $2, 50000, '2026-03-10')`, [pkg, sup])
      await s.as(USERS.amiaStaff1)
      const [{ r }] = await s.q<{ r: { id: string } }>(`select public.save_delivery($1) as r`, [
        { package_id: pkg, status: 'delivered', delivery_date: '2026-03-20', amount: 50000, exception_remark: 'Rooms needed before ORS release' },
      ])
      const [req] = await s.q<{ id: string; request_type: string; justification: string }>(
        `select id, request_type, justification from public.approval_requests where entity_id = $1`,
        [r.id],
      )
      expect(req).toMatchObject({ request_type: 'obligation_exception', justification: 'Rooms needed before ORS release' })
      await s.as(USERS.amiaAdmin)
      await decide(s, req.id, 'approved')
      const [d] = await s.q<{ flags: string[] }>(`select flags from public.package_deliveries where id = $1`, [r.id])
      expect(d.flags).toContain('Delivered before obligation (exception approved)')
    })
  })

  it('skips a non-skippable stage only via approval', async () => {
    await inTx(db, async (s) => {
      const { activity, stage } = await setup(s)
      await s.as(USERS.amiaStaff1)
      await expect(s.q(`select public.activity_stage_action($1, 'skip', 'x')`, [stage])).rejects.toThrow(/cannot be skipped/)
      const id = await submit(s, 'stage_skip', 'activity', activity, { stage_id: stage })
      await s.as(USERS.amiaAdmin)
      await decide(s, id, 'approved')
      const [st] = await s.q<{ status: string; skippable: boolean }>(
        `select status, skippable from public.activity_stage_progress where id = $1`,
        [stage],
      )
      expect(st).toEqual({ status: 'skipped', skippable: false })
    })
  })

  it('realigns allotments (using savings) and activity budgets', async () => {
    await inTx(db, async (s) => {
      const { activity } = await setup(s)
      await s.as(USERS.amiaAdmin)
      const [{ id: other }] = await s.q<{ id: string }>(
        `insert into public.activities (program_id, fiscal_year_id, title, start_date, budget_amount) values ($1, $2, 'Receiving activity', '2026-04-01', 100000) returning id`,
        [PROGRAMS.AMIA, FY2026],
      )
      const [{ id: sv }] = await s.q<{ id: string }>(
        `select id from public.savings_entries where activity_id = $1`,
        [activity],
      )
      await s.as(USERS.amiaStaff1)
      const ec = await s.q<{ id: string; code: string }>(`select id, code from public.expense_classes where code in ('MOOE', 'CO') order by code`)
      const realloc = await submit(s, 'realignment', 'program', PROGRAMS.AMIA,
        { scope: 'allotment', from_expense_class_id: ec[1].id, to_expense_class_id: ec[0].id, amount: 10000, savings_entry_id: sv }, FY2026)
      const budget = await submit(s, 'realignment', 'program', PROGRAMS.AMIA,
        { scope: 'activity_budget', from_activity_id: activity, to_activity_id: other, amount: 50000 }, FY2026)
      await s.as(USERS.amiaAdmin)
      await decide(s, realloc, 'approved')
      await decide(s, budget, 'approved')
      const rows = await s.q<{ amount: string }>(
        `select amount::text from public.allotments where allotment_no = $1 order by amount`,
        ['AR-' + realloc.slice(0, 8)],
      )
      expect(rows.map((r) => r.amount)).toEqual(['-10000.00', '10000.00'])
      const [{ status }] = await s.q<{ status: string }>(`select status from public.savings_entries where id = $1`, [sv])
      expect(status).toBe('confirmed')
      const b = await s.q<{ budget_amount: string }>(
        `select budget_amount::text from public.activities where id in ($1, $2) order by budget_amount`,
        [activity, other],
      )
      expect(b.map((x) => x.budget_amount)).toEqual(['150000.00', '450000.00'])
    })
  })
})

describe('admin actions need the superadmin when configured', () => {
  it('blocks direct cancellations/re-awards by program admins, not by superadmins', async () => {
    await inTx(db, async (s) => {
      const { activity, pkg, other } = await setup(s)
      await s.asAdmin()
      await s.q(`update public.app_settings set value = jsonb_set(value, '{admin_actions_need_superadmin}', 'true') where key = 'approvals'`)
      await s.as(USERS.amiaAdmin)
      await expect(s.q(`select public.set_activity_cancelled($1, true, 'x')`, [activity])).rejects.toThrow(/superadmin approval/)
      await expect(s.q(`select public.reaward_package($1, $2, 1000, 'x')`, [pkg, other])).rejects.toThrow(/superadmin approval/)
      // Ordinary work continues.
      await s.q(`update public.activities set remarks = 'still fine' where id = $1`, [activity])
      await s.as(USERS.superadmin)
      await s.q(`select public.set_activity_cancelled($1, true, 'Superadmin decision')`, [activity])
    })
  })

  it('lets requesters withdraw pending requests', async () => {
    await inTx(db, async (s) => {
      const { activity } = await setup(s)
      await s.as(USERS.amiaStaff1)
      const id = await submit(s, 'cancellation', 'activity', activity)
      await s.as(USERS.amiaAdmin)
      await expect(s.q(`select public.withdraw_approval($1)`, [id])).rejects.toThrow(/own pending/)
      await s.as(USERS.amiaStaff1)
      await s.q(`select public.withdraw_approval($1)`, [id])
      const [r] = await s.q<{ status: string }>(`select status from public.approval_requests where id = $1`, [id])
      expect(r.status).toBe('withdrawn')
    })
  })
})

describe('progress updates and issues', () => {
  it('records progress with a financial snapshot, for program writers only', async () => {
    await inTx(db, async (s) => {
      const { activity } = await setup(s)
      await s.as(USERS.amiaStaff1)
      await s.q(
        `insert into public.progress_updates (activity_id, as_of_date, physical_pct, narrative, status_flag) values ($1, '2026-04-01', 35, 'Training batch 1 done', 'on_track')`,
        [activity],
      )
      await expect(
        s.q(`insert into public.progress_updates (activity_id, as_of_date, physical_pct, narrative) values ($1, '2099-01-01', 40, 'x y z')`, [activity]),
      ).rejects.toThrow(/cannot be in the future/)
      const [p] = await s.q<{ physical_pct: string; created_by: string; obligated_snapshot: string | null }>(
        `select physical_pct::text, created_by, obligated_snapshot::text from public.v_activity_progress where activity_id = $1`,
        [activity],
      )
      expect(p).toMatchObject({ physical_pct: '35.00', created_by: USERS.amiaStaff1 })
      await s.as(USERS.amiaStaff2) // no edit rights
      await expect(
        s.q(`insert into public.progress_updates (activity_id, as_of_date, physical_pct, narrative) values ($1, '2026-04-02', 40, 'x y z')`, [activity]),
      ).rejects.toThrow(/row-level security/)
      await s.as(USERS.hvcAdmin)
      expect(await s.q(`select 1 from public.progress_updates where activity_id = $1`, [activity])).toHaveLength(0)
    })
  })

  it('lets any member raise issues; critical ones reach admins and the superadmin', async () => {
    await inTx(db, async (s) => {
      const { activity } = await setup(s)
      await s.as(USERS.amiaStaff2)
      const [{ id }] = await s.q<{ id: string }>(
        `insert into public.issues (activity_id, title, severity, category, owner_id, due_date) values ($1, 'Bridge washed out', 'critical', 'weather', $2, '2026-04-01') returning id`,
        [activity, USERS.amiaStaff1],
      )
      await s.asAdmin()
      const got = await s.q<{ user_id: string; type: string }>(
        `select user_id, type from public.notifications where entity_id = $1 and (type = 'issue' or type = 'assignment') order by type, user_id`,
        [activity],
      )
      expect(got).toEqual(
        expect.arrayContaining([
          { user_id: USERS.amiaStaff1, type: 'assignment' },
          { user_id: USERS.amiaAdmin, type: 'issue' },
          { user_id: USERS.superadmin, type: 'issue' },
        ]),
      )
      await s.as(USERS.amiaStaff2)
      await expect(s.q(`update public.issues set status = 'resolved' where id = $1`, [id])).rejects.toThrow(/issues_check/)
      await s.q(`update public.issues set status = 'resolved', resolution = 'Detour via Atok' where id = $1`, [id])
      await expect(
        s.q(`insert into public.issues (activity_id, title, owner_id) values ($1, 'Owner from HVC', $2)`, [activity, USERS.hvcStaff1]),
      ).rejects.toThrow(/member of the program/)
    })
  })

  it('reminds about stale approvals, overdue issues and missing progress updates', async () => {
    await inTx(db, async (s) => {
      const { activity } = await setup(s)
      await s.as(USERS.amiaStaff1)
      const req = await submit(s, 'cancellation', 'activity', activity)
      await s.q(`insert into public.issues (activity_id, title, owner_id, due_date) values ($1, 'Late seeds', $2, '2026-03-01')`, [activity, USERS.amiaStaff1])
      await s.asAdmin()
      await s.q(`update public.approval_requests set requested_at = now() - interval '5 days' where id = $1`, [req])
      const [{ r }] = await s.q<{ r: Record<string, number> }>(`select public.run_monitoring_reminders() as r`)
      expect(r.approvals_waiting).toBeGreaterThan(0)
      expect(r.issues_overdue).toBeGreaterThan(0)
      expect(r.progress_due).toBeGreaterThan(0)
    })
  })
})

describe('dev seed (monitoring)', () => {
  it('has progress, issues and approval requests in every state', async () => {
    await inTx(db, async (s) => {
      await s.asAdmin()
      const [c] = await s.q<Record<string, number>>(
        `select (select count(*)::int from public.progress_updates) as progress,
                (select count(*)::int from public.issues where status in ('open', 'mitigating')) as open_issues,
                (select count(*)::int from public.issues where status = 'resolved') as resolved,
                (select count(*)::int from public.issues where severity = 'critical') as critical,
                (select count(*)::int from public.approval_requests where status = 'pending') as pending,
                (select count(*)::int from public.approval_requests where status = 'rejected') as rejected,
                (select count(*)::int from public.approval_requests where status = 'approved') as approved,
                (select count(*)::int from public.approval_requests where request_type = 'supplier_reaward') as reawards`,
      )
      for (const [k, v] of Object.entries(c)) expect(v, k).toBeGreaterThan(0)
    })
  })
})
