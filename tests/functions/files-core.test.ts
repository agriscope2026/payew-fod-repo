import { describe, expect, it } from 'vitest'
import {
  buildObjectKey,
  clampTtl,
  contentDisposition,
  DEFAULT_UPLOAD_POLICY,
  sanitizeFileName,
  validateUpload,
} from '../../supabase/functions/_shared/files-core'

describe('sanitizeFileName', () => {
  it('keeps a readable ASCII name and the extension', () => {
    expect(sanitizeFileName('PPMP FY 2026 (Final) - Benguet.xlsx')).toBe(
      'PPMP-FY-2026-Final-Benguet.xlsx',
    )
    expect(sanitizeFileName('Pagsasanay sa Kape – Ñ.pdf')).toBe('Pagsasanay-sa-Kape-N.pdf')
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFileName('C:\\Users\\me\\DV 1.pdf')).toBe('DV-1.pdf')
    expect(sanitizeFileName('???.png')).toBe('file.png')
  })
})

describe('buildObjectKey', () => {
  it('nests by program, year and attachment id', () => {
    expect(
      buildObjectKey({
        programCode: 'HVC',
        year: 2026,
        attachmentId: 'abc',
        fileName: 'DV 001.pdf',
      }),
    ).toBe('HVC/2026/abc/DV-001.pdf')
    expect(
      buildObjectKey({ programCode: null, year: 2026, attachmentId: 'x', fileName: 'memo.pdf' }),
    ).toBe('shared/2026/x/memo.pdf')
  })
})

describe('validateUpload', () => {
  const policy = DEFAULT_UPLOAD_POLICY
  it('accepts allowed types and normalizes missing MIME types', () => {
    expect(
      validateUpload(policy, { fileName: 'a.pdf', size: 10, mimeType: 'application/pdf' }),
    ).toEqual({
      ok: true,
      extension: 'pdf',
      mimeType: 'application/pdf',
    })
    expect(validateUpload(policy, { fileName: 'grid.csv', size: 10, mimeType: '' })).toMatchObject({
      ok: true,
      mimeType: 'text/csv',
    })
    expect(
      validateUpload(policy, {
        fileName: 'grid.csv',
        size: 10,
        mimeType: 'application/vnd.ms-excel',
      }),
    ).toMatchObject({ ok: true })
  })

  it('rejects disallowed extensions, oversize, empty and mismatched files', () => {
    expect(validateUpload(policy, { fileName: 'run.exe', size: 10, mimeType: '' })).toMatchObject({
      ok: false,
    })
    expect(validateUpload(policy, { fileName: 'noext', size: 10, mimeType: '' })).toMatchObject({
      ok: false,
    })
    expect(
      validateUpload(policy, {
        fileName: 'big.pdf',
        size: 26 * 1024 * 1024,
        mimeType: 'application/pdf',
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/25 MB/) })
    expect(validateUpload(policy, { fileName: 'a.pdf', size: 0, mimeType: '' })).toMatchObject({
      ok: false,
    })
    expect(
      validateUpload(policy, { fileName: 'a.pdf', size: 5, mimeType: 'text/html' }),
    ).toMatchObject({
      ok: false,
    })
  })

  it('never exceeds the hard 25 MB cap even if settings say more', () => {
    expect(
      validateUpload(
        { ...policy, max_mb: 100 },
        { fileName: 'a.pdf', size: 30 * 1024 * 1024, mimeType: 'application/pdf' },
      ),
    ).toMatchObject({ ok: false })
  })
})

describe('clampTtl / contentDisposition', () => {
  it('keeps presigned URLs between 1 and 10 minutes', () => {
    expect(clampTtl(3600)).toBe(600)
    expect(clampTtl(5)).toBe(60)
    expect(clampTtl(undefined)).toBe(600)
  })

  it('encodes non-ASCII file names safely', () => {
    expect(contentDisposition('attachment', 'Ulat "Ñ".pdf')).toBe(
      `attachment; filename="Ulat ___.pdf"; filename*=UTF-8''Ulat%20%22%C3%91%22.pdf`,
    )
  })
})
