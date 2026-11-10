// The one query cache: Stash's answers and what flix computes over them, Whisparr's lists and
// StashDB's pages (tagged `whisparr` / `stashdb`, which a Stash change leaves alone).
import { config } from '../config.ts'
import { MemoryCache } from './memory.ts'

export const dataCache = new MemoryCache({
  maxEntries: config.cache.dataMaxEntries,
  staleFor: config.cache.dataStaleFor,
  // The per-filter facet working sets share this cap (30 let a long shelf session evict the
  // facets, 2026-10-31); the sets every page leans on (the unfiltered facets, the tiles,
  // sceneStashIdMap, Whisparr's list) are PINNED and never swept.
  maxVolatile: 60,
})

// The finished home feed (home.ts homeRows), one entry per visit seed: dropped by a pinned-row,
// settings or blocklist write, left stale by what its rows carry.
export const HOME = 'home-rows'
export const HOME_TTL = 5 * 60_000

// The whole-library pool Featured scores (stash/featured.ts): a play or an edit marks it stale
// instead of dropping it (stash/client.ts mutate).
export const POOL = 'featured-pool'
