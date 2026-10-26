import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'

// Serve a local file with byte-range support (videos seek with Range requests).
export function serveFile(
  file: string,
  size: number,
  req: Request,
  headers: Record<string, string>,
): Response {
  const out = new Headers({ ...headers, 'accept-ranges': 'bytes' })
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '')
  let start = 0
  let end = size - 1
  let status = 200
  if (range && size > 0) {
    if (range[1]) {
      start = Number(range[1])
      if (range[2]) end = Math.min(Number(range[2]), size - 1)
    } else if (range[2]) {
      start = Math.max(0, size - Number(range[2]))
    }
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
    }
    status = 206
    out.set('content-range', `bytes ${start}-${end}/${size}`)
  }
  out.set('content-length', String(size === 0 ? 0 : end - start + 1))
  if (req.method === 'HEAD' || size === 0) return new Response(null, { status, headers: out })
  const stream = createReadStream(file, { start, end, highWaterMark: 1 << 20 })
  req.signal.addEventListener('abort', () => stream.destroy())
  return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers: out })
}
