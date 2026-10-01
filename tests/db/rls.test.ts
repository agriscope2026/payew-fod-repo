import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const count = (rows: unknown[]) => rows.length

describe('anonymous access', () => {
  it('cannot read any app table', async () => {
    await inTx(db, async (s) => {
      await s.as(null)
      await expect(s.q('select * from public.programs')).rejects.toThrow(/permission denied/)
      await expect(s.q('select * from public.profiles')).rejects.toThrow(/permission denied/)
    })
  })
})

describe('programs', () => {
  it('superadmin sees every program', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      expect(count(await s.q('select id from public.programs'))).toBe(5)
    })
  })

  it('program admin and staff see only their own program', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      expect(await s.q('select code from public.programs')).toEqual([{ code: 'AMIA' }])
      await s.as(USERS.hvcStaff1)
      expect(await s.q('select code from public.programs')).toEqual([{ code: 'HVC' }])
    })
  })

  it('program admin can edit own program profile but not its code', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const updated = await s.q(
        `update public.programs set description = 'Updated' where id = $1 returning id`,
        [PROGRAMS.AMIA],
      )
      expect(count(updated)).toBe(1)
      await expect(
        s.q(`update public.programs set code = 'AMIA2' where id = $1`, [PROGRAMS.AMIA]),
      ).rejects.toThrow(/Only a superadmin/)
    })
  })

  it('program admin cannot touch another program', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const updated = await s.q(
        `update public.programs set description = 'Hacked' where id = $1 returning id`,
        [PROGRAMS.HVC],
      )
      expect(count(updated)).toBe(0)
    })
  })

  it('staff cannot edit their program and only superadmin can create one', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      const updated = await s.q(
        `update public.programs set description = 'x' where id = $1 returning id`,
        [PROGRAMS.AMIA],
      )
      expect(count(updated)).toBe(0)
      await s.as(USERS.amiaAdmin)
      await expect(
        s.q(`insert into public.programs (code, name) values ('NEW', 'New Program')`),
      ).rejects.toThrow(/row-level security/)
      await s.as(USERS.superadmin)
      expect(
        count(
          await s.q(`insert into public.programs (code, name) values ('NEW', 'New') returning id`),
        ),
      ).toBe(1)
    })
  })
})

describe('profiles', () => {
  it('scopes visibility to shared programs plus superadmins', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      expect(count(await s.q('select id from public.profiles'))).toBe(16)
      await s.as(USERS.amiaStaff1)
      // 3 AMIA members + the superadmin
      expect(count(await s.q('select id from public.profiles'))).toBe(4)
    })
  })

  it('lets a user edit safe fields of their own profile but not privileged ones', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      const rows = await s.q(
        `update public.profiles set full_name = 'Liza A.' where id = $1 returning full_name`,
        [USERS.amiaStaff1],
      )
      expect(rows).toEqual([{ full_name: 'Liza A.' }])
      await expect(
        s.q(`update public.profiles set role = 'superadmin' where id = $1`, [USERS.amiaStaff1]),
      ).rejects.toThrow(/permission denied/)
      await expect(
        s.q(`update public.profiles set is_active = true where id = $1`, [USERS.amiaStaff1]),
      ).rejects.toThrow(/permission denied/)
    })
  })

  it('blocks deactivated users everywhere', async () => {
    await inTx(db, async (s) => {
      await s.asAdmin()
      await s.q(`update public.profiles set is_active = false where id = $1`, [USERS.amiaStaff1])
      await s.as(USERS.amiaStaff1)
      expect(count(await s.q('select id from public.programs'))).toBe(0)
      expect(count(await s.q('select id from public.fiscal_years'))).toBe(0)
      await expect(s.q('select public.record_login()')).rejects.toThrow(/deactivated/)
    })
  })
})

