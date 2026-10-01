import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const FY2026 = '20000000-0000-4000-8000-000000002026'

/** AMIA activity created by the AMIA admin, responsible: AMIA staff 1. */
async function newActivity(s: Session, extra: Record<string, unknown> = {}) {
  await s.as(USERS.amiaAdmin)
  const cols = {
    program_id: PROGRAMS.AMIA,
    fiscal_year_id: FY2026,
    title: 'Collaboration test activity',
    start_date: '2026-01-05',
    due_date: '2026-02-01',
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

async function comment(
  s: Session,
  entityId: string,
  body: string,
  opts: { parent?: string; mentions?: string[]; type?: string } = {},
) {
  const [row] = await s.q<{ id: string; parent_id: string | null; mentions: string[] }>(
    `insert into public.comments (entity_type, entity_id, body, parent_id, mentions)
     values ($1, $2, $3, $4, $5) returning id, parent_id, mentions`,
    [opts.type ?? 'activity', entityId, body, opts.parent ?? null, opts.mentions ?? []],
  )
  return row
}

/** Notifications of a user about an entity (read as postgres). */
async function inbox(s: Session, userId: string, entityId?: string, type?: string) {
  await s.asAdmin()
  return s.q<{ type: string; title: string; link: string; dedupe_key: string | null }>(
    `select type, title, link, dedupe_key from public.notifications
     where user_id = $1 and ($2::uuid is null or entity_id = $2) and ($3::text is null or type = $3)
     order by created_at`,
    [userId, entityId ?? null, type ?? null],
  )
}

describe('comments', () => {
  it('lets program members discuss, notifies the responsible person and @mentions', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await s.as(USERS.amiaAdmin)
      const c = await comment(s, a.id, 'Please upload the PR. @Liza @Ramon', {
        // Ramon (HVC admin) cannot see AMIA records: silently dropped.
        mentions: [USERS.amiaStaff2, USERS.hvcAdmin],
      })
      expect(c.mentions).toEqual([USERS.amiaStaff2])

      const mention = await inbox(s, USERS.amiaStaff2, a.id, 'mention')
      expect(mention).toHaveLength(1)
      expect(mention[0].link).toBe(`/activities/${a.id}?tab=discussion#comment-${c.id}`)
      // Responsible person gets a comment notification (not a duplicate for mentions).
      expect(await inbox(s, USERS.amiaStaff1, a.id, 'comment')).toHaveLength(1)
      expect(await inbox(s, USERS.amiaStaff2, a.id, 'comment')).toHaveLength(0)
      expect(await inbox(s, USERS.hvcAdmin, a.id)).toHaveLength(0)
      // Author never notifies themselves.
      expect(await inbox(s, USERS.amiaAdmin, a.id, 'comment')).toHaveLength(0)
    })
  })

  it('flattens replies to one level and notifies the thread', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await s.as(USERS.amiaStaff2)
      const root = await comment(s, a.id, 'Root')
      await s.as(USERS.amiaStaff1)
      const reply = await comment(s, a.id, 'Reply', { parent: root.id })
      await s.as(USERS.amiaAdmin)
      const nested = await comment(s, a.id, 'Reply to reply', { parent: reply.id })
      expect(nested.parent_id).toBe(root.id)

      const staff2 = await inbox(s, USERS.amiaStaff2, a.id, 'comment')
      expect(staff2.map((n) => n.title)).toEqual([
        expect.stringContaining('replied on'),
        expect.stringContaining('replied on'),
      ])
    })
  })

  it('blocks outsiders and enforces author/admin rules', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await s.as(USERS.amiaStaff1)
      const c = await comment(s, a.id, 'Mine')

      await s.as(USERS.hvcStaff1)
      await expect(comment(s, a.id, 'Sneaky')).rejects.toThrow(/row-level security/)
      expect(await s.q('select 1 from public.comments where id = $1', [c.id])).toHaveLength(0)

      // Another member cannot edit or delete it.
      await s.as(USERS.amiaStaff2)
      expect(
        await s.q(`update public.comments set body = 'hacked' where id = $1 returning id`, [c.id]),
      ).toHaveLength(0)
      const none = await s.q(`update public.comments set deleted_at = now() where id = $1 returning id`, [c.id])
      expect(none).toHaveLength(0)

      // Author edits (stamps edited_at); program admin can delete but not edit.
      await s.as(USERS.amiaStaff1)
      const [edited] = await s.q<{ edited_at: string | null }>(
        `update public.comments set body = 'Mine, edited' where id = $1 returning edited_at`,
        [c.id],
      )
      expect(edited.edited_at).not.toBeNull()
      await s.as(USERS.amiaAdmin)
      await expect(
        s.q(`update public.comments set body = 'admin rewrite' where id = $1`, [c.id]),
      ).rejects.toThrow(/Only the author/)
      const [deleted] = await s.q<{ deleted_by: string }>(
        `update public.comments set deleted_at = now() where id = $1 returning deleted_by`,
        [c.id],
      )
      expect(deleted.deleted_by).toBe(USERS.amiaAdmin)

      // Deleted comments disappear for members.
      await s.as(USERS.amiaStaff2)
      expect(await s.q('select 1 from public.comments where id = $1', [c.id])).toHaveLength(0)
    })
  })

  it('works on shared beneficiary records for every active user', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.hvcStaff1)
      const [b] = await s.q<{ id: string }>(
        `select id from public.beneficiaries where deleted_at is null limit 1`,
      )
      const c = await comment(s, b.id, 'Visited them last week', {
        type: 'beneficiary',
        mentions: [USERS.amiaStaff1],
      })
      expect(c.mentions).toEqual([USERS.amiaStaff1])
      expect(await inbox(s, USERS.amiaStaff1, b.id, 'mention')).toHaveLength(1)
    })
  })

  it('respects muted notification types', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await s.as(USERS.amiaStaff1)
      await s.q(
        `update public.profiles set notification_prefs = '{"muted": ["comment"]}' where id = $1`,
        [USERS.amiaStaff1],
      )
      await s.as(USERS.amiaAdmin)
      await comment(s, a.id, 'Muted for staff 1')
      expect(await inbox(s, USERS.amiaStaff1, a.id, 'comment')).toHaveLength(0)
    })
  })
})

