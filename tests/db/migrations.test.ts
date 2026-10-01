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
})
