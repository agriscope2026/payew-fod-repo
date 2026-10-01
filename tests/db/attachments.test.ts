import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, inTx, PROGRAMS, USERS, type Session } from './harness'

let db: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => {
  db = await createDb()
})

/** Inserts an attachment as the service (bypassing RLS), like the Edge Function does. */
async function addFile(
  s: Session,
  opts: {
    programId: string | null
    uploadedBy: string
    status?: 'pending' | 'ready'
    group?: string
    version?: number
    name?: string
  },
) {
  await s.asAdmin()
  const [row] = await s.q<{ id: string; version_group_id: string }>(
    `insert into public.attachments
       (program_id, file_name, r2_key, mime_type, size_bytes, status, version_group_id, version, uploaded_by)
     values ($1, $2, gen_random_uuid()::text, 'application/pdf', 1000, $3,
             coalesce($4::uuid, gen_random_uuid()), $5, $6)
     returning id, version_group_id`,
    [
      opts.programId,
      opts.name ?? 'file.pdf',
      opts.status ?? 'ready',
      opts.group ?? null,
      opts.version ?? 1,
      opts.uploadedBy,
    ],
  )
  return row
}

const canUpload = async (
  s: Session,
  programId: string | null,
  entityType = 'repository',
  entityId: string | null = null,
) =>
  (
    await s.q<{ ok: boolean }>('select public.can_upload_attachment($1, $2, $3) as ok', [
      programId,
      entityType,
      entityId,
    ])
  )[0].ok

describe('can_upload_attachment', () => {
  it('follows program write scope', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.superadmin)
      expect(await canUpload(s, PROGRAMS.HVC)).toBe(true)
      expect(await canUpload(s, null)).toBe(true) // DA-wide document

      await s.as(USERS.amiaAdmin)
      expect(await canUpload(s, PROGRAMS.AMIA)).toBe(true)
      expect(await canUpload(s, PROGRAMS.HVC)).toBe(false)
      expect(await canUpload(s, null)).toBe(false)

      await s.as(USERS.amiaStaff1) // read-only staff
      expect(await canUpload(s, PROGRAMS.AMIA)).toBe(false)
    })
  })

  it('lets staff upload once the admin allows editing', async () => {
    await inTx(db, async (s) => {
      await s.asAdmin()
      await s.q('update public.profiles set can_edit_activities = true where id = $1', [
        USERS.amiaStaff1,
      ])
      await s.as(USERS.amiaStaff1)
      expect(await canUpload(s, PROGRAMS.AMIA)).toBe(true)
      expect(await canUpload(s, PROGRAMS.HVC)).toBe(false)
    })
  })

  it('allows a profile avatar only for oneself', async () => {
    await inTx(db, async (s) => {
      await s.as(USERS.amiaStaff1)
      expect(await canUpload(s, null, 'profile', USERS.amiaStaff1)).toBe(true)
      expect(await canUpload(s, null, 'profile', USERS.amiaStaff2)).toBe(false)
    })
  })
})

