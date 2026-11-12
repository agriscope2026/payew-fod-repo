// Matching activity titles that are worded a little differently in different files.

/** Lower-case words without punctuation or plural endings. */
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length > 3 ? w.replace(/s$/, '') : w))
    .join(' ')

/** How alike two titles are: shared words over all words (Dice), ignoring numbering. */
export function titleSimilarity(a: string, b: string) {
  const words = (s: string) =>
    new Set(
      normalize(s)
        .split(' ')
        .filter((w) => w.length > 2 && !/^\d+$/.test(w)),
    )
  const x = words(a)
  const y = words(b)
  if (!x.size || !y.size) return 0
  let shared = 0
  for (const w of x) if (y.has(w)) shared++
  return (2 * shared) / (x.size + y.size)
}

/** The existing activity an imported row means, if one is close enough. */
export function matchActivity<T extends { id: string; title: string }>(title: string, list: T[]) {
  const exact = list.find((a) => normalize(a.title) === normalize(title))
  if (exact) return exact
  let best: T | undefined
  let score = 0.6
  for (const a of list) {
    const s = titleSimilarity(title, a.title)
    if (s > score) {
      best = a
      score = s
    }
  }
  return best
}
