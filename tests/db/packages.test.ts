import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const FY2026 = '20000000-0000-4000-8000-000000002026'

/** AMIA activity on the (new) default workflow, created by the AMIA admin. */
async function newActivity(s: Session, extra: Record<string, unknown> = {}) {
  await s.as(USERS.amiaAdmin)
  const cols = {
    program_id: PROGRAMS.AMIA,
    fiscal_year_id: FY2026,
    title: 'Farmers training with suppliers',
    start_date: '2026-03-02',
    budget_amount: 500000,
    responsible_user_id: USERS.amiaStaff1,
    ...extra,
  }
  const keys = Object.keys(cols)
  const [row] = await s.q<{ id: string; code: string }>(
    `insert into public.activities (${keys.join(', ')})
     values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id, code`,
    Object.values(cols),
  )
  return row
}

async function newPackage(s: Session, activityId: string, extra: Record<string, unknown> = {}) {
  const cols = {
    activity_id: activityId,
    title: 'Meals for 40 pax',
    description: 'AM/PM snacks and lunch, 3 days',
    abc_amount: 100000,
    ...extra,
  }
  const keys = Object.keys(cols)
  const [row] = await s.q<{ id: string; code: string; package_no: number }>(
    `insert into public.procurement_packages (${keys.join(', ')})
     values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id, code, package_no`,
    Object.values(cols),
  )
  return row
}