describe('session RPCs', () => {
  it('record_login stamps last_login_at and audits a LOGIN', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const [row] = await s.q<{ last_login_at: Date | null }>(
        'select (public.record_login()).last_login_at',
      )
      expect(row.last_login_at).not.toBeNull()
      await s.as(USERS.superadmin)
      const logs = await s.q(
        `select action from public.audit_logs where table_name = 'profiles' and record_id = $1 and action = 'LOGIN'`,
        [USERS.amiaAdmin],
      )
      expect(count(logs)).toBe(1)
    })
  })

  it('complete_password_change clears the first-login flag', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaStaff2)
      const before = await s.q<{ must_change_password: boolean }>(
        'select must_change_password from public.profiles where id = $1',
        [USERS.amiaStaff2],
      )
      expect(before[0].must_change_password).toBe(true)
      await s.q('select public.complete_password_change()')
      const after = await s.q<{ must_change_password: boolean }>(
        'select must_change_password from public.profiles where id = $1',
        [USERS.amiaStaff2],
      )
      expect(after[0].must_change_password).toBe(false)
    })
  })
})

describe('program memberships', () => {
  it('program admin cannot add members to another program', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      await expect(
        s.q(`insert into public.program_memberships (program_id, user_id) values ($1, $2)`, [
          PROGRAMS.HVC,
          USERS.amiaStaff1,
        ]),
      ).rejects.toThrow(/row-level security/)
    })
  })
})

describe('audit logs', () => {
  it('are readable only by the superadmin and record program changes', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      await s.q(`update public.programs set color = '#123456' where id = $1`, [PROGRAMS.AMIA])
      expect(count(await s.q('select id from public.audit_logs'))).toBe(0)
      await s.as(USERS.superadmin)
      const logs = await s.q<{ changed_fields: string[]; actor_id: string }>(
        `select changed_fields, actor_id from public.audit_logs where table_name = 'programs' and action = 'UPDATE'`,
      )
      expect(logs).toEqual([{ changed_fields: ['color'], actor_id: USERS.amiaAdmin }])
    })
  })
})

describe('notifications', () => {
  it('are private to their owner and only read-state is writable', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      const mine = await s.q<{ user_id: string }>('select user_id from public.notifications')
      expect(mine.length).toBeGreaterThan(0)
      expect(mine.every((n) => n.user_id === USERS.amiaStaff1)).toBe(true)

      await expect(
        s.q(`insert into public.notifications (user_id, type, title) values ($1, 'x', 'spoof')`, [
          USERS.amiaAdmin,
        ]),
      ).rejects.toThrow(/permission denied/)
      await expect(s.q(`update public.notifications set title = 'changed'`)).rejects.toThrow(
        /permission denied/,
      )

      const [{ n }] = await s.q<{ n: number }>('select public.mark_all_notifications_read() as n')
      expect(n).toBe(mine.length)
    })
  })

  it('broadcasts fiscal year status changes to active users', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      await s.q(`update public.fiscal_years set status = 'open' where year = 2027`)
      await s.as(USERS.hvcStaff1)
      const rows = await s.q(
        `select title from public.notifications where title like 'Fiscal year FY 2027%'`,
      )
      expect(count(rows)).toBe(1)
    })
  })

  it('notify() is not callable by clients', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      await expect(
        s.q(`select public.notify($1, 'x', 'spoof')`, [USERS.amiaStaff1]),
      ).rejects.toThrow(/permission denied/)
    })
  })
})

describe('master lists', () => {
  it('are readable by members and writable only by superadmin', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      expect(count(await s.q('select id from public.provinces'))).toBe(7)
      await expect(s.q(`insert into public.commodities (name) values ('Sayote')`)).rejects.toThrow(
        /row-level security/,
      )
      await s.as(USERS.amiaAdmin)
      // program-specific category: allowed for own program only
      expect(
        count(
          await s.q(
            `insert into public.activity_categories (program_id, name) values ($1, 'AMIA Village') returning id`,
            [PROGRAMS.AMIA],
          ),
        ),
      ).toBe(1)
      await expect(
        s.q(`insert into public.activity_categories (program_id, name) values ($1, 'X')`, [
          PROGRAMS.HVC,
        ]),
      ).rejects.toThrow(/row-level security/)
    })
  })
})
