// In-memory cache for Stash query results.
//
// - TTL per entry; after it, the entry is stale: served at once while one background refresh
//   runs (stale-while-revalidate), until `staleFor` runs out too.
// - Concurrent callers of the same key share one upstream request.
// - Entries carry tags so a write can drop everything it affects, or only mark it stale. A
//   fetch that was running when one of its own tags changed is not stored (it may hold the
//   old data), and the next read starts a new one; fetches with other tags are unaffected, so
//   a progress save every 15 s does not throw away a whole-library query in flight.
// - LRU: Map insertion order, re-inserted on every hit.
// - save()/load() keep entries across restarts, so a new process does not start cold. Entries
//   tagged VOLATILE (large raw working sets that are cheap to rebuild) stay in memory only and
//   are capped on their own; entries tagged PINNED stay in memory only too but are never swept
//   by that cap (the few expensive working sets every page leans on).
// - A computed answer cached over other cached reads (the facets over their raw scene set, the
//   home feed over its rows) asks for `freshInputs`: while its loader runs, the reads it makes
//   are not served stale but wait for their refresh, so a stale input cannot be re-stored as a
//   fresh answer. Carried by AsyncLocalStorage, so nothing has to be threaded through.

import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

interface Entry<T> {
  value: T
  fresh: number // expiry time
  stale: number // serve-stale deadline
  tags: string[]
}

export interface MemoryStats {
  entries: number
  hits: number
  staleHits: number
  misses: number
  coalesced: number
  evictions: number
  invalidations: number
}

export const VOLATILE = 'volatile'
const EXPIRED_SAVE_GAP = 15 * 60_000
export const PINNED = 'pinned'

// Set while a `freshInputs` loader runs: nested reads must not answer with a stale entry.
const wantFresh = new AsyncLocalStorage<true>()

export class MemoryCache {
  private entries = new Map<string, Entry<unknown>>()
  private inflight = new Map<string, { p: Promise<unknown>; tags: string[] }>()
  private tick = 0 // counts invalidate/expire/clear calls
  private changed = new Map<string, number>() // tag -> tick of its last change
  private allChanged = 0 // tick of the last change that touched every entry
  private dirty = false // changed since the last save
  // Only marked stale since the last save: a progress save every 15 s does that, and rewriting a
  // 3 MB snapshot every 2 minutes of playback for it bought nothing. Such changes are written at
  // most every EXPIRED_SAVE_GAP (a restart in between restores a few entries as fresh that were
  // stale; change detection and the next write put them right).
  private expiredOnly = false
  private lastSave = 0
  private s = { hits: 0, staleHits: 0, misses: 0, coalesced: 0, evictions: 0, invalidations: 0 }
  private maxEntries: number
  private maxVolatile: number
  private staleFor: number

  // `maxVolatile` caps the VOLATILE entries on their own: each can be hundreds of KB (a filter
  // set's raw scenes), so the entry cap alone would let them reach a gigabyte.
  constructor(opts: { maxEntries: number; staleFor: number; maxVolatile?: number }) {
    this.maxEntries = opts.maxEntries
    this.maxVolatile = opts.maxVolatile ?? 30
    this.staleFor = opts.staleFor
  }

  // `staleFor` overrides the cache-wide serve-stale window for this entry: answers kept per visit
  // (the home feed per seed, a Featured ranking) are worth little once the visit is over, and with
  // a seed every few minutes a week of them would bloat memory and the snapshot.
  async get<T>(key: string, ttl: number, tags: string[], load: () => Promise<T>, opts: { freshInputs?: boolean; staleFor?: number } = {}): Promise<T> {
    const now = Date.now()
    const e = this.entries.get(key) as Entry<T> | undefined
    const run = opts.freshInputs ? () => wantFresh.run(true, load) : load
    if (e && now < e.stale) {
      this.entries.delete(key)
      this.entries.set(key, e)
      if (now < e.fresh) {
        this.s.hits++
        return e.value
      }
      if (!wantFresh.getStore()) {
        this.s.staleHits++
        this.fetch(key, ttl, tags, run, opts.staleFor).catch(() => {}) // keep serving stale if Stash is down
        return e.value
      }
      // an input of a computed answer: wait for the refresh rather than hand back the old value
    }
    this.s.misses++
    return this.fetch(key, ttl, tags, run, opts.staleFor)
  }

