// Name searches answer a capped list ranked by something else (video count, StashDB's own order),
// so the one you typed could miss the cut: "creampie" on StashDB gave 12 longer names and not
// "Creampie" itself. These put what the term names first: the exact name, then names that start
// with it, then names with a word that starts with it, then the rest, each group in its own order.

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export function nameRank(name: string, term: string): number {
  const n = norm(name)
  const t = norm(term)
  if (!t) return 3
  if (n === t) return 0
  if (n.startsWith(t)) return 1
  if (n.split(/[^a-z0-9]+/).some((w) => w.startsWith(t))) return 2
  return 3
}

// Stable: within a group the incoming order (count, relevance) holds.
export function byNameMatch<T>(items: T[], term: string, name: (t: T) => string): T[] {
  return items
    .map((it, i) => ({ it, i, r: nameRank(name(it), term) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.it)
}
