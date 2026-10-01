import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const FY2026 = '20000000-0000-4000-8000-000000002026'
const DEFAULT_TEMPLATE = '40000000-0000-4000-8000-000000000001'

/** Creates an AMIA activity as the AMIA admin and returns its id. */
async function newActivity(
  s: Session,
  extra: Record<string, unknown> = {},
  as: string = USERS.amiaAdmin,
) {
  await s.as(as)
  const cols = {
    program_id: PROGRAMS.AMIA,
    fiscal_year_id: FY2026,
    title: 'Test activity',
    start_date: '2026-03-02',
    ...extra,
  }
  const keys = Object.keys(cols)
  const [row] = await s.q<{ id: string; code: string }>(
    `insert into public.activities (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id, code`,
    Object.values(cols),
  )
  return row
}

const stages = (s: Session, activityId: string) =>
  s.q<{
    id: string
    name: string
    status: string
    parent_id: string | null
    planned_start: string
    planned_end: string
    sort_order: number
  }>(
    `select id, name, status, parent_id, planned_start::text, planned_end::text, sort_order
     from public.activity_stage_progress where activity_id = $1
     order by coalesce((select p.sort_order from public.activity_stage_progress p where p.id = parent_id), sort_order),
              parent_id nulls first, sort_order`,
    [activityId],
  )

const act = (
  s: Session,
  stageId: string,
  action: string,
  note: string | null = null,
  date: string | null = null,
) =>
  s.q(`select (public.activity_stage_action($1, $2, $3, $4::date)).status`, [
    stageId,
    action,
    note,
    date,
  ])

const topStage = async (s: Session, activityId: string, n: number) =>
  (await stages(s, activityId)).filter((x) => !x.parent_id)[n - 1]

describe('activity creation', () => {
  it('assigns a program/year code and instantiates the default workflow with planned dates', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      expect(a.code).toMatch(/^AMIA-2026-\d{4}$/)

      const rows = await stages(s, a.id)
      const top = rows.filter((r) => !r.parent_id)
      expect(top).toHaveLength(11)
      expect(rows.filter((r) => r.parent_id)).toHaveLength(5)
      expect(top[0]).toMatchObject({
        name: 'Activity Design / Proposal',
        planned_start: '2026-03-02',
        planned_end: '2026-03-08',
      })
      expect(top[1].planned_start).toBe('2026-03-09') // stages run back to back

      const [{ n }] = await s.q<{ n: number }>(
        'select count(*)::int as n from public.activity_tasks where activity_id = $1 and is_auto and is_required',
        [a.id],
      )
      expect(n).toBe(10) // DESIGN, PPMP, PR, RFQ, PO, IAR, ORS, DV, LIQ, REPORT

      const [v] = await s.q<{ status: string; current_stage_name: string; display_status: string }>(
        'select status, current_stage_name, display_status from public.v_activities where id = $1',
        [a.id],
      )
      expect(v).toEqual({
        status: 'not_started',
        current_stage_name: 'Activity Design / Proposal',
        display_status: 'delayed',
      })
    })
  })

  it('re-plans stage dates when the start date moves', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await s.q(`update public.activities set start_date = '2026-04-01' where id = $1`, [a.id])
      const first = await topStage(s, a.id, 1)
      expect(first.planned_start).toBe('2026-04-01')
    })
  })

  it('is invisible to other programs and read-only staff cannot create', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await s.as(USERS.hvcAdmin)
      expect(await s.q('select id from public.activities where id = $1', [a.id])).toHaveLength(0)
      expect(
        await s.q('select id from public.activity_stage_progress where activity_id = $1', [a.id]),
      ).toHaveLength(0)
      await expect(newActivity(s, {}, USERS.amiaStaff1)).rejects.toThrow(/row-level security/)
    })
  })

  it('respects fiscal-year locks', async () => {
    await inTx(db, async (s) => {
      await s.asAdmin()
      await s.q(`update public.fiscal_years set status = 'locked' where id = $1`, [FY2026])
      await expect(newActivity(s)).rejects.toThrow(/locked/)
    })
  })
})

