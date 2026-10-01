import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const run = (s: Session, rows: unknown[]) =>
  s
    .q<{ r: Record<string, number> }>(`select public.import_locations($1) as r`, [
      JSON.stringify(rows),
    ])
    .then((x) => x[0].r)

const rows = [
  { province: 'Benguet', province_psgc: '1401100000' },
  {
    province: 'Benguet',
    province_psgc: '1401100000',
    municipality: 'Itogon',
    municipality_psgc: '1401106000',
  },
  {
    province: 'Benguet',
    municipality: 'Itogon',
    municipality_psgc: '1401106000',
    barangay: 'Ucab',
    barangay_psgc: '1401106009',
  },
  // already seeded (by name): gets its PSGC code, not a duplicate
  {
    province: 'Benguet',
    municipality: 'La Trinidad',
    municipality_psgc: '1401110000',
    barangay: 'balili',
  },
  { province: 'Nueva Provincia', municipality: 'Bagong Bayan', municipality_is_city: true },
]

describe('import_locations', () => {
  it('adds new places once, fills PSGC codes on existing ones, and is idempotent', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      expect(await run(s, rows)).toEqual({ provinces: 1, municipalities: 2, barangays: 1 })
      expect(await run(s, rows)).toEqual({ provinces: 0, municipalities: 0, barangays: 0 })

      const [lt] = await s.q<{ psgc_code: string }>(
        `select psgc_code from public.municipalities where name = 'La Trinidad'`,
      )
      expect(lt.psgc_code).toBe('1401110000')
      const [{ n }] = await s.q<{ n: number }>(
        `select count(*)::int as n from public.barangays b join public.municipalities m on m.id = b.municipality_id
         where m.name = 'La Trinidad' and lower(b.name) = 'balili'`,
      )
      expect(n).toBe(1)
      const [city] = await s.q<{ is_city: boolean }>(
        `select is_city from public.municipalities where name = 'Bagong Bayan'`,
      )
      expect(city.is_city).toBe(true)
    })
  })

  it('restores a place that was in Trash instead of duplicating it', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      await s.q(`update public.municipalities set deleted_at = now() where name = 'Tuba'`)
      expect(await run(s, [{ province: 'Benguet', municipality: 'Tuba' }])).toEqual({
        provinces: 0,
        municipalities: 0,
        barangays: 0,
      })
      const [tuba] = await s.q<{ deleted_at: string | null }>(
        `select deleted_at from public.municipalities where name = 'Tuba'`,
      )
      expect(tuba.deleted_at).toBeNull()
    })
  })

  it('is superadmin-only and validates rows', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      await expect(run(s, rows)).rejects.toThrow(/Only the superadmin/)
      await s.as(USERS.superadmin)
      await expect(run(s, [{ province: 'Benguet', barangay: 'Loose' }])).rejects.toThrow(
        /Row 1: barangay without a municipality/,
      )
      await expect(run(s, [{ municipality: 'Nowhere' }])).rejects.toThrow(
        /Row 1: province is required/,
      )
    })
  })
})
