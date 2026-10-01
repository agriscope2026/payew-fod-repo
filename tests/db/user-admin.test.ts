import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const update = (userId: string, changes: Record<string, unknown>) =>
  [`select (public.admin_update_user($1, $2::jsonb)).*`, [userId, JSON.stringify(changes)]] as const

describe('can_admin_user', () => {
  it('superadmin manages anyone; program admin only own staff; staff nobody', async () => {
    await inTx(db, async (s) => {
      const check = async (target: string) =>
        (await s.q<{ ok: boolean }>('select public.can_admin_user($1) as ok', [target]))[0].ok

      await s.as(USERS.superadmin)
      expect(await check(USERS.amiaAdmin)).toBe(true)
      expect(await check(USERS.hvcStaff1)).toBe(true)

      await s.as(USERS.amiaAdmin)
      expect(await check(USERS.amiaStaff1)).toBe(true)
      expect(await check(USERS.hvcStaff1)).toBe(false) // other program
      expect(await check(USERS.apaAdmin)).toBe(false) // not staff
      expect(await check(USERS.superadmin)).toBe(false)

      await s.as(USERS.amiaStaff1)
      expect(await check(USERS.amiaStaff2)).toBe(false)
    })
  })
})

describe('admin_update_user', () => {
  it('program admin can edit own staff basics and the activity-edit toggle', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const [row] = await s.q<{ position: string; can_edit_activities: boolean }>(
        ...update(USERS.amiaStaff1, { position: 'Agriculturist III', can_edit_activities: true }),
      )
      expect(row).toMatchObject({ position: 'Agriculturist III', can_edit_activities: true })
    })
  })

  it('program admin cannot change role/program or manage other programs', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      await expect(s.q(...update(USERS.amiaStaff1, { role: 'program_admin' }))).rejects.toThrow(
        /cannot be changed/,
      )
      await expect(s.q(...update(USERS.amiaStaff1, { program_id: PROGRAMS.HVC }))).rejects.toThrow(
        /cannot be changed/,
      )
      await expect(s.q(...update(USERS.hvcStaff1, { position: 'x' }))).rejects.toThrow(
        /not allowed/,
      )
    })
  })

  it('staff cannot manage anyone', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      await expect(s.q(...update(USERS.amiaStaff2, { position: 'x' }))).rejects.toThrow(
        /not allowed/,
      )
    })
  })

  it('superadmin can move staff between programs (single membership kept)', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      await s.q(...update(USERS.amiaStaff1, { program_id: PROGRAMS.HVC }))
      const rows = await s.q<{ program_id: string }>(
        'select program_id from public.program_memberships where user_id = $1',
        [USERS.amiaStaff1],
      )
      expect(rows).toEqual([{ program_id: PROGRAMS.HVC }])
    })
  })

  it('superadmin can give a program admin several programs', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      await s.q(...update(USERS.amiaAdmin, { program_ids: [PROGRAMS.APA] }))
      await s.as(USERS.amiaAdmin)
      const codes = await s.q<{ code: string }>('select code from public.programs order by code')
      expect(codes.map((c) => c.code)).toEqual(['AMIA', 'APA'])
    })
  })

  it('promoting to superadmin clears program scope; demoting requires a program', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      const [row] = await s.q<{ role: string; program_id: string | null }>(
        ...update(USERS.amiaAdmin, { role: 'superadmin' }),
      )
      expect(row).toMatchObject({ role: 'superadmin', program_id: null })
      await expect(s.q(...update(USERS.amiaAdmin, { role: 'program_staff' }))).rejects.toThrow(
        /program is required/,
      )
    })
  })

  it('nobody can change their own role or status', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      await expect(s.q(...update(USERS.superadmin, { is_active: false }))).rejects.toThrow(
        /your own role or account status/,
      )
    })
  })

  it('deactivation revokes access immediately', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      await s.q(...update(USERS.amiaStaff1, { is_active: false }))
      await s.as(USERS.amiaStaff1)
      expect(await s.q('select id from public.programs')).toHaveLength(0)
    })
  })
})

describe('admin_force_logout', () => {
  it('rejects tokens issued before the revocation but accepts new sign-ins', async () => {
    await inTx(db, async (s) => {
      await s.asAdmin()
      await s.q(`insert into auth.sessions (user_id) values ($1)`, [USERS.amiaStaff1])

      await s.as(USERS.amiaAdmin)
      await s.q('select public.admin_force_logout($1)', [USERS.amiaStaff1])

      await s.asAdmin()
      const sessions = await s.q('select id from auth.sessions where user_id = $1', [
        USERS.amiaStaff1,
      ])
      expect(sessions).toHaveLength(0)

      await s.as(USERS.amiaStaff1, { iatOffset: -60 }) // old token
      expect(await s.q('select id from public.programs')).toHaveLength(0)
      await s.as(USERS.amiaStaff1, { iatOffset: 60 }) // token from a fresh sign-in
      expect(await s.q('select id from public.programs')).toHaveLength(1)
    })
  })

  it('program admin cannot force-logout users outside their staff', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      await expect(s.q('select public.admin_force_logout($1)', [USERS.hvcStaff1])).rejects.toThrow(
        /not allowed/,
      )
    })
  })
})

describe('set_current_fiscal_year', () => {
  it('switches the current year atomically (superadmin only)', async () => {
    await inTx(db, async (s) => {
      const fy2027 = '20000000-0000-4000-8000-000000002027'
      await s.as(USERS.amiaAdmin)
      await expect(s.q('select public.set_current_fiscal_year($1)', [fy2027])).rejects.toThrow(
        /Only a superadmin/,
      )
      await s.as(USERS.superadmin)
      await s.q('select public.set_current_fiscal_year($1)', [fy2027])
      const rows = await s.q<{ year: number }>(
        'select year from public.fiscal_years where is_current',
      )
      expect(rows).toEqual([{ year: 2027 }])
    })
  })
})