describe('stage actions', () => {
  it('enforces required fields and checklist items, then advances', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const design = await topStage(s, a.id, 1)

      await expect(act(s, design.id, 'complete')).rejects.toThrow(
        /Fill in these activity fields first: description, objectives, target_output, budget_amount/,
      )
      await s.q(
        `update public.activities set description = 'd', objectives = 'o', target_output = 't', budget_amount = 1000 where id = $1`,
        [a.id],
      )
      await expect(act(s, design.id, 'complete')).rejects.toThrow(/1 required checklist item/)
      await s.q(`update public.activity_tasks set is_done = true where stage_progress_id = $1`, [
        design.id,
      ])
      await act(s, design.id, 'complete', null, '2026-03-05')

      const [v] = await s.q<{ status: string; current_stage_name: string; stages_done: number }>(
        'select status, current_stage_name, stages_done::int from public.v_activities where id = $1',
        [a.id],
      )
      expect(v).toEqual({
        status: 'ongoing',
        current_stage_name: 'Review & Approval',
        stages_done: 1,
      })
      const review = await topStage(s, a.id, 2)
      expect(review.status).toBe('in_progress')

      const log = await s.q<{ action: string; stage_name: string }>(
        'select action, stage_name from public.activity_stage_transitions where activity_id = $1',
        [a.id],
      )
      expect(log).toEqual([{ action: 'complete', stage_name: 'Activity Design / Proposal' }])
    })
  })

  it('blocks out-of-order moves, future dates and unauthorized users', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const third = await topStage(s, a.id, 3)
      const first = await topStage(s, a.id, 1)
      await expect(act(s, third.id, 'complete')).rejects.toThrow(/earlier stages first/)
      await expect(act(s, first.id, 'start', null, '2099-01-01')).rejects.toThrow(/future/)

      await s.as(USERS.amiaStaff1) // read-only staff
      await expect(act(s, first.id, 'start')).rejects.toThrow(/not allowed/)
      await s.asAdmin()
      await s.q('update public.profiles set can_edit_activities = true where id = $1', [
        USERS.amiaStaff1,
      ])
      await s.as(USERS.amiaStaff1)
      await act(s, first.id, 'start')
    })
  })

  it('skips only skippable stages (with a reason) and their sub-steps', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await s.asAdmin()
      // Fast-forward: finish stages 1–3 directly.
      await s.q(
        `update public.activity_stage_progress set status = 'completed' where activity_id = $1 and parent_id is null and sort_order <= 3`,
        [a.id],
      )
      const procurement = await topStage(s, a.id, 4)
      await s.q('update public.activities set current_stage_id = $2 where id = $1', [
        a.id,
        procurement.id,
      ])
      await s.as(USERS.amiaAdmin)

      await expect(act(s, procurement.id, 'skip')).rejects.toThrow(/reason/)
      await act(s, procurement.id, 'skip', 'Training: no procurement needed')
      const rows = await stages(s, a.id)
      expect(rows.filter((r) => r.parent_id).every((r) => r.status === 'skipped')).toBe(true)

      const delivery = await topStage(s, a.id, 5)
      expect(delivery.status).toBe('in_progress')
      await s.q(`update public.activity_tasks set is_done = true where activity_id = $1`, [a.id])
      await act(s, delivery.id, 'complete')
      const inspection = await topStage(s, a.id, 6)
      await act(s, inspection.id, 'skip', 'No deliveries')
      const obligation = await topStage(s, a.id, 7)
      await expect(act(s, obligation.id, 'skip', 'x')).rejects.toThrow(/cannot be skipped/)
    })
  })

  it('reopen is admin-only and resets later stages; finishing all completes the activity', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s, {
        description: 'd',
        objectives: 'o',
        target_output: 't',
        budget_amount: 5,
        fund_source_id: null,
      })
      await s.asAdmin()
      const [{ id: fund }] = await s.q<{ id: string }>(
        `select id from public.fund_sources where code = 'GAA'`,
      )
      await s.q('update public.activities set fund_source_id = $2 where id = $1', [a.id, fund])
      await s.q(`update public.activity_tasks set is_done = true where activity_id = $1`, [a.id])
      await s.as(USERS.amiaAdmin)

      for (let i = 1; i <= 11; i++) {
        const st = await topStage(s, a.id, i)
        if (st.name === 'Procurement') {
          for (const sub of (await stages(s, a.id)).filter((r) => r.parent_id === st.id))
            await act(s, sub.id, 'complete')
        }
        await act(s, st.id, 'complete')
      }
      let [v] = await s.q<{ status: string; current_stage_id: string | null }>(
        'select status, current_stage_id from public.activities where id = $1',
        [a.id],
      )
      expect(v).toEqual({ status: 'completed', current_stage_id: null })

      const approval = await topStage(s, a.id, 2)
      await s.asAdmin()
      await s.q('update public.profiles set can_edit_activities = true where id = $1', [
        USERS.amiaStaff1,
      ])
      await s.as(USERS.amiaStaff1)
      await expect(act(s, approval.id, 'reopen', 'redo')).rejects.toThrow(/Only program admins/)
      await s.as(USERS.amiaAdmin)
      await act(s, approval.id, 'reopen', 'Budget revised, needs re-approval')
      ;[v] = await s.q('select status, current_stage_id from public.activities where id = $1', [
        a.id,
      ])
      expect(v).toEqual({ status: 'ongoing', current_stage_id: approval.id })
      const later = (await stages(s, a.id)).filter((r) => !r.parent_id && r.sort_order > 2)
      expect(later.every((r) => r.status === 'pending')).toBe(true)
    })
  })
})