describe('attachments RLS', () => {
  it('scopes reads to the program; DA-wide files are visible to all active users', async () => {
    await inTx(db, async (s) => {
      const amia = await addFile(s, { programId: PROGRAMS.AMIA, uploadedBy: USERS.amiaAdmin })
      const hvc = await addFile(s, { programId: PROGRAMS.HVC, uploadedBy: USERS.hvcAdmin })
      const global = await addFile(s, { programId: null, uploadedBy: USERS.superadmin })

      await s.as(USERS.amiaStaff1)
      const ids = (await s.q<{ id: string }>('select id from public.attachments')).map((r) => r.id)
      expect(ids).toContain(amia.id)
      expect(ids).toContain(global.id)
      expect(ids).not.toContain(hvc.id)
    })
  })

  it('hides pending uploads from everyone but the uploader', async () => {
    await inTx(db, async (s) => {
      const f = await addFile(s, {
        programId: PROGRAMS.AMIA,
        uploadedBy: USERS.amiaAdmin,
        status: 'pending',
      })
      await s.as(USERS.amiaStaff1)
      expect(await s.q('select id from public.attachments where id = $1', [f.id])).toHaveLength(0)
      await s.as(USERS.amiaAdmin)
      expect(await s.q('select id from public.attachments where id = $1', [f.id])).toHaveLength(1)
    })
  })

  it('Trash: staff lose sight of deleted files, admins can still restore', async () => {
    await inTx(db, async (s) => {
      const f = await addFile(s, { programId: PROGRAMS.AMIA, uploadedBy: USERS.amiaAdmin })
      await s.as(USERS.amiaAdmin)
      await s.q('update public.attachments set deleted_at = now() where id = $1', [f.id])
      const [{ deleted_by }] = await s.q<{ deleted_by: string }>(
        'select deleted_by from public.attachments where id = $1',
        [f.id],
      )
      expect(deleted_by).toBe(USERS.amiaAdmin)

      await s.as(USERS.amiaStaff1)
      expect(await s.q('select id from public.attachments where id = $1', [f.id])).toHaveLength(0)

      await s.as(USERS.amiaAdmin)
      await s.q('update public.attachments set deleted_at = null where id = $1', [f.id])
      await s.as(USERS.amiaStaff1)
      expect(await s.q('select id from public.attachments where id = $1', [f.id])).toHaveLength(1)
    })
  })

  it('clients cannot insert rows or change storage fields', async () => {
    await inTx(db, async (s) => {
      const f = await addFile(s, { programId: PROGRAMS.AMIA, uploadedBy: USERS.amiaAdmin })
      await s.as(USERS.amiaAdmin)
      await expect(
        s.q(
          `insert into public.attachments (program_id, file_name, r2_key, mime_type, size_bytes, version_group_id)
           values ($1, 'x', 'k', 'text/plain', 1, gen_random_uuid())`,
          [PROGRAMS.AMIA],
        ),
      ).rejects.toThrow(/permission denied/)
      await expect(
        s.q(`update public.attachments set r2_key = 'other' where id = $1`, [f.id]),
      ).rejects.toThrow(/permission denied/)
      await expect(
        s.q(`update public.attachments set program_id = $2 where id = $1`, [f.id, PROGRAMS.HVC]),
      ).rejects.toThrow(/permission denied/)
    })
  })

  it('read-only staff cannot edit others’ files; admins can', async () => {
    await inTx(db, async (s) => {
      const f = await addFile(s, { programId: PROGRAMS.AMIA, uploadedBy: USERS.amiaAdmin })
      await s.as(USERS.amiaStaff1)
      const none = await s.q(
        `update public.attachments set description = 'x' where id = $1 returning id`,
        [f.id],
      )
      expect(none).toHaveLength(0)
      await s.as(USERS.superadmin)
      const one = await s.q(
        `update public.attachments set tags = '{ppmp,2026}' where id = $1 returning id`,
        [f.id],
      )
      expect(one).toHaveLength(1)
    })
  })
})

describe('mark_attachment_ready', () => {
  it('finalizes a new version and demotes the previous one', async () => {
    await inTx(db, async (s) => {
      const v1 = await addFile(s, { programId: PROGRAMS.AMIA, uploadedBy: USERS.amiaAdmin })
      const v2 = await addFile(s, {
        programId: PROGRAMS.AMIA,
        uploadedBy: USERS.amiaAdmin,
        status: 'pending',
        group: v1.version_group_id,
        version: 2,
      })
      await s.asAdmin()
      await s.q('select public.mark_attachment_ready($1, 2048)', [v2.id])
      const rows = await s.q<{
        version: number
        is_latest: boolean
        status: string
        size_bytes: string
      }>(
        'select version, is_latest, status, size_bytes from public.attachments where version_group_id = $1 order by version',
        [v1.version_group_id],
      )
      expect(rows.map((r) => [r.version, r.is_latest, r.status])).toEqual([
        [1, false, 'ready'],
        [2, true, 'ready'],
      ])
      await expect(s.q('select public.mark_attachment_ready($1, 1)', [v2.id])).rejects.toThrow(
        /already finalized/,
      )
    })
  })

  it('is not callable by clients', async () => {
    await inTx(db, async (s) => {
      const f = await addFile(s, {
        programId: PROGRAMS.AMIA,
        uploadedBy: USERS.amiaAdmin,
        status: 'pending',
      })
      await s.as(USERS.amiaAdmin)
      await expect(s.q('select public.mark_attachment_ready($1, 1)', [f.id])).rejects.toThrow(
        /permission denied/,
      )
    })
  })
})
