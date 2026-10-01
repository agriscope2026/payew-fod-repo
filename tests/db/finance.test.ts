import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const FY2026 = '20000000-0000-4000-8000-000000002026'
const FY2027 = '20000000-0000-4000-8000-000000002027'
const ec = (code: string) => `(select id from public.expense_classes where code = '${code}')`

/** AMIA activity (₱500k) with one awarded package (ABC 100k, contract 90k), as the AMIA admin. */
async function setup(s: Session, opts: { timing?: string; contract?: number; ec?: string } = {}) {
  await s.as(USERS.superadmin)
  const [{ id: supplier }] = await s.q<{ id: string }>(
    `insert into public.suppliers (business_name, tin) values ('Finance Test Catering', '555-444-333') returning id`,
  )
  await s.as(USERS.amiaAdmin)
  const [act] = await s.q<{ id: string }>(
    `insert into public.activities (program_id, fiscal_year_id, title, start_date, budget_amount, responsible_user_id)
     values ($1, $2, 'Finance test training', '2026-03-02', 500000, $3) returning id`,
    [PROGRAMS.AMIA, FY2026, USERS.amiaStaff1],
  )
  const [pkg] = await s.q<{ id: string }>(
    `insert into public.procurement_packages (activity_id, title, abc_amount, obligation_timing, expense_class_id)
     values ($1, 'Meals', 100000, $2, ${ec(opts.ec ?? 'MOOE')}) returning id`,
    [act.id, opts.timing ?? 'after_delivery'],
  )
  await s.q(`select public.award_package($1, $2, $3, '2026-03-10')`, [
    pkg.id,
    supplier,
    opts.contract ?? 90000,
  ])
  return { activity: act.id, pkg: pkg.id, supplier }
}

const ors = (s: Session, p: Record<string, unknown>) =>
  s
    .q<{ r: { id: string; warnings: string[] } }>('select public.save_obligation($1) as r', [p])
    .then((x) => x[0].r)

const delivery = (s: Session, p: Record<string, unknown>, items: unknown[] = []) =>
  s
    .q<{ r: { id: string; warnings: string[] } }>('select public.save_delivery($1, $2) as r', [
      p,
      JSON.stringify(items),
    ])
    .then((x) => x[0].r)

const dv = (s: Session, p: Record<string, unknown>, links: unknown[]) =>
  s
    .q<{ r: { id: string; warnings: string[] } }>('select public.save_disbursement($1, $2) as r', [
      p,
      JSON.stringify(links),
    ])
    .then((x) => x[0].r)

async function addAllotment(s: Session, amount: number, code = 'MOOE') {
  await s.as(USERS.amiaAdmin)
  await s.q(
    `insert into public.allotments (program_id, fiscal_year_id, allotment_date, expense_class_id, amount, allotment_no)
     values ($1, $2, '2026-01-15', ${ec(code)}, $3, 'SAA-2026-TEST')`,
    [PROGRAMS.AMIA, FY2026, amount],
  )
}

async function blockMode(s: Session) {
  await s.asAdmin()
  await s.q(`update public.app_settings set value = '"block"' where key = 'validation_strictness'`)
}

describe('obligations', () => {
  it('flags (warn) or blocks over-the-contract and over-the-allotment ORS', async () => {
    await inTx(db, async (s) => {
      // PS has no allotment in the dev seed.
      const { activity, pkg } = await setup(s, { ec: 'PS' })
      const first = await ors(s, {
        activity_id: activity,
        package_id: pkg,
        ors_no: 'ORS-01',
        ors_date: '2026-03-12',
        amount: 60000,
      })
      expect(first.warnings).toEqual([
        expect.stringMatching(/under PS .* exceed the allotment \(₱0.00\)/),
      ])

      await addAllotment(s, 1_000_000, 'PS')
      const second = await ors(s, {
        activity_id: activity,
        package_id: pkg,
        ors_no: 'ORS-02',
        ors_date: '2026-03-12',
        amount: 40000,
      })
      expect(second.warnings).toEqual([
        expect.stringMatching(/exceed the contract amount \(₱90,000.00\)/),
      ])

      await blockMode(s)
      await s.as(USERS.amiaAdmin)
      await expect(
        ors(s, {
          activity_id: activity,
          package_id: pkg,
          ors_no: 'ORS-03',
          ors_date: '2026-03-12',
          amount: 1,
        }),
      ).rejects.toThrow(/exceed the contract amount/)
      await expect(
        ors(s, {
          activity_id: activity,
          package_id: pkg,
          ors_no: 'ors-01',
          ors_date: '2026-03-12',
          amount: 1,
        }),
      ).rejects.toThrow(/already used this fiscal year|exceed/)
    })
  })

  it('defaults payee/expense class from the package and rejects future dates, staff without rights', async () => {
    await inTx(db, async (s) => {
      const { activity, pkg, supplier } = await setup(s)
      await addAllotment(s, 1_000_000)
      const r = await ors(s, {
        activity_id: activity,
        package_id: pkg,
        ors_no: 'ORS-10',
        ors_date: '2026-03-12',
        amount: 1000,
      })
      const [o] = await s.q<{ payee_supplier_id: string; expense_class_id: string | null }>(
        'select payee_supplier_id, expense_class_id from public.obligations where id = $1',
        [r.id],
      )
      expect(o.payee_supplier_id).toBe(supplier)
      expect(o.expense_class_id).not.toBeNull()
      await expect(
        ors(s, { activity_id: activity, ors_no: 'ORS-11', ors_date: '2099-01-01', amount: 1 }),
      ).rejects.toThrow(/cannot be in the future/)
      await s.as(USERS.amiaStaff2)
      await expect(
        ors(s, { activity_id: activity, ors_no: 'ORS-12', ors_date: '2026-03-12', amount: 1 }),
      ).rejects.toThrow(/not allowed/)
      await s.as(USERS.hvcAdmin)
      expect(
        await s.q('select 1 from public.obligations where activity_id = $1', [activity]),
      ).toHaveLength(0)
    })
  })
})

