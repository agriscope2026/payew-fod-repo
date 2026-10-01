import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const BUGUIAS_FA = '30000000-0000-4000-8000-000000000001' // registered by HVC
const MANKAYAN_FA = '30000000-0000-4000-8000-000000000005' // registered by AMIA

async function ids(s: Session) {
  const [row] = await s.q<{
    type_id: string
    province_id: string
    municipality_id: string
    other_muni: string
  }>(
    `select (select id from public.beneficiary_types where code = 'FA') as type_id,
            (select id from public.provinces where name = 'Benguet') as province_id,
            (select id from public.municipalities where name = 'Atok') as municipality_id,
            (select id from public.municipalities where name = 'Banaue') as other_muni`,
  )
  return row
}

const insertFa = (
  programId: string | null,
  ref: Awaited<ReturnType<typeof ids>>,
  name = 'Test FA',
) =>
  [
    `insert into public.beneficiaries (registered_by_program_id, type_id, name, province_id, municipality_id, members_male, members_female)
     values ($1, $2, $3, $4, $5, 10, 12) returning id, members_total, created_by`,
    [programId, ref.type_id, name, ref.province_id, ref.municipality_id],
  ] as const

describe('seed', () => {
  it('loads the sample registry with commodities', async () => {
    const { rows } = await db.query<{ n: number }>(
      'select count(*)::int as n from public.beneficiaries',
    )
    expect(rows[0].n).toBe(22)
    const c = await db.query<{ n: number }>(
      'select count(*)::int as n from public.beneficiary_commodities',
    )
    expect(c.rows[0].n).toBeGreaterThan(20)
  })
})

describe('beneficiaries RLS', () => {
  it('is readable by every active user (shared registry)', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      expect(await s.q('select id from public.beneficiaries')).toHaveLength(22)
    })
  })

  it('read-only staff cannot add; editing staff can add to their own program only', async () => {
    await inTx(db, async (s) => {
      const ref = await ids(s)
      await s.as(USERS.amiaStaff1)
      await expect(s.q(...insertFa(PROGRAMS.AMIA, ref))).rejects.toThrow(/row-level security/)

      await s.asAdmin()
      await s.q('update public.profiles set can_edit_activities = true where id = $1', [
        USERS.amiaStaff1,
      ])
      await s.as(USERS.amiaStaff1)
      const [row] = await s.q<{ members_total: number; created_by: string }>(
        ...insertFa(PROGRAMS.AMIA, ref),
      )
      expect(row.members_total).toBe(22)
      expect(row.created_by).toBe(USERS.amiaStaff1)
      await expect(s.q(...insertFa(PROGRAMS.HVC, ref, 'Other FA'))).rejects.toThrow(
        /row-level security/,
      )
    })
  })

  it("program admins edit only their program's records; superadmin edits all", async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaAdmin)
      const none = await s.q(
        `update public.beneficiaries set remarks = 'x' where id = $1 returning id`,
        [BUGUIAS_FA],
      )
      expect(none).toHaveLength(0)
      const own = await s.q(
        `update public.beneficiaries set remarks = 'x' where id = $1 returning id`,
        [MANKAYAN_FA],
      )
      expect(own).toHaveLength(1)
      await s.as(USERS.superadmin)
      const any = await s.q(
        `update public.beneficiaries set remarks = 'y' where id = $1 returning id`,
        [BUGUIAS_FA],
      )
      expect(any).toHaveLength(1)
    })
  })

  it('only managers can trash; ownership changes are superadmin-only', async () => {
    await inTx(db, async (s) => {
      await s.asAdmin()
      await s.q('update public.profiles set can_edit_activities = true where id = $1', [
        USERS.amiaStaff1,
      ])
      await s.as(USERS.amiaStaff1)
      await expect(
        s.q('update public.beneficiaries set deleted_at = now() where id = $1', [MANKAYAN_FA]),
      ).rejects.toThrow(/Only program admins/)

      await s.as(USERS.amiaAdmin)
      await expect(
        s.q('update public.beneficiaries set registered_by_program_id = $2 where id = $1', [
          MANKAYAN_FA,
          PROGRAMS.HVC,
        ]),
      ).rejects.toThrow(/Only a superadmin/)
      await s.q('update public.beneficiaries set deleted_at = now() where id = $1', [MANKAYAN_FA])

      await s.as(USERS.hvcStaff1) // trashed rows disappear for others
      expect(
        await s.q('select id from public.beneficiaries where id = $1', [MANKAYAN_FA]),
      ).toHaveLength(0)
      await s.as(USERS.amiaAdmin) // but stay visible to the owning admin for restore
      expect(
        await s.q('select id from public.beneficiaries where id = $1', [MANKAYAN_FA]),
      ).toHaveLength(1)
    })
  })

  it('commodity tags follow the beneficiary edit rule', async () => {
    await inTx(db, async (s) => {
      const [{ id: commodity }] = await s.q<{ id: string }>(
        `select id from public.commodities where name = 'Cacao'`,
      )
      await s.as(USERS.amiaAdmin)
      await expect(
        s.q('insert into public.beneficiary_commodities values ($1, $2)', [BUGUIAS_FA, commodity]),
      ).rejects.toThrow(/row-level security/)
      await s.q('insert into public.beneficiary_commodities values ($1, $2)', [
        MANKAYAN_FA,
        commodity,
      ])
    })
  })
})

