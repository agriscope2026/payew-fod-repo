import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const FY2026 = '20000000-0000-4000-8000-000000002026'
/** Staff can edit program records only when an admin turns that on. */
const asWriter = async (s: Session) => {
  await s.asAdmin()
  await s.q('update public.profiles set can_edit_activities = true where id = $1', [
    USERS.amiaStaff1,
  ])
  await s.as(USERS.amiaStaff1)
}
const sheet = (label: string) => JSON.stringify({ version: 1, name: label, cells: {} })

const create = async (s: Session, kind = 'WFP', program: string = PROGRAMS.AMIA) => {
  const [{ id }] = await s.q<{ id: string }>(
    `select public.create_finance_sheet($1, $2, $3, $4::jsonb, 'wfp') as id`,
    [program, FY2026, kind, sheet('start')],
  )
  return id
}
const save = (s: Session, id: string, version: number, label: string) =>
  s.q<{ v: number }>(`select public.save_finance_sheet($1, $2, $3::jsonb, false, 'wfp') as v`, [
    id,
    version,
    sheet(label),
  ])
const contents = async (s: Session, id: string) => {
  const [row] = await s.q<{ data: { name: string }; draft: { name: string } | null }>(
    'select data, draft from public.finance_sheet_data where sheet_id = $1',
    [id],
  )
  return row
}

describe('finance sheets', () => {
  it('creates one sheet per kind and keeps the first when two people start it', () =>
    inTx(db, async (s) => {
      await asWriter(s)
      const a = await create(s)
      const b = await create(s)
      expect(b).toBe(a)
      expect((await contents(s, a)).data.name).toBe('start')
    }))

  it('saves, counts versions and keeps the previous version', () =>
    inTx(db, async (s) => {
      await asWriter(s)
      const id = await create(s)
      const [{ v }] = await save(s, id, 1, 'second')
      expect(v).toBe(2)
      expect((await contents(s, id)).data.name).toBe('second')
      const versions = await s.q<{ version: number; data: { name: string } }>(
        'select version, data from public.finance_sheet_versions where sheet_id = $1',
        [id],
      )
      expect(versions.map((x) => [x.version, x.data.name])).toEqual([[1, 'start']])
    }))

  it('refuses a save based on an older version', () =>
    inTx(db, async (s) => {
      await asWriter(s)
      const id = await create(s)
      await save(s, id, 1, 'mine')
      await expect(save(s, id, 1, 'stale')).rejects.toThrow(/Someone else saved/)
      expect((await contents(s, id)).data.name).toBe('mine')
    }))

  it('keeps only the last 30 versions', () =>
    inTx(db, async (s) => {
      await asWriter(s)
      const id = await create(s)
      for (let v = 1; v <= 35; v++) await save(s, id, v, `v${v + 1}`)
      const [{ n, low }] = await s.q<{ n: number; low: number }>(
        'select count(*)::int as n, min(version) as low from public.finance_sheet_versions where sheet_id = $1',
        [id],
      )
      expect([n, low]).toEqual([30, 6])
    }))

  it('stores a draft and makes it the sheet on finalize', () =>
    inTx(db, async (s) => {
      await asWriter(s)
      const id = await create(s)
      await s.q(`select public.save_finance_sheet_draft($1, $2::jsonb, 'AMIA.xlsx')`, [
        id,
        sheet('uploaded'),
      ])
      expect((await contents(s, id)).draft?.name).toBe('uploaded')
      await s.q(`select public.finalize_finance_sheet($1, 1, $2::jsonb)`, [id, sheet('cleaned')])
      const row = await contents(s, id)
      expect([row.data.name, row.draft]).toEqual(['cleaned', null])
      const [meta] = await s.q<{ is_custom: boolean; source_name: string; template_key: string }>(
        'select is_custom, source_name, template_key from public.finance_sheets where id = $1',
        [id],
      )
      expect(meta).toEqual({ is_custom: true, source_name: 'AMIA.xlsx', template_key: null })
    }))

  it('keeps other programs out and lets no one write directly', () =>
    inTx(db, async (s) => {
      await asWriter(s)
      const id = await create(s)
      // Without a write policy, a direct update changes nothing.
      await s
        .q(`update public.finance_sheet_data set data = '{}' where sheet_id = $1`, [id])
        .catch(() => [])
      expect((await contents(s, id)).data.name).toBe('start')
      await s.as(USERS.hvcAdmin)
      expect(await s.q('select id from public.finance_sheets')).toHaveLength(0)
      expect(await s.q('select sheet_id from public.finance_sheet_data')).toHaveLength(0)
      await expect(save(s, id, 1, 'x')).rejects.toThrow(/not allowed/)
      await expect(create(s, 'WFP', PROGRAMS.AMIA)).rejects.toThrow(/not allowed/)
    }))

  it('cannot be changed in a locked fiscal year', () =>
    inTx(db, async (s) => {
      await asWriter(s)
      const id = await create(s)
      await s.asAdmin()
      await s.q(`update public.fiscal_years set status = 'locked' where id = $1`, [FY2026])
      await asWriter(s)
      await expect(save(s, id, 1, 'x')).rejects.toThrow(/locked/)
    }))
})

describe('dashboard cards', () => {
  const addCard = (s: Session, sheetId: string, title = 'Obligated') =>
    s.q<{ id: string; program_id: string }>(
      `insert into public.dashboard_cards (sheet_id, program_id, fiscal_year_id, title, range, agg)
       values ($1, $2, $3, $4, '{"r1":"a","c1":"b","r2":"a","c2":"b"}', 'sum')
       returning id, program_id`,
      [sheetId, PROGRAMS.HVC, FY2026, title],
    )

  it('takes program and year from the sheet, whatever the client sends', () =>
    inTx(db, async (s) => {
      await asWriter(s)
      const id = await create(s)
      const [card] = await addCard(s, id)
      expect(card.program_id).toBe(PROGRAMS.AMIA)
    }))

  it('lets the program see cards, and only the owner or an admin remove them', () =>
    inTx(db, async (s) => {
      await asWriter(s)
      const id = await create(s)
      const [card] = await addCard(s, id)
      await s.as(USERS.amiaStaff2)
      expect(await s.q('select id from public.dashboard_cards')).toHaveLength(1)
      expect(
        await s.q('delete from public.dashboard_cards where id = $1 returning id', [card.id]),
      ).toHaveLength(0)
      await s.as(USERS.hvcAdmin)
      expect(await s.q('select id from public.dashboard_cards')).toHaveLength(0)
      await s.as(USERS.amiaAdmin)
      expect(
        await s.q('delete from public.dashboard_cards where id = $1 returning id', [card.id]),
      ).toHaveLength(1)
    }))
})