describe('documents tick checklist items', () => {
  it('a ready attachment of the required type completes the task', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await s.asAdmin()
      await s.q(
        `insert into public.attachments (program_id, entity_type, entity_id, document_type_id, file_name, r2_key, mime_type, size_bytes, status, version_group_id, uploaded_by)
         values ($1, 'activity', $2, (select id from public.document_types where code = 'DESIGN'), 'design.pdf', gen_random_uuid()::text, 'application/pdf', 10, 'ready', gen_random_uuid(), $3)`,
        [PROGRAMS.AMIA, a.id, USERS.amiaAdmin],
      )
      const [t] = await s.q<{ is_done: boolean }>(
        `select is_done from public.activity_tasks where activity_id = $1 and doc_type_code = 'DESIGN'`,
        [a.id],
      )
      expect(t.is_done).toBe(true)
    })
  })

  it('uploads to an activity must use its own program', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await s.as(USERS.superadmin)
      const ok = async (program: string) =>
        (
          await s.q<{ ok: boolean }>(
            `select public.can_upload_attachment($1, 'activity', $2) as ok`,
            [program, a.id],
          )
        )[0].ok
      expect(await ok(PROGRAMS.AMIA)).toBe(true)
      expect(await ok(PROGRAMS.HVC)).toBe(false)
    })
  })
})