  // Replace a live entry's value in place (a list patched after a write instead of refetched);
  // its age and tags stay. Nothing happens when the entry is gone.
  patch<T>(key: string, fn: (value: T) => T) {
    const e = this.entries.get(key) as Entry<T> | undefined
    if (!e || Date.now() >= e.stale) return
    e.value = fn(e.value)
    this.dirty = true
  }

  private fetch<T>(key: string, ttl: number, tags: string[], load: () => Promise<T>, staleFor = this.staleFor): Promise<T> {
    const running = this.inflight.get(key)
    if (running) {
      this.s.coalesced++
      return running.p as Promise<T>
    }
    const started = this.tick
    const p: Promise<T> = load()
      .then((value) => {
        if (!this.changedSince(started, tags)) this.set(key, value, ttl, tags, staleFor)
        return value
      })
      .finally(() => {
        if (this.inflight.get(key)?.p === p) this.inflight.delete(key)
      })
    this.inflight.set(key, { p, tags })
    return p
  }

  private changedSince(tick: number, tags: string[]) {
    return this.allChanged > tick || tags.some((t) => (this.changed.get(t) ?? 0) > tick)
  }

  // Record a change to these tags (none: everything); running fetches with them are let go.
  private mark(tags: string[]) {
    this.tick++
    if (!tags.length) this.allChanged = this.tick
    for (const t of tags) this.changed.set(t, this.tick)
    for (const [k, f] of this.inflight) if (!tags.length || f.tags.some((t) => tags.includes(t))) this.inflight.delete(k)
  }

  private set<T>(key: string, value: T, ttl: number, tags: string[], staleFor = this.staleFor) {
    const now = Date.now()
    this.entries.delete(key)
    this.entries.set(key, { value, fresh: now + ttl, stale: now + ttl + staleFor, tags })
    this.dirty = true
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value!)
      this.s.evictions++
    }
    if (tags.includes(VOLATILE) && !tags.includes(PINNED)) {
      const volatile = [...this.entries].filter(([, e]) => e.tags.includes(VOLATILE) && !e.tags.includes(PINNED)) // oldest first
      for (const [k] of volatile.slice(0, Math.max(0, volatile.length - this.maxVolatile))) {
        this.entries.delete(k)
        this.s.evictions++
      }
    }
  }

  // Drop every entry carrying any of these tags.
  invalidate(...tags: string[]) {
    this.mark(tags)
    for (const [k, e] of this.entries) {
      if (e.tags.some((t) => tags.includes(t))) {
        this.entries.delete(k)
        this.s.invalidations++
      }
    }
    this.dirty = true
  }

  // Mark entries carrying any of these tags (no tags: every entry) stale without dropping
  // them: the next read is answered at once and refreshed in the background.
  expire(...tags: string[]) {
    this.mark(tags)
    for (const e of this.entries.values()) {
      if (!tags.length || e.tags.some((t) => tags.includes(t))) e.fresh = 0
    }
    this.expiredOnly = true
  }

  clear() {
    this.mark([])
    this.s.invalidations += this.entries.size
    this.entries.clear()
    this.dirty = true
  }

  // Write all live entries to `file` (atomically) if anything changed since the last save.
  async save(file: string) {
    const now = Date.now()
    if (!this.dirty && !(this.expiredOnly && now - this.lastSave >= EXPIRED_SAVE_GAP)) return
    this.dirty = false
    this.expiredOnly = false
    this.lastSave = now
    const live = [...this.entries].filter(([, e]) => e.stale > now && !e.tags.includes(VOLATILE) && !e.tags.includes(PINNED))
    await mkdir(dirname(file), { recursive: true })
    await writeFile(`${file}.tmp`, JSON.stringify(live))
    await rename(`${file}.tmp`, file)
  }

  // Restore entries saved by save(); expired ones are skipped. A missing or unreadable file
  // just means a cold start.
  async load(file: string): Promise<number> {
    let saved: [string, Entry<unknown>][]
    try {
      saved = JSON.parse(await readFile(file, 'utf8'))
    } catch {
      return 0
    }
    const now = Date.now()
    for (const [k, e] of saved) {
      if (e.stale > now && !this.entries.has(k)) this.entries.set(k, e)
    }
    return this.entries.size
  }

  stats(): MemoryStats {
    return { entries: this.entries.size, ...this.s }
  }
}