describe('notes', () => {
  it('keeps private notes private and shares program notes', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await s.as(USERS.amiaStaff1)
      const [priv] = await s.q<{ id: string }>(
        `insert into public.notes (entity_type, entity_id, body) values ('activity', $1, 'private') returning id`,
        [a.id],
      )
      const [shared] = await s.q<{ id: string }>(
        `insert into public.notes (entity_type, entity_id, body, visibility)
         values ('activity', $1, 'shared', 'program') returning id`,
        [a.id],
      )

      await s.as(USERS.amiaStaff2)
      const seen = await s.q<{ id: string }>(
        `select id from public.notes where entity_id = $1`,
        [a.id],
      )
      expect(seen.map((n) => n.id)).toEqual([shared.id])
      expect(
        await s.q(`update public.notes set body = 'x' where id = $1 returning id`, [shared.id]),
      ).toHaveLength(0)

      await s.as(USERS.hvcAdmin)
      expect(await s.q(`select id from public.notes where entity_id = $1`, [a.id])).toHaveLength(0)

      // Admins may remove shared notes but never see private ones.
      await s.as(USERS.amiaAdmin)
      expect(
        await s.q(`delete from public.notes where id = $1 returning id`, [shared.id]),
      ).toHaveLength(1)
      expect(
        await s.q(`delete from public.notes where id = $1 returning id`, [priv.id]),
      ).toHaveLength(0)
    })
  })
})

const issue = (
  s: Session,
  recipients: string[],
  extra: { due?: string | null; entity?: string | null; program?: string } = {},
) =>
  s.q<{ id: string }>(
    `select public.issue_directive($1, $2, $3, $4::uuid[], $5::date, 'high', $6, $7) as id`,
    [
      extra.program ?? PROGRAMS.AMIA,
      'Submit the Q3 accomplishment report',
      'Please submit by Friday.',
      recipients,
      extra.due ?? null,
      extra.entity ? 'activity' : null,
      extra.entity ?? null,
    ],
  )

