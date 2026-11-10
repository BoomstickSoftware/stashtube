// Disk cache for Stash's generated assets: screenshots, preview clips, sprite sheets, sprite
// VTTs, and performer / studio / tag images. These are most of the requests a tube-style UI
// makes (one screenshot per card), and they change rarely.
//
// Layout: <dir>/<k[0..2]>/<k>.bin + <k>.json (metadata), k = sha256 of the Stash path+query.
// - A path with Stash's version stamp (`?t=`, on screenshots and images) is fresh forever: a
//   changed image comes under a new URL. Others (previews, sprites, VTTs) are fresh for `ttl`;
//   after that, revalidated with If-None-Match / If-Modified-Since when Stash gave a
//   validator, refetched otherwise. If Stash is unreachable, the stale copy is served.
// - Stash 404s (e.g. a preview not generated yet) are remembered for `missTtl`, in memory.
// - Total size capped at `maxBytes`, least recently used first out.
// - Smaller copies of images (`resized`): made once from the cached original with sharp, as
//   WebP, and cached under their own key, so a card never downloads a 1920 px screenshot.
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import sharp from 'sharp'
import { serveFile } from '../files.ts'

interface Meta {
  path: string
  type: string
  etag: string | null
  lastModified: string | null
  size: number
  fetchedAt: number
}

interface IndexEntry {
  size: number
  used: number
  meta?: Meta // read from disk on first use, then kept here: a hit costs no file reads
}

export interface AssetStats {
  files: number
  bytes: number
  maxBytes: number
  hits: number
  misses: number
  revalidated: number // 304 from Stash
  refetched: number
  staleServed: number // Stash failed, old copy served
  notFound: number
  evictions: number
}

type Upstream = (path: string, headers: Record<string, string>) => Promise<Response>

const MISS_RETRIES = [1000, 2000] // ms; see fetchUpstream
const VERSIONED = /[?&]t=/
// The weak ETag a cached file gets when upstream sent none (resized copies, Stash's generated
// clips and sprites), so a browser's If-None-Match can be answered 304. Never sent to Stash.
const OWN_ETAG = /^W\/"flix-/
const ownEtag = (m: Meta) => `W/"flix-${m.size.toString(36)}-${m.fetchedAt.toString(36)}"`
const RESIZE_QUALITY = 72 // WebP; a 640 px screenshot comes to ~30 KB
const key = (path: string) => createHash('sha256').update(path).digest('hex')

export class AssetCache {
  private index = new Map<string, IndexEntry>()
  private bytes = 0
  private inflight = new Map<string, Promise<Meta | null>>()
  private resizing = new Map<string, Promise<Meta | null>>()
  private missing = new Map<string, number>()
  private s = { hits: 0, misses: 0, revalidated: 0, refetched: 0, staleServed: 0, notFound: 0, evictions: 0 }
  private ready: Promise<void>
  private dir: string
  private ttl: number
  private missTtl: number
  private maxBytes: number
  private upstream: Upstream

  constructor(opts: { dir: string; ttl: number; missTtl: number; maxBytes: number; upstream: Upstream }) {
    this.dir = opts.dir
    this.ttl = opts.ttl
    this.missTtl = opts.missTtl
    this.maxBytes = opts.maxBytes
    this.upstream = opts.upstream
    this.ready = this.load()
  }

  // Rebuild the size index from disk; access times start at file mtime.
  private async load() {
    await mkdir(this.dir, { recursive: true })
    for (const shard of await readdir(this.dir).catch(() => [])) {
      for (const name of await readdir(join(this.dir, shard)).catch(() => [])) {
        if (!name.endsWith('.bin')) continue
        const st = await stat(join(this.dir, shard, name)).catch(() => null)
        if (!st) continue
        this.index.set(name.slice(0, -4), { size: st.size, used: st.mtimeMs })
        this.bytes += st.size
      }
    }
  }

  private files(k: string) {
    const d = join(this.dir, k.slice(0, 2))
    return { d, bin: join(d, `${k}.bin`), meta: join(d, `${k}.json`) }
  }

  private async readMeta(k: string): Promise<Meta | null> {
    const e = this.index.get(k)
    if (e?.meta) return e.meta
    try {
      const meta = JSON.parse(await readFile(this.files(k).meta, 'utf8')) as Meta
      if (e) e.meta = meta
      return meta
    } catch {
      return null
    }
  }