describe('deliveries', () => {
  it('needs an award; flags over-contract and missing IAR', async () => {
    await inTx(db, async (s) => {
      const { activity, pkg } = await setup(s)
      const [{ id: unawarded }] = await s.q<{ id: string }>(
        `insert into public.procurement_packages (activity_id, title, abc_amount) values ($1, 'Lodging', 50000) returning id`,
        [activity],
      )
      await expect(delivery(s, { package_id: unawarded, status: 'scheduled' })).rejects.toThrow(
        /Award the package/,
      )

      const d1 = await delivery(
        s,
        { package_id: pkg, status: 'accepted', delivery_date: '2026-03-20', dr_no: 'DR-1' },
        [{ description: 'Lunch', quantity: 40, unit_cost: 2000 }],
      )
      expect(d1.warnings).toEqual(['Accepted without an IAR number'])
      const [row] = await s.q<{ amount: string; accepted_date: string; delivery_no: number }>(
        'select amount::text, accepted_date::text, delivery_no from public.package_deliveries where id = $1',
        [d1.id],
      )
      expect(row).toEqual({ amount: '80000.00', accepted_date: '2026-03-20', delivery_no: 1 })

      const d2 = await delivery(s, {
        package_id: pkg,
        status: 'partial',
        delivery_date: '2026-03-21',
        amount: 20000,
      })
      expect(d2.warnings[0]).toMatch(/exceed the contract amount \(₱90,000.00\)/)
    })
  })

  it('treats delivery before the ORS as an exception when the package obligates first', async () => {
    await inTx(db, async (s) => {
      const { pkg } = await setup(s, { timing: 'before_delivery' })
      await expect(
        delivery(s, {
          package_id: pkg,
          status: 'delivered',
          delivery_date: '2026-03-20',
          amount: 1000,
        }),
      ).rejects.toThrow(/Record the ORS first, or give a remark/)
      const d = await delivery(s, {
        package_id: pkg,
        status: 'delivered',
        delivery_date: '2026-03-20',
        amount: 1000,
        exception_remark: 'Emergency delivery approved by RED',
      })
      expect(d.warnings).toContain('Delivered before obligation (exception)')
      // Scheduling is never an exception.
      await delivery(s, { package_id: pkg, status: 'scheduled', scheduled_date: '2026-04-01' })
    })
  })
})