describe('directives', () => {
  it('only admins issue them, to members of the program', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      await expect(issue(s, [USERS.amiaStaff2])).rejects.toThrow(/Only program admins/)

      await s.as(USERS.amiaAdmin)
      await expect(issue(s, [USERS.hvcStaff1])).rejects.toThrow(/Not active members/)
      await expect(issue(s, [USERS.amiaAdmin])).rejects.toThrow(/yourself/)
      await expect(issue(s, [])).rejects.toThrow(/at least one/)
      await expect(issue(s, [USERS.amiaStaff1], { due: '2020-01-01' })).rejects.toThrow(/past/)
      await expect(issue(s, [USERS.hvcStaff1], { program: PROGRAMS.HVC })).rejects.toThrow(
        /Only program admins/,
      )
    })
  })

  it('runs acknowledge → respond → close with notifications and visibility', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const [{ id }] = await issue(s, [USERS.amiaStaff1, USERS.amiaStaff2], { due: '2099-01-31' })
      expect(await inbox(s, USERS.amiaStaff1, id, 'directive')).toHaveLength(1)

      // Recipients and managers see it; other programs don't.
      await s.as(USERS.hvcAdmin)
      expect(await s.q('select 1 from public.directives where id = $1', [id])).toHaveLength(0)
      await s.as(USERS.superadmin)
      expect(await s.q('select 1 from public.directives where id = $1', [id])).toHaveLength(1)

      await s.as(USERS.amiaStaff1)
      await s.q('select public.acknowledge_directive($1)', [id])
      await s.q(`select public.respond_to_directive($1, 'Submitted today.', '2099-02-15')`, [id])
      const [v] = await s.q<{
        recipients_total: number
        acknowledged_count: number
        responded_count: number
        my_status: string
      }>(
        'select recipients_total::int, acknowledged_count::int, responded_count::int, my_status from public.v_directives where id = $1',
        [id],
      )
      expect(v).toEqual({
        recipients_total: 2,
        acknowledged_count: 1,
        responded_count: 1,
        my_status: 'responded',
      })
      const toIssuer = await inbox(s, USERS.amiaAdmin, id, 'directive')
      expect(toIssuer[0].title).toMatch(/responded/)

      // Recipients cannot close; the issuer can, then it's read-only.
      await s.as(USERS.amiaStaff1)
      await expect(s.q('select public.close_directive($1)', [id])).rejects.toThrow(/Only the issuer/)
      await s.as(USERS.amiaAdmin)
      await s.q(`select public.close_directive($1, 'Thanks')`, [id])
      await s.as(USERS.amiaStaff2)
      await expect(s.q('select public.acknowledge_directive($1)', [id])).rejects.toThrow(/no longer open/)

      // Discussion on the directive reaches issuer and recipients.
      await comment(s, id, 'Late, sorry', { type: 'directive' })
      expect(await inbox(s, USERS.amiaAdmin, id, 'comment')).toHaveLength(1)
      expect(await inbox(s, USERS.amiaStaff1, id, 'comment')).toHaveLength(1)
      await s.as(USERS.hvcStaff1)
      await expect(comment(s, id, 'x', { type: 'directive' })).rejects.toThrow(/row-level security/)
    })
  })

  it('cannot be written directly', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      await expect(
        s.q(
          `insert into public.directives (program_id, title, body) values ($1, 'Direct', 'x')`,
          [PROGRAMS.AMIA],
        ),
      ).rejects.toThrow(/permission denied/)
    })
  })
})

describe('overdue notices', () => {
  it('prefills from the template and sends a directive linked to the activity', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await s.as(USERS.amiaAdmin)
      const [{ draft }] = await s.q<{
        draft: { title: string; body: string; recipients: string[]; days_overdue: number }
      }>('select public.overdue_notice_draft($1) as draft', [a.id])
      expect(draft.title).toBe('Overdue activity: Collaboration test activity')
      expect(draft.body).toMatch(/was due on Feb 1, 2026 \(\d+ days overdue\)/)
      expect(draft.recipients).toEqual([USERS.amiaStaff1])

      const [{ id }] = await s.q<{ id: string }>(
        'select public.send_overdue_notice($1, $2::uuid[]) as id',
        [a.id, draft.recipients],
      )
      const [d] = await s.q<{ kind: string; entity_id: string; entity_code: string }>(
        'select kind, entity_id, entity_code from public.v_directives where id = $1',
        [id],
      )
      expect(d).toEqual({ kind: 'overdue_notice', entity_id: a.id, entity_code: a.code })
      const [n] = await inbox(s, USERS.amiaStaff1, id, 'directive')
      expect(n.title).toMatch(/^Overdue notice from/)

      await s.as(USERS.amiaStaff1)
      await expect(
        s.q('select public.overdue_notice_draft($1)', [a.id]),
      ).rejects.toThrow(/Only program admins/)
    })
  })

  it('refuses activities that are on schedule', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s, { start_date: '2099-01-05', due_date: '2099-12-31' })
      await s.as(USERS.amiaAdmin)
      await expect(s.q('select public.overdue_notice_draft($1)', [a.id])).rejects.toThrow(
        /not overdue/,
      )
    })
  })
})

