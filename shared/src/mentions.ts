/** @mention helpers for the comment composer. Mentions are written as "@Full Name". */

export interface Mentionable {
  id: string
  full_name: string
}

/** The "@query" being typed just before the caret, if the caret is inside one. */
export function activeMention(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/\s/.test(before[at - 1])) return null // e-mail addresses, "a@b"
  const query = before.slice(at + 1)
  if (query.length > 40 || /[\n@]/.test(query) || (query.match(/ /g)?.length ?? 0) > 2) return null
  return { start: at, query }
}

/** Replaces the "@query" at [start, caret) with "@Full Name ". */
export function insertMention(text: string, start: number, caret: number, name: string) {
  const insert = `@${name} `
  return { text: text.slice(0, start) + insert + text.slice(caret), caret: start + insert.length }
}

/** People whose name (or a word of it) starts with the query; whole-name matches first. */
export function matchPeople<T extends Mentionable>(people: T[], query: string, limit = 6): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return people.slice(0, limit)
  return people
    .filter((p) => {
      const name = p.full_name.toLowerCase()
      return name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q))
    })
    .sort(
      (a, b) =>
        Number(!a.full_name.toLowerCase().startsWith(q)) -
          Number(!b.full_name.toLowerCase().startsWith(q)) ||
        a.full_name.localeCompare(b.full_name),
    )
    .slice(0, limit)
}

/** Ids of people whose "@Full Name" appears in the text (unique, in list order). */
export function extractMentions(text: string, people: Mentionable[]): string[] {
  return [
    ...new Set(
      people.filter((p) => p.full_name.trim() && text.includes(`@${p.full_name}`)).map((p) => p.id),
    ),
  ]
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Splits a comment body into plain text and "@Name" segments for highlighting. */
export function segmentMentions(
  body: string,
  names: string[],
): { text: string; mention: boolean }[] {
  const valid = [...new Set(names.filter((n) => n.trim()))].sort((a, b) => b.length - a.length)
  if (!valid.length) return [{ text: body, mention: false }]
  const re = new RegExp(`@(?:${valid.map(escapeRegExp).join('|')})`, 'g')
  const out: { text: string; mention: boolean }[] = []
  let last = 0
  for (const m of body.matchAll(re)) {
    if (m.index > last) out.push({ text: body.slice(last, m.index), mention: false })
    out.push({ text: m[0], mention: true })
    last = m.index + m[0].length
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false })
  return out
}

/** Initials for avatar fallbacks. */
export function initials(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}
