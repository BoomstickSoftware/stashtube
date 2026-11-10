import { dataCache } from '../cache/data.ts'
import { config } from '../config.ts'
import type { FindPerformersResultType, FindScenesResultType, FindStudiosResultType, FindTagsResultType } from '../stash.schema.ts'
import { gql } from './client.ts'

// --- change detection ---------------------------------------------------------------
// Scans, Identify and edits in Stash's own UI bump counts or updated_at. One small query
// per poll, only while flix is in use, marks the query cache stale when anything moved:
// pages keep loading instantly from the old results while they refresh.
// (Play activity does not bump updated_at; flix's own writes invalidate directly.)

let lastFingerprint: string | null = null
let lastActivity = 0
let lastCheck = 0
const IDLE_AFTER = 10 * 60_000

// Decides when the listeners (the re-warm of the home feed, facets and tiles) run after the
// fingerprint moved. The cache is expired on the spot, but a scan or an import moves the
// fingerprint on every poll, and warming ~20 queries a minute against a locked database only
// competes with the user: wait until it has held still for `stablePolls` polls in a row, and
// never warm more than once per `minGap` ms. Exported for tests.
export class WarmDebounce {
  private stablePolls: number
  private minGap: number
  private pending = false
  private stable = 0
  private lastWarm = -Infinity // the gap applies only after a warm has run

  constructor(opts: { stablePolls: number; minGap: number }) {
    this.stablePolls = opts.stablePolls
    this.minGap = opts.minGap
  }

  // Called once per poll with whether the fingerprint moved; true when it is time to warm.
  poll(changed: boolean, now = Date.now()): boolean {
    if (changed) {
      this.pending = true
      this.stable = 0
      return false
    }
    if (!this.pending) return false
    this.stable++
    if (this.stable < this.stablePolls || now - this.lastWarm < this.minGap) return false
    this.pending = false
    this.lastWarm = now
    return true
  }
}

const warmDebounce = new WarmDebounce({ stablePolls: 2, minGap: 5 * 60_000 })

// Exported as `libraryFingerprint`: the hourly category sync runs only when it differs from the
// one at its last successful run (categorySync.ts).
export async function fingerprint(): Promise<string> {
  const d = await gql<{ s: FindScenesResultType; p: FindPerformersResultType; st: FindStudiosResultType; t: FindTagsResultType }>(`{
    s: findScenes(filter: { per_page: 1, sort: "updated_at", direction: DESC }) { count scenes { updated_at } }
    p: findPerformers(filter: { per_page: 1, sort: "updated_at", direction: DESC }) { count performers { updated_at } }
    st: findStudios(filter: { per_page: 1, sort: "updated_at", direction: DESC }) { count studios { updated_at } }
    t: findTags(filter: { per_page: 1, sort: "updated_at", direction: DESC }) { count tags { updated_at } }
  }`, {}, 'changeChecks')
  const fp = JSON.stringify([
    d.s.count, d.s.scenes[0]?.updated_at,
    d.p.count, d.p.performers[0]?.updated_at,
    d.st.count, d.st.studios[0]?.updated_at,
    d.t.count, d.t.tags[0]?.updated_at,
  ])
  return fp
}

export async function checkForChanges() {
  lastCheck = Date.now()
  const fp = await fingerprint()
  const changed = lastFingerprint !== null && fp !== lastFingerprint
  if (changed) {
    console.log('stash data changed; refreshing cached queries')
    dataCache.expireExcept('whisparr', 'stashdb') // those answers do not come from Stash
  }
  if (warmDebounce.poll(changed)) {
    console.log('stash data settled; re-warming')
    for (const fn of changeListeners) fn()
  }
  lastFingerprint = fp
}

// After flix's own bulk writes (the Cast sync), take Stash's new fingerprint as the baseline, so
// those writes are not seen as an outside change that expires everything and re-warms again.
// The cache entries they affect were already expired by the writes themselves.
export async function acceptOwnChanges() {
  if (lastFingerprint !== null) lastFingerprint = await fingerprint()
}

const changeListeners: (() => void)[] = []
// Runs once Stash has settled after a change that marked the cache stale (two unchanged polls
// in a row, at most every 5 min), e.g. to re-warm the home feed.
export function onStashChange(fn: () => void) {
  changeListeners.push(fn)
}

// Whether flix answered an API request in the last `ms` (background jobs pace themselves by it).
export const activeWithin = (ms: number) => Date.now() - lastActivity < ms

// Call on every API request. After an idle spell, check before trusting cached data.
export function noteActivity() {
  const now = Date.now()
  const wasIdle = now - lastActivity > IDLE_AFTER
  lastActivity = now
  if (config.cache.pollInterval && wasIdle && now - lastCheck > config.cache.pollInterval) {
    checkForChanges().catch((e) => console.error('change check:', e.message))
  }
}

// The poll's gate (index.ts registers the job): only while flix is in use.
export const usedRecently = () => Date.now() - lastActivity < IDLE_AFTER
