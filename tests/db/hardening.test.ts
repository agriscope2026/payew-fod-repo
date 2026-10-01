import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb({ seed: false })
})

/** Permission helpers that RLS policies call; they answer "no" for signed-out callers. */
const ANON_SAFE_HELPERS = [
  'assert_fiscal_year_writable(uuid,uuid)',
  'can_manage_program(uuid)',
  'can_view_profile(uuid)',
  'current_user_role()',
  'has_program_access(uuid)',
  'is_program_admin(uuid)',
  'is_superadmin()',
  'user_program_ids()',
]

describe('database hardening (deploy checklist)', () => {
  it('has row-level security on every table', async () => {
    await inTx(db, async (s) => {
      const rows = await s.q<{ relname: string }>(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
      )
      expect(rows.map((r) => r.relname)).toEqual([])
    })
  })

  it('runs every view with the caller’s permissions (security_invoker)', async () => {
    await inTx(db, async (s) => {
      const rows = await s.q<{ relname: string }>(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'v'
           and not coalesce(c.reloptions::text[] @> array['security_invoker=true'], false)`,
      )
      expect(rows.map((r) => r.relname)).toEqual([])
    })
  })

  it('pins search_path on every SECURITY DEFINER function', async () => {
    await inTx(db, async (s) => {
      const rows = await s.q<{ f: string }>(
        `select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosecdef
           and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
      )
      expect(rows.map((r) => r.f)).toEqual([])
    })
  })

  it('lets signed-out callers run no privileged function beyond the permission helpers', async () => {
    await inTx(db, async (s) => {
      const rows = await s.q<{ f: string }>(
        `select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
         order by 1`,
      )
      expect(rows.map((r) => r.f).filter((f) => !ANON_SAFE_HELPERS.includes(f))).toEqual([])
    })
  })

  it('keeps internal functions away from signed-in users', async () => {
    await inTx(db, async (s) => {
      const rows = await s.q<{ f: string }>(
        `select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('notify', 'deliver', 'publish_due_announcements', 'audit_row_change',
                             'person_name', 'enable_audit', 'on_announcement_saved')
           and has_function_privilege('authenticated', p.oid, 'execute')`,
      )
      expect(rows.map((r) => r.f)).toEqual([])
    })
  })
})
