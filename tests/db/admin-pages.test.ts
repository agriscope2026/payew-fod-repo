import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const FY2026 = '20000000-0000-4000-8000-000000002026'

const post = (s: Session, program: string | null, title: string, publishAt: string | null = null) =>
  s
    .q<{ id: string }>(
      `insert into public.announcements (program_id, title, body, publish_at)
       values ($1, $2, 'Details of the memo.', coalesce($3::timestamptz, now())) returning id`,
      [program, title, publishAt],
    )
    .then((r) => r[0].id)

describe('announcements', () => {
  it('only superadmins post to everyone; program admins post to their programs', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      await expect(post(s, PROGRAMS.AMIA, 'Staff memo')).rejects.toThrow(/row-level security/)
      await s.as(USERS.amiaAdmin)
      await expect(post(s, null, 'Everyone memo')).rejects.toThrow(/row-level security/)
      await expect(post(s, PROGRAMS.HVC, 'Other program memo')).rejects.toThrow(
        /row-level security/,
      )
      const id = await post(s, PROGRAMS.AMIA, 'AMIA planning workshop')

      await s.as(USERS.amiaStaff1)
      const [mine] = await s.q<{ is_read: boolean }>(
        `select is_read from public.v_announcements where id = $1`,
        [id],
      )
      expect(mine.is_read).toBe(false)
      await s.q(`select public.mark_announcement_read($1)`, [id])
      const [after] = await s.q<{ is_read: boolean }>(
        `select is_read from public.v_announcements where id = $1`,
        [id],
      )
      expect(after.is_read).toBe(true)

      await s.as(USERS.hvcStaff1)
      expect(await s.q(`select id from public.v_announcements where id = $1`, [id])).toHaveLength(0)
    })
  })

  it('notifies readers once when live; scheduled posts wait', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      const now = await post(s, null, 'Office closed on Friday')
      const later = await post(s, null, 'Year-end reminders', '2099-01-01T00:00:00Z')

      await s.asAdmin()
      const [{ n }] = await s.q<{ n: string }>(
        `select count(*) as n from public.notifications where entity_id = $1 and type = 'announcement'`,
        [now],
      )
      const [{ active }] = await s.q<{ active: string }>(
        `select count(*) as active from public.profiles where is_active and deleted_at is null and id <> $1`,
        [USERS.superadmin],
      )
      expect(Number(n)).toBe(Number(active))
      const [{ m }] = await s.q<{ m: string }>(
        `select count(*) as m from public.notifications where entity_id = $1`,
        [later],
      )
      expect(Number(m)).toBe(0)
      // Running the publisher again sends nothing new.
      await s.q(`select public.publish_due_announcements()`)
      const [{ n2 }] = await s.q<{ n2: string }>(
        `select count(*) as n2 from public.notifications where entity_id = $1`,
        [now],
      )
      expect(n2).toBe(n)
      // Dispatch bookkeeping stays out of the audit log: only the poster's insert is there.
      const audit = await s.q<{ action: string }>(
        `select action from public.audit_logs where table_name = 'announcements' and record_id = $1`,
        [now],
      )
      expect(audit.map((a) => a.action)).toEqual(['INSERT'])

      // Readers can't see the scheduled one yet; its author can.
      await s.as(USERS.amiaStaff1)
      expect(
        await s.q(`select id from public.v_announcements where id = $1`, [later]),
      ).toHaveLength(0)
      await expect(s.q(`select public.mark_announcement_read($1)`, [later])).rejects.toThrow(
        /not found/,
      )
      await s.as(USERS.superadmin)
      expect(
        await s.q(`select id from public.v_announcements where id = $1`, [later]),
      ).toHaveLength(1)
    })
  })
})

describe('trash', () => {
  it('lists soft-deleted records per the caller’s access and restores them', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const [act] = await s.q<{ id: string }>(
        `insert into public.activities (program_id, fiscal_year_id, title) values ($1, $2, 'Trash me') returning id`,
        [PROGRAMS.AMIA, FY2026],
      )
      await s.q(`update public.activities set deleted_at = now() where id = $1`, [act.id])
      const items = await s.q<{ kind: string; item_id: string; deleted_by: string | null }>(
        `select * from public.trash_items()`,
      )
      const row = items.find((i) => i.item_id === act.id)
      expect(row?.kind).toBe('activity')
      expect(row?.deleted_by).toBeTruthy()

      // Another program's admin neither sees nor restores it.
      await s.as(USERS.hvcAdmin)
      const theirs = await s.q<{ item_id: string }>(`select * from public.trash_items()`)
      expect(theirs.find((i) => i.item_id === act.id)).toBeUndefined()
      await expect(
        s.q(`select public.restore_trash_item('activity', $1)`, [act.id]),
      ).rejects.toThrow(/not allowed/)

      await s.as(USERS.amiaAdmin)
      await s.q(`select public.restore_trash_item('activity', $1)`, [act.id])
      const [back] = await s.q<{ deleted_at: string | null }>(
        `select deleted_at from public.activities where id = $1`,
        [act.id],
      )
      expect(back.deleted_at).toBeNull()
      await expect(
        s.q(`select public.restore_trash_item('master:pg_class', $1)`, [act.id]),
      ).rejects.toThrow(/Unknown item type/)
    })
  })
})

describe('my_recent_activity', () => {
  it('returns only the caller’s own audit rows', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      await s.q(`update public.profiles set position = 'Program Coordinator' where id = $1`, [
        USERS.amiaAdmin,
      ])
      const rows = await s.q<{ table_name: string; action: string }>(
        `select * from public.my_recent_activity(10)`,
      )
      expect(rows[0]).toMatchObject({ table_name: 'profiles', action: 'UPDATE' })
      // Staff cannot read the audit table itself.
      await s.as(USERS.amiaStaff1)
      expect(await s.q(`select id from public.audit_logs limit 1`)).toHaveLength(0)
    })
  })
})