describe('assignment notifications', () => {
  it('tells people when they are made responsible or assigned a checklist item', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s, { responsible_user_id: null })
      await s.as(USERS.amiaAdmin)
      await s.q('update public.activities set responsible_user_id = $2 where id = $1', [
        a.id,
        USERS.amiaStaff2,
      ])
      expect(await inbox(s, USERS.amiaStaff2, a.id, 'assignment')).toHaveLength(1)

      await s.as(USERS.amiaAdmin)
      await s.q(
        `insert into public.activity_tasks (activity_id, title, assigned_to) values ($1, 'Canvass suppliers', $2)`,
        [a.id, USERS.amiaStaff1],
      )
      const [n] = await inbox(s, USERS.amiaStaff1, a.id, 'assignment')
      expect(n.title).toBe('Checklist item assigned to you: Canvass suppliers')
    })
  })
})

describe('notification sweep', () => {
  const sweep = (s: Session, day: string) =>
    s.q<{ r: Record<string, number> }>('select public.run_notification_sweep($1::date) as r', [day])

  it('escalates overdue activities by level and never repeats a notice', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      const overdueFor = (user: string) =>
        inbox(s, user, a.id).then((rows) =>
          rows.filter((r) => r.dedupe_key?.startsWith('activity_overdue')),
        )

      await s.asAdmin()
      await sweep(s, '2026-02-02') // 1 day late → level 1
      expect((await overdueFor(USERS.amiaStaff1)).map((n) => n.type)).toEqual(['overdue'])
      expect(await overdueFor(USERS.amiaAdmin)).toHaveLength(0)

      await s.asAdmin()
      await sweep(s, '2026-02-03') // still level 1 → nothing new
      expect(await overdueFor(USERS.amiaStaff1)).toHaveLength(1)

      await s.asAdmin()
      await sweep(s, '2026-02-08') // 7 days → level 2: program admins too
      expect(await overdueFor(USERS.amiaStaff1)).toHaveLength(2)
      const admin = await overdueFor(USERS.amiaAdmin)
      expect(admin.map((n) => n.type)).toEqual(['escalation'])
      expect(admin[0].title).toMatch(/level 2/)
      expect(await overdueFor(USERS.superadmin)).toHaveLength(0)

      await s.asAdmin()
      await sweep(s, '2026-03-03') // 30 days → level 3: superadmins
      expect(await overdueFor(USERS.superadmin)).toHaveLength(1)
      expect(await overdueFor(USERS.hvcAdmin)).toHaveLength(0)
    })
  })

  it('reminds and escalates unanswered directives', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const [{ id }] = await issue(s, [USERS.amiaStaff1, USERS.amiaStaff2], { due: '2099-03-10' })
      await s.as(USERS.amiaStaff2)
      await s.q(`select public.respond_to_directive($1, 'Done')`, [id])

      const keys = async (user: string) =>
        (await inbox(s, user, id)).map((n) => n.dedupe_key).filter(Boolean)

      await s.asAdmin()
      await sweep(s, '2099-03-09')
      expect(await keys(USERS.amiaStaff1)).toEqual([`directive_due:${id}:2099-03-10`])
      expect(await keys(USERS.amiaStaff2)).toEqual([]) // already responded

      await s.asAdmin()
      await sweep(s, '2099-03-11') // level 1: recipient + issuer
      expect(await keys(USERS.amiaStaff1)).toHaveLength(2)
      expect(await keys(USERS.amiaAdmin)).toEqual([
        `directive_overdue:${id}:${USERS.amiaStaff1}:L1`,
      ])

      await s.asAdmin()
      await sweep(s, '2099-03-17') // level 3: superadmin; issuer (also admin) not doubled
      expect(await keys(USERS.superadmin)).toEqual([
        `directive_overdue:${id}:${USERS.amiaStaff1}:L3`,
      ])
      expect(await keys(USERS.amiaAdmin)).toHaveLength(2)
      const [d] = await s.q<{ escalation_level: number }>(
        'select escalation_level from public.directives where id = $1',
        [id],
      )
      expect(d.escalation_level).toBe(3)
    })
  })

  it('can be run on demand by the superadmin only', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      await expect(sweep(s, '2026-02-02')).rejects.toThrow(/Only the superadmin/)
      await s.as(USERS.superadmin)
      const [{ r }] = await sweep(s, '2026-02-02')
      expect(r).toMatchObject({ date: '2026-02-02' })
    })
  })
})

