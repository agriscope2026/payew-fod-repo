import { describe, expect, it } from 'vitest'
import { parseLink } from './links'

describe('parsing shared links', () => {
  it('recognizes Google Slides, Sheets and Docs and builds their preview address', () => {
    expect(
      parseLink('https://docs.google.com/presentation/d/1AbC-x_9/edit?usp=sharing'),
    ).toMatchObject({
      kind: 'presentation',
      embedUrl: 'https://docs.google.com/presentation/d/1AbC-x_9/preview',
    })
    expect(parseLink('https://docs.google.com/spreadsheets/d/1AWo/edit?gid=3#gid=3')?.kind).toBe(
      'spreadsheet',
    )
    expect(parseLink('https://docs.google.com/document/d/zzz/edit')?.embedUrl).toBe(
      'https://docs.google.com/document/d/zzz/preview',
    )
  })
  it('previews Drive files and folders', () => {
    expect(parseLink('https://drive.google.com/file/d/FILE_1/view?usp=drive_link')).toMatchObject({
      kind: null,
      embedUrl: 'https://drive.google.com/file/d/FILE_1/preview',
    })
    expect(parseLink('https://drive.google.com/open?id=FILE_2')?.embedUrl).toBe(
      'https://drive.google.com/file/d/FILE_2/preview',
    )
    expect(parseLink('https://drive.google.com/drive/folders/FOLDER_3?usp=sharing')).toMatchObject({
      kind: 'folder',
      embedUrl: 'https://drive.google.com/embeddedfolderview?id=FOLDER_3#grid',
    })
  })
  it('shows pictures directly and opens other links in a new tab', () => {
    expect(parseLink('https://example.com/photos/site-visit.JPG')).toMatchObject({
      kind: 'image',
      imageUrl: 'https://example.com/photos/site-visit.JPG',
    })
    expect(parseLink('https://example.com/report.pptx')).toMatchObject({
      kind: 'presentation',
      embedUrl: null,
    })
    expect(parseLink('https://da.gov.ph/about')).toMatchObject({ kind: 'link', embedUrl: null })
  })
  it('refuses anything that is not an https address', () => {
    expect(parseLink('http://example.com/a.pdf')).toBeNull()
    expect(parseLink('javascript:alert(1)')).toBeNull()
    expect(parseLink('not a link')).toBeNull()
  })
})
