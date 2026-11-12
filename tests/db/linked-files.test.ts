import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

const add = (s: Session, url = 'https://docs.google.com/presentation/d/abc/edit') =>
  s.q<{ id: string }>(
    `insert into public.linked_files (program_id, title, url, kind) values ($1, 'Year-end report', $2, 'presentation') returning id`,
    [PROGRAMS.AMIA, url],
  )

describe('linked files', () => {
  it('lets any program member share a link, and only the owner or an admin remove it', () =>
    inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      const [file] = await add(s)
      await s.as(USERS.amiaStaff2)
      expect(await s.q('select id from public.linked_files')).toHaveLength(1)
      expect(
        await s.q('delete from public.linked_files where id = $1 returning id', [file.id]),
      ).toHaveLength(0)
      await s.as(USERS.hvcAdmin)
      expect(await s.q('select id from public.linked_files')).toHaveLength(0)
      await expect(add(s)).rejects.toThrow()
      await s.as(USERS.amiaAdmin)
      expect(
        await s.q('delete from public.linked_files where id = $1 returning id', [file.id]),
      ).toHaveLength(1)
    }))

  it('accepts https links only', () =>
    inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      await expect(add(s, 'javascript:alert(1)')).rejects.toThrow()
      await expect(add(s, 'http://example.com/file.pptx')).rejects.toThrow()
    }))
})