  async serve(path: string, req: Request, cacheControl: string): Promise<Response> {
    await this.ready
    const k = key(path)
    const miss = this.missing.get(k)
    if (miss && miss > Date.now()) {
      this.s.notFound++
      return new Response(null, { status: 404 })
    }

    let meta = await this.readMeta(k)
    if (meta && (VERSIONED.test(path) || Date.now() - meta.fetchedAt < this.ttl)) {
      this.s.hits++
    } else {
      if (!meta) this.s.misses++
      meta = await this.refresh(k, path, meta)
      if (!meta) return new Response(null, { status: 404 })
    }

    const entry = this.index.get(k)
    if (!entry) {
      await this.remove(k) // metadata without a file: drop it and fetch again
      return this.serve(path, req, cacheControl)
    }
    return this.send(k, entry, meta, req, cacheControl)
  }

  // The image at `path`, at most `width` px wide. Anything sharp cannot shrink (not a raster
  // image, a broken file) is served as the original.
  async serveResized(path: string, width: number, req: Request, cacheControl: string): Promise<Response> {
    await this.ready
    const vpath = `${path}#w=${width}`
    const k = key(vpath)
    let meta = await this.readMeta(k)
    if (meta && this.index.has(k) && (VERSIONED.test(path) || Date.now() - meta.fetchedAt < this.ttl)) {
      this.s.hits++
    } else {
      meta = await this.resize(k, vpath, path, width)
      if (!meta) return this.serve(path, req, cacheControl)
    }
    const entry = this.index.get(k)
    if (!entry) return this.serve(path, req, cacheControl)
    return this.send(k, entry, meta, req, cacheControl)
  }

  private send(k: string, entry: IndexEntry, meta: Meta, req: Request, cacheControl: string): Promise<Response> | Response {
    entry.used = Date.now()
    const headers: Record<string, string> = { 'content-type': meta.type, 'cache-control': cacheControl }
    if (meta.etag) {
      headers.etag = meta.etag
      if (req.headers.get('if-none-match') === meta.etag) return new Response(null, { status: 304, headers })
    }
    return serveFile(this.files(k).bin, entry.size, req, headers)
  }

  // Make sure a path is cached and fresh, without serving it (the nightly warm). Returns
  // the cached file, or null when Stash has nothing there.
  async warm(path: string): Promise<{ file: string; fetched: boolean } | null> {
    await this.ready
    const k = key(path)
    const miss = this.missing.get(k)
    if (miss && miss > Date.now()) return null
    let meta = await this.readMeta(k)
    let fetched = false
    if (!meta || !(VERSIONED.test(path) || Date.now() - meta.fetchedAt < this.ttl)) {
      if (!meta) this.s.misses++
      meta = await this.refresh(k, path, meta)
      if (!meta) return null
      fetched = true
    }
    return { file: this.files(k).bin, fetched }
  }

  // One upstream request per key at a time.
  private refresh(k: string, path: string, old: Meta | null): Promise<Meta | null> {
    let p = this.inflight.get(k)
    if (!p) {
      p = this.fetchUpstream(k, path, old).finally(() => this.inflight.delete(k))
      this.inflight.set(k, p)
    }
    return p
  }

  // Make sure the `width` copy of an image exists (the nightly warm); false if it cannot be made.
  async warmResized(path: string, width: number): Promise<boolean> {
    await this.ready
    const vpath = `${path}#w=${width}`
    const k = key(vpath)
    if (this.index.has(k) && VERSIONED.test(path)) return true
    return !!(await this.resize(k, vpath, path, width))
  }

  // One resize per variant at a time; null when the original is missing or not shrinkable.
  private resize(k: string, vpath: string, path: string, width: number): Promise<Meta | null> {
    let p = this.resizing.get(k)
    if (!p) {
      p = (async () => {
        const orig = await this.warm(path).catch(() => null)
        const type = orig && (await this.readMeta(key(path)))?.type
        if (!orig || !type?.startsWith('image/') || type.includes('svg')) return null
        try {
          const buf = await sharp(orig.file).resize({ width, withoutEnlargement: true }).webp({ quality: RESIZE_QUALITY }).toBuffer()
          const f = this.files(k)
          await mkdir(f.d, { recursive: true })
          const tmp = join(f.d, `.${randomUUID()}.tmp`)
          await writeFile(tmp, buf)
          return await this.commit(k, tmp, { path: vpath, type: 'image/webp', etag: null, lastModified: null, size: buf.length, fetchedAt: Date.now() })
        } catch {
          return null
        }
      })().finally(() => this.resizing.delete(k))
      this.resizing.set(k, p)
    }
    return p
  }