describe('workflow templates', () => {
  it('programs copy, edit and use their own workflows; snapshots stay frozen until migrated', async () => {
    await inTx(db, async (s) => {
      const old = await newActivity(s)
      await s.as(USERS.amiaAdmin)
      const [{ id: tpl }] = await s.q<{ id: string }>(
        `select public.create_workflow_template($1, 'AMIA Training Flow') as id`,
        [PROGRAMS.AMIA],
      )
      await s.q(`select public.save_workflow_template($1, 'AMIA Training Flow', null, $2::jsonb)`, [
        tpl,
        JSON.stringify([
          { name: 'Activity Design / Proposal', phase_key: 'design', expected_days: 3 },
          {
            name: 'Conduct Training',
            phase_key: 'delivery',
            expected_days: 2,
            required_fields: ['beneficiaries'],
          },
          {
            name: 'Liquidation / Reporting',
            phase_key: 'liquidation',
            expected_days: 5,
            required_documents: ['REPORT'],
          },
        ]),
      ])
      // The program's first template became its default.
      const [{ is_default }] = await s.q<{ is_default: boolean }>(
        'select is_default from public.workflow_templates where id = $1',
        [tpl],
      )
      expect(is_default).toBe(true)

      const fresh = await newActivity(s)
      expect((await stages(s, fresh.id)).map((r) => r.name)).toEqual([
        'Activity Design / Proposal',
        'Conduct Training',
        'Liquidation / Reporting',
      ])
      expect(await stages(s, old.id)).toHaveLength(16) // untouched snapshot

      // Migrating keeps finished stages that exist in both workflows.
      const design = await topStage(s, old.id, 1)
      await s.asAdmin()
      await s.q(
        `update public.activity_stage_progress set status = 'completed', actual_end = '2026-03-04' where id = $1`,
        [design.id],
      )
      await s.as(USERS.amiaAdmin)
      await s.q('select public.apply_workflow_to_activity($1, $2)', [old.id, tpl])
      const migrated = await stages(s, old.id)
      expect(migrated.map((r) => [r.name, r.status])).toEqual([
        ['Activity Design / Proposal', 'completed'],
        ['Conduct Training', 'pending'],
        ['Liquidation / Reporting', 'pending'],
      ])
      const [v] = await s.q<{ current_stage_name: string; status: string }>(
        'select current_stage_name, status from public.v_activities where id = $1',
        [old.id],
      )
      expect(v).toEqual({ current_stage_name: 'Conduct Training', status: 'ongoing' })
    })
  })

  it('only managers of the scope can manage workflows; the DA-wide default cannot be archived', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.hvcAdmin)
      await expect(
        s.q(`select public.create_workflow_template($1, 'X')`, [PROGRAMS.AMIA]),
      ).rejects.toThrow(/cannot manage/)
      await expect(
        s.q(`select public.save_workflow_template($1, 'X', null, '[{"name":"a"}]'::jsonb)`, [
          DEFAULT_TEMPLATE,
        ]),
      ).rejects.toThrow(/cannot manage/)
      await s.as(USERS.superadmin)
      await expect(
        s.q('update public.workflow_templates set is_active = false where id = $1', [
          DEFAULT_TEMPLATE,
        ]),
      ).rejects.toThrow(/cannot be archived/)
    })
  })

  it('activities cannot use another program’s workflow', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.hvcAdmin)
      const [{ id: tpl }] = await s.q<{ id: string }>(
        `select public.create_workflow_template($1, 'HVC Flow') as id`,
        [PROGRAMS.HVC],
      )
      await expect(newActivity(s, { workflow_template_id: tpl })).rejects.toThrow(/does not belong/)
    })
  })
})

describe('cancellation & overdue', () => {
  it('admins cancel with a reason; v_activities reports overdue days', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s, { due_date: '2026-01-15' })
      const [v] = await s.q<{ is_overdue: boolean; days_overdue: number; display_status: string }>(
        'select is_overdue, days_overdue, display_status from public.v_activities where id = $1',
        [a.id],
      )
      expect(v.is_overdue).toBe(true)
      expect(v.days_overdue).toBeGreaterThan(0)
      expect(v.display_status).toBe('delayed')

      await expect(
        s.q(`select public.set_activity_cancelled($1, true, null)`, [a.id]),
      ).rejects.toThrow(/reason/)
      await s.q(`select public.set_activity_cancelled($1, true, 'Funds realigned')`, [a.id])
      const [c] = await s.q<{ display_status: string; is_overdue: boolean }>(
        'select display_status, is_overdue from public.v_activities where id = $1',
        [a.id],
      )
      expect(c).toEqual({ display_status: 'cancelled', is_overdue: false })
      const first = await topStage(s, a.id, 1)
      await expect(act(s, first.id, 'start')).rejects.toThrow(/cancelled/)
    })
  })

  it('clients cannot set status directly', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await expect(
        s.q(`update public.activities set status = 'completed' where id = $1`, [a.id]),
      ).rejects.toThrow(/permission denied/)
    })
  })
})