async function newSupplier(s: Session, extra: Record<string, unknown> = {}) {
  const cols = {
    business_name: 'Kabayan Catering Services',
    tin: '123-456-789-000',
    philgeps_no: 'PG-1001',
    philgeps_expiry: '2099-12-31',
    permit_expiry: '2099-12-31',
    ...extra,
  }
  const keys = Object.keys(cols)
  await s.as(USERS.superadmin)
  const [row] = await s.q<{ id: string }>(
    `insert into public.suppliers (${keys.join(', ')})
     values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    Object.values(cols),
  )
  return row.id
}

type Stage = { id: string; name: string; status: string; phase_key: string; sort_order: number }
const track = (s: Session, activityId: string, packageId: string | null) =>
  s.q<Stage>(
    `select id, name, status, phase_key, sort_order from public.activity_stage_progress
     where activity_id = $1 and package_id is not distinct from $2 and parent_id is null order by sort_order`,
    [activityId, packageId],
  )

const act = (s: Session, stageId: string, action: string, note: string | null = null) =>
  s.q(`select (public.activity_stage_action($1, $2, $3)).status`, [stageId, action, note])

/** Ticks a stage's required tasks/fields as postgres, then completes it as `user`. */
async function finish(s: Session, stageId: string, user: string) {
  await s.asAdmin()
  await s.q(`update public.activity_tasks set is_done = true where stage_progress_id = $1`, [stageId])
  await s.as(user)
  await act(s, stageId, 'complete')
}

const award = (s: Session, pkg: string, supplier: string, amount = 90000, reason: string | null = null) =>
  s.q<{ w: { level: string; message: string }[] }>(
    `select public.award_package($1, $2, $3, '2026-03-20', 'PO-2026-001', null, $4) as w`,
    [pkg, supplier, amount, reason],
  )

describe('two-level workflow', () => {
  it('gives new activities the 7-stage lifecycle with a packages stage', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const stages = await track(s, a.id, null)
      expect(stages.map((x) => x.name)).toEqual([
        'Activity Design / Proposal',
        'Review & Approval',
        'Inclusion in PPMP/WFP/APP',
        'Procurement & Implementation',
        'Liquidation / Reporting',
        'Savings / Realignment',
        'Closed / Completed',
      ])
      const [c] = await s.q<{ tracks_packages: boolean }>(
        `select tracks_packages from public.activity_stage_progress where id = $1`,
        [stages[3].id],
      )
      expect(c.tracks_packages).toBe(true)
    })
  })

  it('creates packages with their own code, workflow, checklist and dates', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const p1 = await newPackage(s, a.id)
      const p2 = await newPackage(s, a.id, { title: 'Lodging', abc_amount: 150000 })
      expect([p1.code, p2.code]).toEqual([`${a.code}-P01`, `${a.code}-P02`])

      const stages = await track(s, a.id, p1.id)
      expect(stages).toHaveLength(10)
      expect(stages[0].name).toBe('Requirement / Specifications')
      // Activity track is unchanged by packages.
      expect(await track(s, a.id, null)).toHaveLength(7)

      const [t] = await s.q<{ n: number }>(
        `select count(*)::int as n from public.activity_tasks where package_id = $1 and is_auto`,
        [p1.id],
      )
      expect(t.n).toBe(9) // TOR, PR, RFQ, ABSTRACT, PO, DR, IAR, ORS, DV

      // Packages start when the container stage is planned to start.
      const [{ start, container }] = await s.q<{ start: string; container: string }>(
        `select (select min(planned_start)::text from public.activity_stage_progress where package_id = $1) as start,
                (select planned_start::text from public.activity_stage_progress
                 where activity_id = $2 and tracks_packages) as container`,
        [p1.id, a.id],
      )
      expect(start).toBe(container)

      const [roll] = await s.q<{ packages_total: number; packages_abc_total: string }>(
        `select packages_total::int, packages_abc_total::text from public.v_activities where id = $1`,
        [a.id],
      )
      expect(roll).toEqual({ packages_total: 2, packages_abc_total: '250000.00' })
    })
  })

  it('runs package tracks independently, in their own order', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const p1 = await newPackage(s, a.id)
      const p2 = await newPackage(s, a.id)
      const t1 = await track(s, a.id, p1.id)
      const t2 = await track(s, a.id, p2.id)

      // P02 can start even though P01 and the activity's own stages haven't moved.
      await s.as(USERS.amiaAdmin)
      await act(s, t2[0].id, 'start')
      await expect(act(s, t2[2].id, 'complete')).rejects.toThrow(
        /Finish "Requirement \/ Specifications" first/,
      )
      await finish(s, t2[0].id, USERS.amiaAdmin)
      expect((await track(s, a.id, p2.id))[1].status).toBe('in_progress')
      expect((await track(s, a.id, p1.id))[0].status).toBe('pending')
      expect((await track(s, a.id, null))[0].status).toBe('pending')

      const [pk] = await s.q<{ status: string; current_stage_name: string }>(
        `select status, current_stage_name from public.v_packages where id = $1`,
        [p2.id],
      )
      expect(pk).toEqual({ status: 'ongoing', current_stage_name: 'Purchase Request (PR)' })
      // Activity counts as under way once any track moves.
      const [v] = await s.q<{ status: string }>(`select status from public.activities where id = $1`, [a.id])
      expect(v.status).toBe('ongoing')

      // Award stage needs package fields.
      await s.asAdmin()
      await s.q(
        `update public.procurement_packages set procurement_mode_id = (select id from public.procurement_modes where code = 'SVP') where id = $1`,
        [p1.id],
      )
      for (const st of t1.slice(0, 4)) await finish(s, st.id, USERS.amiaAdmin)
      await s.asAdmin()
      await s.q(`update public.activity_tasks set is_done = true where package_id = $1`, [p1.id])
      await s.as(USERS.amiaAdmin)
      await expect(act(s, t1[4].id, 'complete')).rejects.toThrow(
        /package fields first: supplier_id, contract_amount, award_date/,
      )
    })
  })

  it('moves Obligation before Delivery when configured, until delivery starts', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const p = await newPackage(s, a.id, { obligation_timing: 'before_delivery' })
      const names = (await track(s, a.id, p.id)).map((x) => x.phase_key)
      expect(names.indexOf('obligation')).toBeLessThan(names.indexOf('delivery'))

      await s.as(USERS.amiaAdmin)
      await s.q(`select public.set_package_obligation_timing($1, 'after_delivery')`, [p.id])
      let phases = (await track(s, a.id, p.id)).map((x) => x.phase_key)
      expect(phases.indexOf('obligation')).toBeGreaterThan(phases.indexOf('inspection'))
      await s.q(`select public.set_package_obligation_timing($1, 'before_delivery')`, [p.id])
      phases = (await track(s, a.id, p.id)).map((x) => x.phase_key)
      expect(phases.slice(4, 7)).toEqual(['procurement', 'obligation', 'delivery'])

      await s.asAdmin()
      await s.q(
        `update public.activity_stage_progress set status = 'in_progress' where package_id = $1 and phase_key = 'delivery'`,
        [p.id],
      )
      await s.as(USERS.amiaAdmin)
      await expect(
        s.q(`select public.set_package_obligation_timing($1, 'after_delivery')`, [p.id]),
      ).rejects.toThrow(/already started/)
    })
  })
})

describe('container stage', () => {
  async function toContainer(s: Session, activityId: string) {
    const stages = await track(s, activityId, null)
    await s.asAdmin()
    await s.q(
      `update public.activity_stage_progress set status = 'completed' where activity_id = $1 and package_id is null and sort_order < 4`,
      [activityId],
    )
    await s.q(`update public.activity_stage_progress set status = 'in_progress' where id = $1`, [stages[3].id])
    await s.q(`update public.activities set current_stage_id = $2, status = 'ongoing' where id = $1`, [
      activityId,
      stages[3].id,
    ])
    return stages[3]
  }

  it('needs every package closed, or an admin override with a justification', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const p = await newPackage(s, a.id)
      const container = await toContainer(s, a.id)

      await s.asAdmin()
      await s.q('update public.profiles set can_edit_activities = true where id = $1', [USERS.amiaStaff1])
      await s.as(USERS.amiaStaff1)
      await expect(act(s, container.id, 'complete')).rejects.toThrow(/ask a program admin to override/)
      await s.as(USERS.amiaAdmin)
      await expect(act(s, container.id, 'complete')).rejects.toThrow(/Give a justification/)
      await act(s, container.id, 'complete', 'Lodging supplier will be paid next FY')
      const [tr] = await s.q<{ note: string }>(
        `select note from public.activity_stage_transitions where stage_id = $1 and action = 'complete'`,
        [container.id],
      )
      expect(tr.note).toBe('Override (packages still open): Lodging supplier will be paid next FY')
      expect(p).toBeTruthy()
    })
  })

  it('completes itself when the last open package closes or is cancelled', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const p1 = await newPackage(s, a.id)
      const p2 = await newPackage(s, a.id)
      await toContainer(s, a.id)
      const supplier = await newSupplier(s)

      // Close P01 by running its whole track.
      for (const st of await track(s, a.id, p1.id)) {
        await s.asAdmin()
        await s.q(`update public.activity_tasks set is_done = true where stage_progress_id = $1`, [st.id])
        await s.q(
          `update public.procurement_packages set supplier_id = $2, contract_amount = 90000,
             award_date = '2026-03-20', procurement_mode_id = (select id from public.procurement_modes where code = 'SVP')
           where id = $1`,
          [p1.id, supplier],
        )
        await s.as(USERS.amiaAdmin)
        await act(s, st.id, 'complete')
      }
      const [v1] = await s.q<{ status: string; current_stage_name: string; packages_closed: number }>(
        `select p.status, v.current_stage_name, v.packages_closed::int
         from public.procurement_packages p join public.v_activities v on v.id = p.activity_id where p.id = $1`,
        [p1.id],
      )
      expect(v1).toEqual({
        status: 'closed',
        current_stage_name: 'Procurement & Implementation',
        packages_closed: 1,
      })

      // Cancelling the remaining one closes the container automatically.
      await s.q(`select public.set_package_cancelled($1, true, 'Venue provided by the LGU')`, [p2.id])
      const [v2] = await s.q<{ current_stage_name: string }>(
        `select current_stage_name from public.v_activities where id = $1`,
        [a.id],
      )
      expect(v2.current_stage_name).toBe('Liquidation / Reporting')
    })
  })
})

describe('awards', () => {
  it('blocks blacklisted suppliers, warns on expired papers, records savings', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const p = await newPackage(s, a.id)
      const black = await newSupplier(s, {
        business_name: 'Shady Trading',
        tin: '999-999-999',
        status: 'blacklisted',
        status_reason: 'Non-delivery 2025',
      })
      const expired = await newSupplier(s, {
        business_name: 'Old Papers Enterprise',
        tin: '111-222-333',
        philgeps_expiry: '2020-01-01',
      })

      await s.as(USERS.amiaAdmin)
      await expect(award(s, p.id, black)).rejects.toThrow(/Cannot award: Blacklisted: Non-delivery 2025/)
      const [{ w }] = await award(s, p.id, expired, 85000)
      expect(w.map((x) => x.message)).toEqual(['PhilGEPS registration expired on Jan 1, 2020'])

      const [pk] = await s.q<{ savings_amount: string; supplier_name: string }>(
        `select savings_amount::text, supplier_name from public.v_packages where id = $1`,
        [p.id],
      )
      expect(pk).toEqual({ savings_amount: '15000.00', supplier_name: 'Old Papers Enterprise' })
    })
  })

  it('protects supplier and contract changes; re-award keeps history', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const p = await newPackage(s, a.id)
      const first = await newSupplier(s)
      const second = await newSupplier(s, { business_name: 'Tublay Food Hub', tin: '222-333-444' })

      await s.asAdmin()
      await s.q('update public.profiles set can_edit_activities = true where id = $1', [USERS.amiaStaff1])
      await s.as(USERS.amiaStaff1)
      await expect(
        s.q(`update public.procurement_packages set supplier_id = $2 where id = $1`, [p.id, first]),
      ).rejects.toThrow(/permission denied/)
      await expect(newPackage(s, a.id, { supplier_id: first })).rejects.toThrow(/award it/)
      await award(s, p.id, first, 90000)
      await expect(award(s, p.id, first, 95000)).rejects.toThrow(/needs a program admin/)
      await expect(award(s, p.id, second, 95000)).rejects.toThrow(/Use Re-award/)
      await expect(
        s.q(`select public.reaward_package($1, $2, 95000, 'x')`, [p.id, second]),
      ).rejects.toThrow(/Only program admins/)

      await s.as(USERS.amiaAdmin)
      await s.q(`select public.reaward_package($1, $2, 95000, 'First supplier failed to deliver')`, [
        p.id,
        second,
      ])
      const hist = await s.q<{ action: string; supplier_id: string }>(
        `select action, supplier_id from public.package_supplier_history where package_id = $1 order by created_at`,
        [p.id],
      )
      expect(hist).toEqual([
        { action: 'award', supplier_id: first },
        { action: 're_award', supplier_id: second },
      ])
      // Old supplier can still be rated for this package.
      await s.q(`insert into public.supplier_ratings (package_id, supplier_id, rating, remark) values ($1, $2, 1, 'Did not deliver')`, [
        p.id,
        first,
      ])
      await s.as(USERS.amiaStaff1)
      expect(await s.q(`select 1 from public.supplier_ratings`)).toHaveLength(0)
    })
  })

  it('splits and merges unawarded packages', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const p = await newPackage(s, a.id, { title: 'Supplies', abc_amount: 120000 })
      await s.as(USERS.amiaAdmin)
      const [{ ids }] = await s.q<{ ids: string[] }>(
        `select public.split_package($1, '[{"title":"Office supplies","abc_amount":50000},{"title":"Farm inputs","abc_amount":70000}]', 'Different suppliers') as ids`,
        [p.id],
      )
      expect(ids).toHaveLength(2)
      const [orig] = await s.q<{ status: string; cancelled_reason: string }>(
        `select status, cancelled_reason from public.procurement_packages where id = $1`,
        [p.id],
      )
      expect(orig.status).toBe('cancelled')
      expect(orig.cancelled_reason).toMatch(/^Split into .+-P02, .+-P03: Different suppliers$/)

      const [{ id }] = await s.q<{ id: string }>(
        `select public.merge_packages($1::uuid[], 'All supplies', 'One supplier after all') as id`,
        [ids],
      )
      const [m] = await s.q<{ abc_amount: string; package_no: number }>(
        `select abc_amount::text, package_no from public.procurement_packages where id = $1`,
        [id],
      )
      expect(m).toEqual({ abc_amount: '120000.00', package_no: 4 })
      const [roll] = await s.q<{ packages_total: number; packages_cancelled: number }>(
        `select packages_total::int, packages_cancelled::int from public.v_activities where id = $1`,
        [a.id],
      )
      expect(roll).toEqual({ packages_total: 1, packages_cancelled: 3 })
    })
  })

  it('enforces the activity budget in "block" mode only', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s, { budget_amount: 100000 })
      await newPackage(s, a.id, { abc_amount: 80000 })
      await newPackage(s, a.id, { abc_amount: 50000 }) // warn mode: allowed
      await s.asAdmin()
      await s.q(`update public.app_settings set value = '"block"' where key = 'validation_strictness'`)
      await s.as(USERS.amiaAdmin)
      await expect(newPackage(s, a.id, { abc_amount: 1 })).rejects.toThrow(/exceed the activity budget/)
    })
  })
})

describe('suppliers', () => {
  it('are readable by everyone, editable by admins; bank details are admin-only', async () => {
    await inTx(db, async (s) => {
      const id = await newSupplier(s)
      await s.q(
        `insert into public.supplier_bank_accounts (supplier_id, bank_name, account_name, account_no) values ($1, 'LBP', 'Kabayan Catering', '1234-5678-90')`,
        [id],
      )
      await s.as(USERS.hvcStaff1)
      expect(await s.q('select 1 from public.suppliers where id = $1', [id])).toHaveLength(1)
      expect(await s.q('select 1 from public.supplier_bank_accounts')).toHaveLength(0)
      await expect(
        s.q(`insert into public.suppliers (business_name) values ('Staff Store')`),
      ).rejects.toThrow(/row-level security/)

      await s.as(USERS.hvcAdmin)
      expect(await s.q('select 1 from public.supplier_bank_accounts where supplier_id = $1', [id])).toHaveLength(1)
      await expect(
        s.q(`update public.suppliers set status = 'blacklisted', status_reason = 'x' where id = $1`, [id]),
      ).rejects.toThrow(/Only a superadmin/)
      await s.q(`update public.suppliers set status = 'suspended', status_reason = 'Late deliveries' where id = $1`, [id])
      const [{ w }] = await s.q<{ w: { level: string }[] }>(
        `select public.supplier_award_check($1) as w`,
        [id],
      )
      expect(w).toEqual([{ level: 'warn', message: 'Suspended: Late deliveries' }])
    })
  })

  it('finds duplicates by name or TIN', async () => {
    await inTx(db, async (s) => {
      await newSupplier(s)
      await s.as(USERS.amiaAdmin)
      const byName = await s.q<{ business_name: string }>(
        `select business_name from public.find_similar_suppliers('Kabayan Catering Svcs. Inc.')`,
      )
      expect(byName.map((r) => r.business_name)).toEqual(['Kabayan Catering Services'])
      const byTin = await s.q<{ same_tin: boolean }>(
        `select same_tin from public.find_similar_suppliers('Totally Different', '123456789')`,
      )
      expect(byTin).toEqual([{ same_tin: true }])
      await expect(newSupplier(s, { business_name: 'Clone', tin: '123456789000' })).rejects.toThrow(
        /suppliers_tin_key_idx/,
      )
    })
  })
})

describe('package collaboration', () => {
  it('scopes comments, attachments and notices to the package', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const p = await newPackage(s, a.id, { responsible_user_id: USERS.amiaStaff2 })
      await s.as(USERS.amiaAdmin)
      await s.q(`insert into public.comments (entity_type, entity_id, body) values ('package', $1, 'Quotes are in')`, [
        p.id,
      ])
      await s.asAdmin()
      const [n] = await s.q<{ link: string }>(
        `select link from public.notifications where user_id = $1 and entity_id = $2 and type = 'comment'`,
        [USERS.amiaStaff2, p.id],
      )
      expect(n.link).toMatch(new RegExp(`^/activities/${a.id}/packages/${p.id}\\?tab=discussion#comment-`))

      await s.as(USERS.hvcStaff1)
      await expect(
        s.q(`insert into public.comments (entity_type, entity_id, body) values ('package', $1, 'x')`, [p.id]),
      ).rejects.toThrow(/row-level security/)

      // A PR filed on the package ticks only the package's PR item.
      await s.asAdmin()
      await s.q(
        `insert into public.attachments (program_id, entity_type, entity_id, document_type_id, file_name, r2_key, mime_type, size_bytes, status, version_group_id, uploaded_by)
         values ($1, 'package', $2, (select id from public.document_types where code = 'PR'), 'pr.pdf', gen_random_uuid()::text, 'application/pdf', 10, 'ready', gen_random_uuid(), $3)`,
        [PROGRAMS.AMIA, p.id, USERS.amiaAdmin],
      )
      const [t] = await s.q<{ is_done: boolean }>(
        `select is_done from public.activity_tasks where package_id = $1 and doc_type_code = 'PR'`,
        [p.id],
      )
      expect(t.is_done).toBe(true)
    })
  })

  it('escalates overdue packages and expiring supplier papers in the daily sweep', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const p = await newPackage(s, a.id, { due_date: '2026-04-01' })
      const sup = await newSupplier(s, { permit_expiry: '2026-04-20' })
      await s.as(USERS.amiaAdmin)
      await award(s, p.id, sup)
      await s.asAdmin()
      await s.q(`select public.run_notification_sweep('2026-04-08')`)
      const keys = await s.q<{ user_id: string; dedupe_key: string }>(
        `select user_id, dedupe_key from public.notifications
         where dedupe_key like 'package_overdue:%' or dedupe_key like 'supplier_doc:%' order by dedupe_key, user_id`,
      )
      expect(keys).toEqual(
        expect.arrayContaining([
          { user_id: USERS.amiaStaff1, dedupe_key: `package_overdue:${p.id}:2026-04-01:L2` },
          { user_id: USERS.amiaAdmin, dedupe_key: `package_overdue:${p.id}:2026-04-01:L2` },
          { user_id: USERS.amiaAdmin, dedupe_key: `supplier_doc:${sup}:permit:2026-04-20` },
          { user_id: USERS.superadmin, dedupe_key: `supplier_doc:${sup}:permit:2026-04-20` },
        ]),
      )
      expect(keys.some((k) => k.user_id === USERS.hvcAdmin)).toBe(false)
    })
  })
})