describe('disbursements and the package summary', () => {
  it('pays ORS in stages, tracks payables and protects paid ORS', async () => {
    await inTx(db, async (s) => {
      const { activity, pkg } = await setup(s)
      await addAllotment(s, 1_000_000)
      const o1 = await ors(s, {
        activity_id: activity,
        package_id: pkg,
        ors_no: 'ORS-21',
        ors_date: '2026-03-12',
        amount: 90000,
      })
      await delivery(s, {
        package_id: pkg,
        status: 'accepted',
        delivery_date: '2026-03-20',
        iar_no: 'IAR-1',
        amount: 50000,
      })

      await expect(
        dv(
          s,
          {
            activity_id: activity,
            package_id: pkg,
            dv_no: 'DV-1',
            dv_date: '2026-03-25',
            gross_amount: 30000,
          },
          [{ obligation_id: o1.id, amount: 20000 }],
        ),
      ).rejects.toThrow(/must add up to the gross amount/)

      const first = await dv(
        s,
        {
          activity_id: activity,
          package_id: pkg,
          dv_no: 'DV-1',
          dv_date: '2026-03-25',
          gross_amount: 30000,
          tax_withheld: 1500,
        },
        [{ obligation_id: o1.id, amount: 30000 }],
      )
      expect(first.warnings).toEqual([])

      const [sum] = await s.q<Record<string, string>>(
        `select obligated::text, accepted::text, disbursed::text, disbursed_net::text, delivered_unpaid::text,
                obligated_undelivered::text, unobligated_balance::text, paid_pct::text
         from public.v_package_financial_summary where package_id = $1`,
        [pkg],
      )
      expect(sum).toEqual({
        obligated: '90000.00',
        accepted: '50000.00',
        disbursed: '30000.00',
        disbursed_net: '28500.00',
        delivered_unpaid: '20000.00',
        obligated_undelivered: '40000.00',
        unobligated_balance: '0.00',
        paid_pct: '33.3',
      })

      // Paying beyond accepted deliveries is flagged as an advance payment.
      const second = await dv(
        s,
        {
          activity_id: activity,
          package_id: pkg,
          dv_no: 'DV-2',
          dv_date: '2026-03-26',
          gross_amount: 40000,
        },
        [{ obligation_id: o1.id, amount: 40000 }],
      )
      expect(second.warnings).toEqual([expect.stringMatching(/advance payment/)])
      // Overpaying the ORS is flagged (warn) …
      const third = await dv(
        s,
        {
          activity_id: activity,
          package_id: pkg,
          dv_no: 'DV-3',
          dv_date: '2026-03-26',
          gross_amount: 30000,
        },
        [{ obligation_id: o1.id, amount: 30000 }],
      )
      expect(third.warnings[0]).toMatch(
        /ORS ORS-21 would be paid ₱100,000.00, more than its ₱90,000.00/,
      )

      // … and a paid ORS can't be cancelled or cut below what was paid.
      await expect(s.q(`select public.cancel_obligation($1, 'x')`, [o1.id])).rejects.toThrow(
        /Cancel the DVs/,
      )
      await expect(
        ors(s, {
          id: o1.id,
          activity_id: activity,
          package_id: pkg,
          ors_no: 'ORS-21',
          ors_date: '2026-03-12',
          amount: 10000,
        }),
      ).rejects.toThrow(/already been paid/)

      const [act] = await s.q<Record<string, string>>(
        `select obligated::text, disbursed::text, unobligated::text, utilization_pct::text
         from public.v_activity_financials where activity_id = $1`,
        [activity],
      )
      expect(act).toEqual({
        obligated: '90000.00',
        disbursed: '100000.00',
        unobligated: '410000.00',
        utilization_pct: '18.0',
      })
    })
  })

  it('supports activity-level (non-procurement) expenses', async () => {
    await inTx(db, async (s) => {
      const { activity } = await setup(s)
      const o = await ors(s, {
        activity_id: activity,
        ors_no: 'ORS-HON',
        ors_date: '2026-03-12',
        amount: 5000,
        payee_name: 'Resource person',
      })
      await dv(
        s,
        { activity_id: activity, dv_no: 'DV-HON', dv_date: '2026-03-13', gross_amount: 5000 },
        [{ obligation_id: o.id, amount: 5000 }],
      )
      const [a] = await s.q<{ obligated_direct: string; disbursed_direct: string }>(
        'select obligated_direct::text, disbursed_direct::text from public.v_activity_financials where activity_id = $1',
        [activity],
      )
      expect(a).toEqual({ obligated_direct: '5000.00', disbursed_direct: '5000.00' })
    })
  })
})

describe('plans', () => {
  it('saves grid rows, computes amounts and locks approved plans', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const [{ id }] = await s.q<{ id: string }>(
        `select public.ensure_finance_plan($1, $2, 'WFP') as id`,
        [PROGRAMS.AMIA, FY2027],
      )
      const n = await s.q<{ n: number }>(`select public.save_plan_rows($1, $2) as n`, [
        id,
        JSON.stringify([
          { description: 'Meals for training', quantity: 40, unit_cost: 350, m03: 14000 },
          { description: 'Printing of IEC', amount: 12000 },
        ]),
      ])
      expect(n[0].n).toBe(2)
      const rows = await s.q<{ id: string; description: string; amount: string }>(
        'select id, description, amount::text from public.finance_plan_rows where plan_id = $1 order by sort_order',
        [id],
      )
      expect(rows.map((r) => r.amount)).toEqual(['14000.00', '12000.00'])

      // Reorder + edit keeps ids; omitted rows are deleted.
      await s.q(`select public.save_plan_rows($1, $2)`, [
        id,
        JSON.stringify([
          { id: rows[1].id, description: 'Printing of IEC (revised)', amount: 15000 },
        ]),
      ])
      const after = await s.q<{ id: string; description: string }>(
        'select id, description from public.finance_plan_rows where plan_id = $1',
        [id],
      )
      expect(after).toEqual([{ id: rows[1].id, description: 'Printing of IEC (revised)' }])

      await s.q(`select public.set_plan_status($1, 'submitted')`, [id])
      await expect(s.q(`select public.save_plan_rows($1, '[]')`, [id])).rejects.toThrow(
        /This plan is submitted/,
      )
      await s.q(`select public.set_plan_status($1, 'approved')`, [id])

      await s.as(USERS.amiaStaff1)
      await expect(s.q(`select public.set_plan_status($1, 'draft')`, [id])).rejects.toThrow(
        /Only program admins/,
      )
      // Read-only staff see no plan rather than creating one.
      const [{ id: none }] = await s.q<{ id: string | null }>(
        `select public.ensure_finance_plan($1, $2, 'PPMP') as id`,
        [PROGRAMS.AMIA, FY2027],
      )
      expect(none).toBeNull()
    })
  })
})

