import type { Playback } from '@flix/shared'

// RFC 6381 codec strings for canPlayType. Unknown codecs fall back to HLS.
const VIDEO: Record<string, string> = {
  h264: 'avc1.640028',
  hevc: 'hvc1.1.6.L120.90',
  av1: 'av01.0.08M.08',
  vp9: 'vp09.00.40.08',
  vp8: 'vp8',
}
const AUDIO: Record<string, string> = {
  aac: 'mp4a.40.2',
  mp3: 'mp4a.69',
  opus: 'opus',
  vorbis: 'vorbis',
  flac: 'flac',
  ac3: 'ac-3',
  eac3: 'ec-3',
}
const CONTAINER: Record<string, string> = { mp4: 'video/mp4', mov: 'video/mp4', webm: 'video/webm' }

// Can this browser play the original file without a transcode?
export function canDirectPlay(p: Playback): boolean {
  const mime = CONTAINER[p.container]
  const v = VIDEO[p.videoCodec]
  if (!mime || !v) return false
  const a = p.audioCodec ? AUDIO[p.audioCodec] : null
  if (p.audioCodec && !a) return false
  const probe = document.createElement('video')
  return probe.canPlayType(`${mime}; codecs="${a ? `${v}, ${a}` : v}"`) !== ''
}

export interface SpriteCue {
  start: number
  end: number
  url: string
  x: number
  y: number
  w: number
  h: number
}

const vttCache = new Map<string, Promise<SpriteCue[]>>()

const toSec = (t: string) => t.split(':').reduce((acc, part) => acc * 60 + Number(part), 0)

// Stash's thumbs.vtt: one cue per sprite tile, "sprite.jpg#xywh=x,y,w,h".
export function loadSprites(vttUrl: string): Promise<SpriteCue[]> {
  let p = vttCache.get(vttUrl)
  if (!p) {
    p = fetch(vttUrl)
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => {
        const cues: SpriteCue[] = []
        const base = new URL(vttUrl, location.href)
        for (const block of text.split(/\n\s*\n/)) {
          const m = /([\d:.]+)\s+-->\s+([\d:.]+)\s*\n(.+)#xywh=(\d+),(\d+),(\d+),(\d+)/.exec(block)
          if (!m) continue
          cues.push({
            start: toSec(m[1]),
            end: toSec(m[2]),
            url: new URL(m[3].trim(), base).pathname,
            x: +m[4],
            y: +m[5],
            w: +m[6],
            h: +m[7],
          })
        }
        return cues
      })
      .catch(() => [])
    vttCache.set(vttUrl, p)
  }
  return p
}

export function cueAt(cues: SpriteCue[], t: number): SpriteCue | null {
  if (!cues.length) return null
  let lo = 0
  let hi = cues.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cues[mid].start <= t) lo = mid
    else hi = mid - 1
  }
  return cues[lo]
}