describe('dev seed (Addendum B)', () => {
  it('has suppliers and package scenarios', async () => {
    await inTx(db, async (s) => {
      await s.asAdmin()
      const [c] = await s.q<Record<string, number>>(
        `select (select count(*)::int from public.suppliers) as suppliers,
                (select count(*)::int from public.suppliers where status = 'blacklisted') as blacklisted,
                (select count(*)::int from public.procurement_packages) as packages,
                (select count(*)::int from public.procurement_packages where status = 'closed') as closed,
                (select count(*)::int from public.procurement_packages where status = 'cancelled') as cancelled,
                (select count(*)::int from public.procurement_packages where obligation_timing = 'before_delivery') as obligate_first,
                (select count(*)::int from public.package_supplier_history where action = 're_award') as re_awards,
                (select count(*)::int from public.procurement_packages where savings_amount > 0) as with_savings,
                (select count(*)::int from public.v_packages where is_overdue) as overdue`,
      )
      expect(c.suppliers).toBe(25)
      expect(c.blacklisted).toBe(1)
      expect(c.packages).toBeGreaterThan(40)
      for (const k of ['closed', 'cancelled', 'obligate_first', 're_awards', 'with_savings', 'overdue']) {
        expect(c[k], k).toBeGreaterThan(0)
      }
      // No blacklisted supplier was ever awarded.
      const [b] = await s.q<{ n: number }>(
        `select count(*)::int as n from public.procurement_packages p join public.suppliers s on s.id = p.supplier_id where s.status = 'blacklisted'`,
      )
      expect(b.n).toBe(0)
    })
  })
})