describe('savings and reminders', () => {
  it('suggests procurement savings on award; admins confirm', async () => {
    await inTx(db, async (s) => {
      const { pkg } = await setup(s, { contract: 85000 })
      const [sv] = await s.q<{ id: string; amount: string; status: string }>(
        `select id, amount::text, status from public.savings_entries where package_id = $1`,
        [pkg],
      )
      expect(sv).toMatchObject({ amount: '15000.00', status: 'suggested' })
      await s.as(USERS.amiaStaff1)
      await expect(s.q(`select public.decide_savings($1, 'confirmed')`, [sv.id])).rejects.toThrow(
        /Only program admins/,
      )
      await s.as(USERS.amiaAdmin)
      await s.q(`select public.decide_savings($1, 'confirmed')`, [sv.id])
      // A contract change needs a fresh decision.
      await s.q(
        `select public.award_package($1, (select supplier_id from public.procurement_packages where id = $1), 88000, null, null, null, 'Added 5 pax')`,
        [pkg],
      )
      const [after] = await s.q<{ amount: string; status: string }>(
        `select amount::text, status from public.savings_entries where package_id = $1`,
        [pkg],
      )
      expect(after).toEqual({ amount: '12000.00', status: 'suggested' })
    })
  })

  it('reminds admins about accepted deliveries left unpaid', async () => {
    await inTx(db, async (s) => {
      const { pkg } = await setup(s)
      await delivery(s, {
        package_id: pkg,
        status: 'accepted',
        delivery_date: '2026-03-20',
        iar_no: 'IAR-9',
        amount: 10000,
      })
      await s.asAdmin()
      // days_outstanding counts from today: accepted 2 days ago → nothing yet.
      await s.q(
        `update public.package_deliveries set accepted_date = public.today_ph() - 2, delivery_date = public.today_ph() - 2 where package_id = $1`,
        [pkg],
      )
      await s.q(`select public.run_finance_reminders()`)
      expect(
        await s.q(
          `select 1 from public.notifications where dedupe_key like 'payment_pending:%' and entity_id = $1`,
          [pkg],
        ),
      ).toHaveLength(0)
      await s.q(
        `update public.package_deliveries set accepted_date = public.today_ph() - 8, delivery_date = public.today_ph() - 8 where package_id = $1`,
        [pkg],
      )
      await s.q(`select public.run_finance_reminders()`)
      const sent = await s.q<{ user_id: string }>(
        `select user_id from public.notifications where dedupe_key like 'payment_pending:%' and entity_id = $1`,
        [pkg],
      )
      expect(sent.map((x) => x.user_id)).toContain(USERS.amiaAdmin)
    })
  })
})

describe('dev seed (finance)', () => {
  it('has allotments, plans and package financials for the B7 scenarios', async () => {
    await inTx(db, async (s) => {
      await s.asAdmin()
      const [c] = await s.q<Record<string, number>>(
        `select (select count(*)::int from public.allotments) as allotments,
                (select count(*)::int from public.finance_plans) as plans,
                (select count(*)::int from public.finance_plan_rows) as plan_rows,
                (select count(*)::int from public.obligations) as ors,
                (select count(*)::int from public.disbursements) as dvs,
                (select count(*)::int from public.package_deliveries where status = 'scheduled') as scheduled,
                (select count(*)::int from public.v_payables) as payables,
                (select count(*)::int from public.v_package_financial_summary where disbursed > 0 and disbursed < ceiling) as staged,
                (select count(*)::int from public.obligations where package_id is null) as direct,
                (select count(*)::int from public.savings_entries) as savings`,
      )
      for (const [k, v] of Object.entries(c)) expect(v, k).toBeGreaterThan(0)
      // Seeded records satisfy the same rules the RPCs enforce.
      const [bad] = await s.q<{ n: number }>(
        `select count(*)::int as n from public.v_package_financial_summary where obligated > ceiling or disbursed > obligated`,
      )
      expect(bad.n).toBe(0)
    })
  })
})
