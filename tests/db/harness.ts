import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'

const root = resolve(import.meta.dirname, '../..')
const migrationsDir = join(root, 'supabase/migrations')

export const USERS = {
  superadmin: '00000000-0000-4000-8000-000000000001',
  amiaAdmin: '00000000-0000-4000-8000-000000000101',
  amiaStaff1: '00000000-0000-4000-8000-000000000102',
  amiaStaff2: '00000000-0000-4000-8000-000000000103',
  hvcAdmin: '00000000-0000-4000-8000-000000000301',
  hvcStaff1: '00000000-0000-4000-8000-000000000302',
  apaAdmin: '00000000-0000-4000-8000-000000000201',
} as const

export const PROGRAMS = {
  AMIA: '10000000-0000-4000-8000-000000000001',
  APA: '10000000-0000-4000-8000-000000000002',
  HVC: '10000000-0000-4000-8000-000000000003',
} as const

/** Fresh in-memory Postgres with the Supabase stub, all migrations and (optionally) seed.sql. */
export async function createDb({ seed = true } = {}) {
  const db = new PGlite({ extensions: { pgcrypto, pg_trgm } })
  await db.exec(readFileSync(join(import.meta.dirname, 'supabase-stub.sql'), 'utf8'))

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(migrationsDir, file), 'utf8'))
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err })
    }
  }
  if (seed) {
    try {
      // reference.sql (production-safe master data) first, then the dev seed — as config.toml does.
      await db.exec(readFileSync(join(root, 'supabase/reference.sql'), 'utf8'))
      await db.exec(readFileSync(join(root, 'supabase/seed.sql'), 'utf8'))
      // Per-module seed files (supabase/seeds/*.sql), in name order, as config.toml does.
      const seedsDir = join(root, 'supabase/seeds')
      for (const file of readdirSync(seedsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort()) {
        await db.exec(readFileSync(join(seedsDir, file), 'utf8'))
      }
    } catch (err) {
      throw new Error(`seed.sql failed: ${(err as Error).message}`, { cause: err })
    }
  }
  return db
}

type Db = Awaited<ReturnType<typeof createDb>>

export interface Session {
  /** Run SQL as the current role and return rows. */
  q: <T = Record<string, unknown>>(sql: string, params?: readonly unknown[]) => Promise<T[]>
  /** Switch to an authenticated user (null = anon). `iatOffset` shifts the token's issued-at (seconds). */
  as: (userId: string | null, opts?: { iatOffset?: number }) => Promise<void>
  /** Switch back to the postgres superuser (bypasses RLS). */
  asAdmin: () => Promise<void>
}

/** Runs fn inside a transaction that is always rolled back, so tests stay isolated. */
export async function inTx<T>(db: Db, fn: (s: Session) => Promise<T>): Promise<T> {
  await db.exec('begin')
  const session: Session = {
    // Each statement runs in a savepoint so an expected error doesn't abort the transaction.
    q: async (sql, params) => {
      await db.exec('savepoint q')
      try {
        const { rows } = await db.query(sql, params ? [...params] : undefined)
        await db.exec('release savepoint q')
        return rows as never
      } catch (err) {
        await db.exec('rollback to savepoint q')
        throw err
      }
    },
    as: async (userId, opts) => {
      await db.exec('reset role')
      if (userId === null) {
        await db.query(`select set_config('request.jwt.claims', '', true)`)
        await db.exec('set local role anon')
      } else {
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({
            sub: userId,
            role: 'authenticated',
            iat: Math.floor(Date.now() / 1000) + (opts?.iatOffset ?? 0),
          }),
        ])
        await db.exec('set local role authenticated')
      }
    },
    asAdmin: async () => {
      await db.exec('reset role')
      await db.query(`select set_config('request.jwt.claims', '', true)`)
    },
  }
  try {
    return await fn(session)
  } finally {
    await db.exec('rollback')
  }
}