describe('dev seed', () => {
  it('gives staff an inbox and keeps other programs out', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      const mine = await s.q<{ title: string; my_status: string }>(
        `select title, my_status from public.v_directives where my_status is not null order by title`,
      )
      expect(mine.map((d) => d.my_status)).toEqual(['acknowledged', 'responded'])
      const thread = await s.q(
        `select 1 from public.comments where entity_id = '50000000-0000-4000-8000-000000000103'`,
      )
      expect(thread).toHaveLength(3)

      await s.as(USERS.hvcStaff1)
      expect(await s.q(`select 1 from public.v_directives`)).toHaveLength(0)
      await s.as(USERS.hvcAdmin)
      const [d] = await s.q<{ is_overdue: boolean; my_status: string }>(
        `select is_overdue, my_status from public.v_directives`,
      )
      expect(d).toEqual({ is_overdue: true, my_status: 'pending' })
    })
  })
})

describe('comment visibility', () => {
  it('keeps admin-only threads (and their replies) away from staff', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await s.as(USERS.amiaStaff1)
      await expect(
        s.q(
          `insert into public.comments (entity_type, entity_id, body, visibility) values ('activity', $1, 'x', 'admins')`,
          [a.id],
        ),
      ).rejects.toThrow(/cannot post comments with admins visibility/)

      await s.as(USERS.amiaAdmin)
      const [root] = await s.q<{ id: string; mentions: string[] }>(
        `insert into public.comments (entity_type, entity_id, body, visibility, mentions)
         values ('activity', $1, 'Between us admins', 'admins', $2) returning id, mentions`,
        [a.id, [USERS.amiaStaff1, USERS.superadmin]],
      )
      // Staff cannot be pulled in by a mention.
      expect(root.mentions).toEqual([USERS.superadmin])
      await s.as(USERS.superadmin)
      const [reply] = await s.q<{ visibility: string }>(
        `insert into public.comments (entity_type, entity_id, body, parent_id, visibility)
         values ('activity', $1, 'Agreed', $2, 'program') returning visibility`,
        [a.id, root.id],
      )
      expect(reply.visibility).toBe('admins') // inherited from the thread

      await s.as(USERS.amiaStaff1)
      expect(
        await s.q(`select 1 from public.comments where entity_id = $1`, [a.id]),
      ).toHaveLength(0)
      // The responsible staff member is not notified about admin-only threads.
      expect(await inbox(s, USERS.amiaStaff1, a.id, 'comment')).toHaveLength(0)
      const [m] = await inbox(s, USERS.superadmin, a.id, 'mention')
      expect(m.title).toMatch(/\(admins only\)$/)
    })
  })

  it('reserves superadmin-only comments for superadmins', async () => {
    await inTx(db, async (s) => {
      const a = await newActivity(s)
      await s.as(USERS.amiaAdmin)
      await expect(
        s.q(
          `insert into public.comments (entity_type, entity_id, body, visibility) values ('activity', $1, 'x', 'superadmin')`,
          [a.id],
        ),
      ).rejects.toThrow(/superadmin visibility/)
      await s.as(USERS.superadmin)
      await s.q(
        `insert into public.comments (entity_type, entity_id, body, visibility) values ('activity', $1, 'FOD only', 'superadmin')`,
        [a.id],
      )
      await s.as(USERS.amiaAdmin)
      expect(await s.q(`select 1 from public.comments where entity_id = $1`, [a.id])).toHaveLength(0)
    })
  })
})
