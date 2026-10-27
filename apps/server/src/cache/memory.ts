// In-memory cache for Stash query results.
//
// - TTL per entry; after it, the entry is stale: served at once while one background refresh
//   runs (stale-while-revalidate), until `staleFor` runs out too.
// - Concurrent callers of the same key share one upstream request.
// - Entries carry tags so a write can drop everything it affects, or only mark it stale.
// - LRU: Map insertion order, re-inserted on every hit.
// - save()/load() keep entries across restarts, so a new process does not start cold.

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

export class MemoryCache {
  private entries = new Map<string, Entry<unknown>>()
  private inflight = new Map<string, Promise<unknown>>()
  private generation = 0 // bumped on clear/invalidate so in-flight results from before are not stored
  private dirty = false // changed since the last save
  private s = { hits: 0, staleHits: 0, misses: 0, coalesced: 0, evictions: 0, invalidations: 0 }
  private maxEntries: number
  private staleFor: number

  constructor(opts: { maxEntries: number; staleFor: number }) {
    this.maxEntries = opts.maxEntries
    this.staleFor = opts.staleFor
  }

  async get<T>(key: string, ttl: number, tags: string[], load: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const e = this.entries.get(key) as Entry<T> | undefined
    if (e && now < e.stale) {
      this.entries.delete(key)
      this.entries.set(key, e)
      if (now < e.fresh) {
        this.s.hits++
      } else {
        this.s.staleHits++
        this.fetch(key, ttl, tags, load).catch(() => {}) // keep serving stale if Stash is down
      }
      return e.value
    }
    this.s.misses++
    return this.fetch(key, ttl, tags, load)
  }

  private fetch<T>(key: string, ttl: number, tags: string[], load: () => Promise<T>): Promise<T> {
    const running = this.inflight.get(key) as Promise<T> | undefined
    if (running) {
      this.s.coalesced++
      return running
    }
    const gen = this.generation
    const p = load()
      .then((value) => {
        if (gen === this.generation) this.set(key, value, ttl, tags)
        return value
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, p)
    return p
  }

  private set<T>(key: string, value: T, ttl: number, tags: string[]) {
    const now = Date.now()
    this.entries.delete(key)
    this.entries.set(key, { value, fresh: now + ttl, stale: now + ttl + this.staleFor, tags })
    this.dirty = true
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value!)
      this.s.evictions++
    }
  }

  // Drop every entry carrying any of these tags.
  invalidate(...tags: string[]) {
    this.generation++
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
    this.generation++
    for (const e of this.entries.values()) {
      if (!tags.length || e.tags.some((t) => tags.includes(t))) e.fresh = 0
    }
    this.dirty = true
  }

  clear() {
    this.generation++
    this.s.invalidations += this.entries.size
    this.entries.clear()
    this.dirty = true
  }

  // Write all live entries to `file` (atomically) if anything changed since the last save.
  async save(file: string) {
    if (!this.dirty) return
    this.dirty = false
    const now = Date.now()
    const live = [...this.entries].filter(([, e]) => e.stale > now)
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