  private async fetchUpstream(k: string, path: string, old: Meta | null): Promise<Meta | null> {
    const headers: Record<string, string> = {}
    if (old?.etag && !OWN_ETAG.test(old.etag)) headers['if-none-match'] = old.etag
    else if (old?.lastModified) headers['if-modified-since'] = old.lastModified
    let res: Response
    try {
      res = await this.upstream(path, headers)
      // A first fetch that 404s may only mean Stash's database is locked by a scan
      // (it answers 404 then); try twice more before believing it.
      for (const wait of old ? [] : MISS_RETRIES) {
        if (res.status !== 404) break
        await res.body?.cancel()
        await new Promise((r) => setTimeout(r, wait))
        res = await this.upstream(path, headers)
      }
    } catch (e) {
      if (old) {
        this.s.staleServed++
        return old
      }
      throw e
    }

    const f = this.files(k)
    if (res.status === 304 && old) {
      this.s.revalidated++
      const meta = { ...old, fetchedAt: Date.now() }
      await writeFile(f.meta, JSON.stringify(meta))
      const e = this.index.get(k)
      if (e) e.meta = meta
      return meta
    }
    if (res.status === 404) {
      await res.body?.cancel()
      // Stash also answers 404 while its database is locked by a scan, so a 404 never
      // throws away a copy we already have; it is only remembered briefly.
      if (old) {
        this.s.staleServed++
        return old
      }
      this.missing.set(k, Date.now() + this.missTtl)
      this.s.notFound++
      return null
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel()
      if (old) {
        this.s.staleServed++
        return old
      }
      throw new Error(`Stash ${res.status} for ${path}`)
    }

    if (old) this.s.refetched++
    await mkdir(f.d, { recursive: true })
    const tmp = join(f.d, `.${randomUUID()}.tmp`)
    try {
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp))
    } catch (e) {
      // the body broke off (a timeout, Stash restarting): no half file, and the old copy if any
      await rm(tmp, { force: true })
      if (old) {
        this.s.staleServed++
        return old
      }
      throw e
    }
    return this.commit(k, tmp, {
      path,
      type: res.headers.get('content-type') ?? 'application/octet-stream',
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      size: (await stat(tmp)).size,
      fetchedAt: Date.now(),
    })
  }

  // A finished download (or resize) in `tmp` becomes the cached file for `k`.
  private async commit(k: string, tmp: string, meta: Meta): Promise<Meta> {
    const f = this.files(k)
    const prev = this.index.get(k)
    if (!meta.etag) meta = { ...meta, etag: ownEtag(meta) }
    await rename(tmp, f.bin)
    await writeFile(f.meta, JSON.stringify(meta))
    this.bytes += meta.size - (prev?.size ?? 0)
    this.index.set(k, { size: meta.size, used: Date.now(), meta })
    this.missing.delete(k)
    await this.evict()
    return meta
  }

  private async remove(k: string) {
    const f = this.files(k)
    await rm(f.bin, { force: true })
    await rm(f.meta, { force: true })
    const e = this.index.get(k)
    if (e) this.bytes -= e.size
    this.index.delete(k)
  }

  private async evict() {
    if (this.bytes <= this.maxBytes) return
    const byAge = [...this.index.entries()].sort((a, b) => a[1].used - b[1].used)
    for (const [k] of byAge) {
      if (this.bytes <= this.maxBytes * 0.9) break
      if (this.inflight.has(k)) continue
      await this.remove(k)
      this.s.evictions++
    }
  }

  // Keep access order across restarts: stamp mtimes of recently used files.
  async flushAccessTimes() {
    const now = Date.now()
    for (const [k, e] of this.index) {
      if (now - e.used < 15 * 60_000) {
        const t = new Date(e.used)
        await utimes(this.files(k).bin, t, t).catch(() => {})
      }
    }
  }

  async clear() {
    await this.ready
    this.missing.clear()
    for (const k of Array.from(this.index.keys())) {
      if (!this.inflight.has(k)) await this.remove(k)
    }
  }

  stats(): AssetStats {
    return { files: this.index.size, bytes: this.bytes, maxBytes: this.maxBytes, ...this.s }
  }
}
