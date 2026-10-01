import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDb } from './harness'

describe('migrations', () => {
  it('apply cleanly without seed', async () => {
    const db = await createDb({ seed: false })
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_tables where schemaname = 'public' and not rowsecurity`,
    )
    expect(rows[0].n).toBe(0) // RLS is enabled on every public table
  })

  it('apply with seed and provision profiles + memberships', async () => {
    const db = await createDb()
    const profiles = await db.query<{ r: string; n: number }>(
      `select role::text as r, count(*)::int as n from public.profiles group by role order by role`,
    )
    expect(profiles.rows).toEqual([
      { r: 'superadmin', n: 1 },
      { r: 'program_admin', n: 5 },
      { r: 'program_staff', n: 10 },
    ])
    const memberships = await db.query<{ n: number }>(
      `select count(*)::int as n from public.program_memberships`,
    )
    expect(memberships.rows[0].n).toBe(15)
  })

  it('load production reference data on migrations alone, idempotently', async () => {
    const db = await createDb({ seed: false })
    const sql = readFileSync(
      join(resolve(import.meta.dirname, '../..'), 'supabase/reference.sql'),
      'utf8',
    )
    const counts = async () =>
      (
        await db.query<Record<string, number>>(
          `select (select count(*)::int from public.programs) as programs,
                  (select count(*)::int from public.expense_classes) as classes,
                  (select count(*)::int from public.activity_categories) as categories,
                  (select count(*)::int from public.app_settings) as settings,
                  (select count(*)::int from public.profiles) as users,
                  (select count(*)::int from public.fiscal_years) as years`,
        )
      ).rows[0]
    await db.exec(sql)
    const first = await counts()
    expect(first).toMatchObject({ programs: 5, classes: 3, users: 0, years: 0 })
    const keys = await db.query<{ key: string }>(`select key from public.app_settings order by key`)
    expect(keys.rows.map((k) => k.key)).toEqual([
      'approvals',
      'dashboard_thresholds',
      'maintenance_banner',
      'overdue_notice_template',
      'reminders',
      'timezone',
      'uploads',
      'validation_strictness',
    ])
    await db.exec(sql)
    expect(await counts()).toEqual(first)
  })

  it('make the first dashboard-created account the superadmin, and refuse program-less ones after', async () => {
    const db = await createDb({ seed: false })
    const addUser = (
      email: string,
      appMeta: object = { provider: 'email', providers: ['email'] },
    ) =>
      db.query(
        `insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         values (gen_random_uuid(), 'authenticated', 'authenticated', $1, $2, '{}', now(), now())`,
        [email, JSON.stringify(appMeta)],
      )
    await addUser('chief@da.gov.ph')
    const { rows } = await db.query<{ role: string; program_id: string | null }>(
      `select role::text, program_id from public.profiles where email = 'chief@da.gov.ph'`,
    )
    expect(rows).toEqual([{ role: 'superadmin', program_id: null }])
    await expect(addUser('someone@da.gov.ph')).rejects.toThrow(/New accounts need a program/)
    // Accounts with a program (as PAYEW → Users creates them) still work.
    await db.exec(
      readFileSync(join(resolve(import.meta.dirname, '../..'), 'supabase/reference.sql'), 'utf8'),
    )
    await addUser('staff@da.gov.ph', { app_role: 'program_staff', program_code: 'amia' })
    const staff = await db.query<{ role: string }>(
      `select role::text from public.profiles where email = 'staff@da.gov.ph'`,
    )
    expect(staff.rows).toEqual([{ role: 'program_staff' }])
  })

  it('ship a post-deploy checklist that reports what is still missing', async () => {
    const root = resolve(import.meta.dirname, '../..')
    const db = await createDb({ seed: false })
    await db.exec(readFileSync(join(root, 'supabase/reference.sql'), 'utf8'))
    const sql = readFileSync(join(root, 'supabase/checks/post_deploy.sql'), 'utf8')
    const { rows } = await db.query<{ check_name: string; ok: boolean }>(sql)
    expect(Object.fromEntries(rows.map((r) => [r.check_name, r.ok]))).toEqual({
      'Row-level security on every table': true,
      'Extensions pgcrypto and pg_trgm': true,
      'pg_cron enabled (Database → Extensions)': false,
      'Reference data loaded (supabase/reference.sql)': true,
      'Locations imported (PSGC)': false,
      'An active superadmin exists': false,
      'A current, open fiscal year': false,
      'No demo accounts (@payew.local)': true,
    })
  })
})
