// Understanding links to files kept elsewhere (mostly Google Drive): what kind of
// file a link points to, and the address that shows it inside PAYEW.
import type { LinkedFileKind } from '@/types/database'

export interface ParsedLink {
  /** Best guess at the kind of file; null when the link doesn't say. */
  kind: LinkedFileKind | null
  /** Address to show in a frame, or null when it can only be opened in a new tab. */
  embedUrl: string | null
  /** A picture that can be shown directly. */
  imageUrl: string | null
  google: boolean
}

const GOOGLE_DOCS: Record<string, LinkedFileKind> = {
  presentation: 'presentation',
  spreadsheets: 'spreadsheet',
  document: 'document',
}

export const KIND_LABEL: Record<LinkedFileKind, string> = {
  presentation: 'Presentation',
  spreadsheet: 'Spreadsheet',
  document: 'Document',
  pdf: 'PDF',
  image: 'Image',
  video: 'Video',
  folder: 'Folder',
  link: 'Link',
}

/** Returns null unless the text is an https address. */
export function parseLink(text: string): ParsedLink | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  const path = url.pathname

  if (host === 'docs.google.com') {
    const m = /^\/(presentation|spreadsheets|document)\/d\/([\w-]+)/.exec(path)
    if (m) {
      return {
        kind: GOOGLE_DOCS[m[1]],
        embedUrl: `https://docs.google.com/${m[1]}/d/${m[2]}/preview`,
        imageUrl: null,
        google: true,
      }
    }
  }
  if (host === 'drive.google.com') {
    const file =
      /^\/file\/d\/([\w-]+)/.exec(path)?.[1] ??
      (path === '/open' || path === '/uc' ? url.searchParams.get('id') : null)
    if (file && /^[\w-]+$/.test(file)) {
      return {
        kind: null,
        embedUrl: `https://drive.google.com/file/d/${file}/preview`,
        imageUrl: null,
        google: true,
      }
    }
    const folder = /^\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)/.exec(path)?.[1]
    if (folder) {
      return {
        kind: 'folder',
        embedUrl: `https://drive.google.com/embeddedfolderview?id=${folder}#grid`,
        imageUrl: null,
        google: true,
      }
    }
  }
  if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'youtu.be') {
    const id = host === 'youtu.be' ? path.slice(1) : url.searchParams.get('v')
    if (id && /^[\w-]{6,}$/.test(id)) {
      return {
        kind: 'video',
        embedUrl: `https://www.youtube.com/embed/${id}`,
        imageUrl: null,
        google: false,
      }
    }
  }
  const ext = /\.([a-z0-9]{2,5})$/i.exec(path)?.[1]?.toLowerCase()
  if (ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'].includes(ext)) {
    return { kind: 'image', embedUrl: null, imageUrl: url.toString(), google: false }
  }
  const byExt: Record<string, LinkedFileKind> = {
    pptx: 'presentation',
    ppt: 'presentation',
    xlsx: 'spreadsheet',
    xls: 'spreadsheet',
    csv: 'spreadsheet',
    docx: 'document',
    doc: 'document',
    pdf: 'pdf',
    mp4: 'video',
  }
  return {
    kind: ext ? (byExt[ext] ?? 'link') : 'link',
    embedUrl: null,
    imageUrl: null,
    google: host.endsWith('google.com'),
  }
}
