// Media endpoints. The browser never talks to Stash: generated assets come from the disk
// cache (filled from Stash with the API key), transcodes are proxied, and original files
// are served straight from the NFS mount when MEDIA_PATH_MAP resolves them.
import { IMAGE_WIDTHS } from '@flix/shared'
import { Hono } from 'hono'
import { stat } from 'node:fs/promises'
import { AssetCache } from './cache/assets.ts'
import { config } from './config.ts'
import { serveFile } from './files.ts'
import { sceneFilePath, stashFetch } from './stash.ts'

export const media = new Hono()

export const assetCache = new AssetCache({
  dir: `${config.cache.dir}/assets`,
  ttl: config.cache.assetTtl,
  missTtl: 60_000,
  maxBytes: config.cache.assetMaxBytes,
  upstream: (path, headers) => stashFetch(path, headers),
})

const ALLOWED = /^\/(scene|performer|studio|tag|group)\//
const STREAM = /^\/scene\/\d+\/stream/
const WIDTHS = new Set<number>(IMAGE_WIDTHS)
const PASS_REQUEST = ['range', 'if-none-match', 'if-modified-since']
const PASS_RESPONSE = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
}

// Streams and transcodes: passed through, never cached.
async function proxyStream(path: string, req: Request): Promise<Response> {
  const headers: Record<string, string> = {}
  for (const h of PASS_REQUEST) {
    const v = req.headers.get(h)
    if (v) headers[h] = v
  }
  const upstream = await stashFetch(path, headers, req.signal)
  const out = new Headers({ 'cache-control': 'no-store' })
  for (const h of PASS_RESPONSE) {
    const v = upstream.headers.get(h)
    if (v) out.set(h, v)
  }
  // HLS playlists reference segments by root-relative Stash paths. Segments inherit the
  // playlist's signed token so an AirPlay receiver can fetch them too.
  if ((upstream.headers.get('content-type') ?? '').includes('mpegurl')) {
    const st = new URL(req.url).searchParams.get('st')
    const text = (await upstream.text()).replace(/^\/scene\/(.*)$/gm, (_m, rest: string) => {
      const line = `/media/stash/scene/${rest}`
      return st ? `${line}${line.includes('?') ? '&' : '?'}st=${encodeURIComponent(st)}` : line
    })
    out.delete('content-length')
    return new Response(text, { status: upstream.status, headers: out })
  }
  return new Response(upstream.body, { status: upstream.status, headers: out })
}

media.get('/stash/*', async (c) => {
  const url = new URL(c.req.url)
  const path = url.pathname.replace(/^\/media\/stash/, '')
  if (!ALLOWED.test(path) || path.includes('..')) return c.notFound()
  if (STREAM.test(path)) {
    url.searchParams.delete('st') // flix's token, not Stash's
    return proxyStream(path + url.search, c.req.raw)
  }
  // ?t= is Stash's version stamp (screenshots, images), so those URLs never change content.
  // Previews and sprites change only if Stash regenerates them.
  const cacheControl = url.searchParams.has('t') ? 'private, max-age=31536000, immutable' : 'private, max-age=604800'
  // ?w= asks for a smaller copy of an image (flix's own parameter, never sent to Stash); only
  // a few widths, so the cache holds a bounded number of copies.
  const w = Number(url.searchParams.get('w'))
  url.searchParams.delete('w')
  if (WIDTHS.has(w)) return assetCache.serveResized(path + url.search, w, c.req.raw, cacheControl)
  return assetCache.serve(path + url.search, c.req.raw, cacheControl)
})

// The file on this host's media mount (MEDIA_PATH_MAP), or null when it is not mounted here.
export function localPath(stashPath: string): string | null {
  for (const [from, to] of config.mediaPathMap) {
    if (stashPath === from || stashPath.startsWith(from + '/')) return to + stashPath.slice(from.length)
  }
  return null
}

// Original file, with byte ranges. NFS mount first, Stash's direct stream otherwise.
media.get('/play/:id', async (c) => {
  const id = c.req.param('id')
  const stashPath = await sceneFilePath(id)
  if (!stashPath) return c.notFound()
  const file = localPath(stashPath)
  const info = file ? await stat(file).catch(() => null) : null
  if (!file || !info?.isFile()) return proxyStream(`/scene/${id}/stream`, c.req.raw)
  const ext = file.split('.').pop()!.toLowerCase()
  return serveFile(file, info.size, c.req.raw, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
})
