import type { SceneQuery } from '@flix/shared'

// The pure parts of station previews (stations.ts does the fetching).

// A seed per station and day: stations that overlap do not open on the same picture, and a
// card keeps its pictures for the day instead of reshuffling on every visit.
export const previewSeed = (day: number, q: SceneQuery) => day + [...JSON.stringify(q)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100_000, 7)

// `Promise.all` with at most `limit` tasks in flight, in input order. Stash answers a handful of
// queries at once happily; a few dozen at once would only queue inside it.
export async function mapBounded<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
