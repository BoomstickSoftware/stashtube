// How a reel is rendered to one file (wiki features/reel-builds): the pure parts, shared by
// the server (which snapshots the plan) and the builder on the NAS (which runs ffmpeg).
// Every clip becomes its own intermediate with identical stream parameters, so the reel is
// those files joined by copy, a finished clip is never rendered twice, and an edit re-renders
// only what changed.
import { FADE_SEC } from './reels.ts'

export const OUT_W = 1920
export const OUT_H = 1080
export const RENDER_QP = 18 // Quick Sync constant quality, chosen by the user 2026-11-11
export const VAAPI_DEVICE = '/dev/dri/renderD128'
// Codecs the NAS's Quick Sync decodes (N5105); anything else is decoded in software.
const HW_DECODE = new Set(['h264', 'hevc'])
// A clip may come out above its source's bitrate at constant quality (seen on a 4K source):
// more than this much above, and it is rendered again at the source's rate.
export const OVER_SOURCE = 1.1

export interface RenderClip {
  path: string // as the builder sees it (Stash's path)
  start: number
  end: number
  width: number
  height: number
  videoCodec: string
  hasAudio: boolean
  bitrate: number // of the source file, bits per second; 0 when unknown
  fadeIn: boolean // entered through a fade
  fadeOut: boolean // left through a fade
}

export interface RenderSettings {
  fps: number
  qp: number
}

// The picture scaled to fit 1920x1080 without stretching, and where it sits: bars fill the
// rest. Sizes and offsets are even, as the encoder needs.
export function fitBox(width: number, height: number, W = OUT_W, H = OUT_H): { w: number; h: number; x: number; y: number } {
  if (!(width > 0 && height > 0)) return { w: W, h: H, x: 0, y: 0 }
  const scale = Math.min(W / width, H / height)
  const even = (n: number, max: number) => Math.min(max, Math.max(2, Math.round(n / 2) * 2))
  const w = even(width * scale, W)
  const h = even(height * scale, H)
  const off = (n: number) => Math.floor(n / 4) * 2
  return { w, h, x: off(W - w), y: off(H - h) }
}

// The reel's frame rate: the one most of its running time was shot at, as a whole number the
// encoder is given (23.976 → 24, 29.97 → 30, 59.94 → 60). 30 when nothing is known.
export function dominantFps(clips: { fps: number; length: number }[]): number {
  const by = new Map<number, number>()
  for (const c of clips) {
    const f = Math.round(c.fps)
    if (f >= 10 && f <= 120) by.set(f, (by.get(f) ?? 0) + c.length)
  }
  let best = 30
  let most = 0
  for (const [f, len] of [...by].sort((a, b) => b[0] - a[0])) if (len > most) [best, most] = [f, len]
  return best
}

// What makes an intermediate the same file: the source, the range, the fades and the settings.
// The builder adds the source's size and modified time, then hashes the lot.
export const clipKey = (c: RenderClip, s: RenderSettings, maxBitrate: number | null): string =>
  JSON.stringify([c.path, c.start, c.end, c.fadeIn, c.fadeOut, s.fps, s.qp, maxBitrate, OUT_W, OUT_H, 'v1'])

// ffmpeg's arguments for one clip. `maxBitrate` (bits per second) replaces constant quality
// with a capped variable rate, for the second pass of a clip that came out above its source.
export function clipArgs(c: RenderClip, s: RenderSettings, out: string, maxBitrate: number | null = null): string[] {
  const length = Math.max(0, c.end - c.start)
  const fade = Math.min(FADE_SEC, length / 2)
  const box = fitBox(c.width, c.height)
  const bars = box.w !== OUT_W || box.h !== OUT_H
  const hw = HW_DECODE.has(c.videoCodec.toLowerCase())
  const n = (x: number) => String(Math.round(x * 1000) / 1000)

  const vFades = [c.fadeIn && `fade=t=in:st=0:d=${n(fade)}`, c.fadeOut && `fade=t=out:st=${n(length - fade)}:d=${n(fade)}`].filter(Boolean)
  const vf = hw
    ? [
        `scale_vaapi=w=${box.w}:h=${box.h}:format=nv12`,
        bars && `pad_vaapi=w=${OUT_W}:h=${OUT_H}:x=${box.x}:y=${box.y}:color=black`,
        // fades have no hardware filter: the frames come down, fade and go back up
        ...(vFades.length ? ['hwdownload', 'format=nv12', ...vFades, 'format=nv12', 'hwupload'] : []), // the fade filter leaves another pixel format, which the encoder rejects with an I/O error
      ]
    : [`scale=${box.w}:${box.h}`, bars && `pad=${OUT_W}:${OUT_H}:${box.x}:${box.y}:black`, 'setsar=1', ...vFades, 'format=nv12', 'hwupload']
  const af = [
    'loudnorm=I=-16:TP=-1.5:LRA=11',
    'aresample=48000',
    c.fadeIn && `afade=t=in:st=0:d=${n(fade)}`,
    c.fadeOut && `afade=t=out:st=${n(length - fade)}:d=${n(fade)}`,
    'apad', // sound as long as the picture, so joins do not drift
  ]

  return [
    '-hide_banner', '-nostdin', '-y',
    '-init_hw_device', `vaapi=va:${VAAPI_DEVICE}`, '-filter_hw_device', 'va',
    ...(hw ? ['-hwaccel', 'vaapi', '-hwaccel_device', 'va', '-hwaccel_output_format', 'vaapi'] : []),
    '-ss', n(c.start), '-t', n(length), '-i', c.path,
    ...(c.hasAudio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']),
    '-map', '0:v:0', '-map', c.hasAudio ? '0:a:0' : '1:a:0',
    '-vf', vf.filter(Boolean).join(','),
    '-af', (c.hasAudio ? af : ['apad']).filter(Boolean).join(','),
    '-r', String(s.fps), '-c:v', 'h264_vaapi', '-profile:v', 'high', '-g', String(s.fps * 2),
    ...(maxBitrate ? ['-rc_mode', 'VBR', '-b:v', String(Math.round(maxBitrate)), '-maxrate', String(Math.round(maxBitrate))] : ['-qp', String(s.qp)]),
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
    '-t', n(length), '-video_track_timescale', '90000', '-movflags', '+faststart',
    out,
  ]
}

// Joins the intermediates by copy. `list` is a file of `file '<path>'` lines (concatList).
export const joinArgs = (list: string, out: string): string[] => ['-hide_banner', '-nostdin', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]
export const concatList = (files: string[]): string => files.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join('\n') + '\n'

// Whether a rendered clip should be done again at the source's rate: only when the source's
// rate is known and the result is well above it.
export const overSource = (renderedBitrate: number, sourceBitrate: number): boolean => sourceBitrate > 0 && renderedBitrate > sourceBitrate * OVER_SOURCE

// What the builder is handed: a snapshot of the reel as it was queued.
export interface BuildPlan {
  reelId: number
  settings: RenderSettings
  clips: RenderClip[]
  duration: number // seconds
}

export type ReelBuildStatus = 'queued' | 'building' | 'done' | 'failed'

// A reel's latest build, as the app shows it.
export interface ReelBuild {
  id: number
  status: ReelBuildStatus
  now: boolean // queued with "Build now"
  progress: number // 0 to 1
  message: string | null
  error: string | null
  url: string | null // the built file, once done
  durationSec: number | null
  sizeBytes: number | null
  queuedAt: string
  finishedAt: string | null
  stale: boolean | null // the reel changed since this build was queued; null where that is not known (the list)
}