describe('location hierarchy', () => {
  it('fills the province from the municipality and rejects mismatches', async () => {
    await inTx(db, async (s) => {
      const ref = await ids(s)
      await s.as(USERS.superadmin)
      await expect(
        s.q(
          `insert into public.beneficiaries (type_id, name, province_id, municipality_id) values ($1, 'Mismatch', $2, $3)`,
          [ref.type_id, ref.province_id, ref.other_muni],
        ),
      ).rejects.toThrow(/not in the selected province/)

      const [brgy] = await s.q<{ id: string }>(
        `select id from public.barangays where name = 'Batad'`,
      )
      const [row] = await s.q<{ municipality_id: string; province_id: string }>(
        `insert into public.beneficiaries (type_id, name, province_id, barangay_id)
         values ($1, 'Fill', (select id from public.provinces where name = 'Ifugao'), $2)
         returning municipality_id, province_id`,
        [ref.type_id, brgy.id],
      )
      expect(row.municipality_id).toBe(ref.other_muni)
    })
  })
})

describe('duplicate detection', () => {
  it('normalizes names', async () => {
    const { rows } = await db.query<{ k: string }>(
      `select public.beneficiary_name_key('Buguias Highland Vegetable Growers Assn., Inc.') as k`,
    )
    expect(rows[0].k).toBe('buguias highland vegetable')
  })

  it('finds near-duplicates, preferring the same municipality', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.hvcStaff1)
      const rows = await s.q<{ id: string; similarity: number }>(
        `select id, similarity from public.find_similar_beneficiaries('Buguias Highland Vegetables Farmers Assoc')`,
      )
      expect(rows[0].id).toBe(BUGUIAS_FA)
      expect(rows[0].similarity).toBeGreaterThan(0.6)
      const none = await s.q(
        `select id from public.find_similar_beneficiaries('Zzyzx Totally Different')`,
      )
      expect(none).toHaveLength(0)
    })
  })

  it('batch-matches import rows by index', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.hvcAdmin)
      const rows = await s.q<{ idx: number; id: string }>(
        `select idx, id from public.match_beneficiaries($1::jsonb)`,
        [
          JSON.stringify([
            { name: 'Brand New Org' },
            { name: 'Sagada Arabica Coffee Farmers Assn' },
          ]),
        ],
      )
      expect(rows).toEqual([{ idx: 1, id: '30000000-0000-4000-8000-000000000010' }])
    })
  })
})

describe('import_beneficiaries', () => {
  it('imports all rows with commodities, or none on error', async () => {
    await inTx(db, async (s) => {
      const ref = await ids(s)
      const [{ id: commodity }] = await s.q<{ id: string }>(
        `select id from public.commodities where name = 'Cacao'`,
      )
      const good = {
        type_id: ref.type_id,
        province_id: ref.province_id,
        municipality_id: ref.municipality_id,
      }
      await s.as(USERS.hvcAdmin)

      const [{ n }] = await s.q<{ n: number }>(
        'select public.import_beneficiaries($1, $2::jsonb) as n',
        [
          PROGRAMS.HVC,
          JSON.stringify([
            { ...good, name: 'Import One', members_male: '5', commodity_ids: [commodity] },
            { ...good, name: 'Import Two' },
          ]),
        ],
      )
      expect(n).toBe(2)

      // Second row has a bad municipality → whole batch rolls back.
      await expect(
        s.q('select public.import_beneficiaries($1, $2::jsonb)', [
          PROGRAMS.HVC,
          JSON.stringify([
            { ...good, name: 'Import Three' },
            { ...good, name: 'Import Four', municipality_id: ref.other_muni },
          ]),
        ]),
      ).rejects.toThrow(/not in the selected province/)
      expect(
        await s.q(`select id from public.beneficiaries where name = 'Import Three'`),
      ).toHaveLength(0)

      // RLS applies inside the RPC.
      await expect(
        s.q('select public.import_beneficiaries($1, $2::jsonb)', [
          PROGRAMS.AMIA,
          JSON.stringify([{ ...good, name: 'Sneaky' }]),
        ]),
      ).rejects.toThrow(/row-level security/)
    })
  })
})
