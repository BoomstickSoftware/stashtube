// In-memory cache for Stash query results.
//
// - TTL per entry; after it, the entry is stale: served at once while one background refresh
//   runs (stale-while-revalidate), until `staleFor` runs out too.
// - Concurrent callers of the same key share one upstream request.
// - Entries carry tags so a write can drop everything it affects.
// - LRU: Map insertion order, re-inserted on every hit.

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
  }

  clear() {
    this.generation++
    this.s.invalidations += this.entries.size
    this.entries.clear()
  }

  stats(): MemoryStats {
    return { entries: this.entries.size, ...this.s }
  }
}
