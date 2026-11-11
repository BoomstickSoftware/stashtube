// Reels (wiki decisions/reels-edit-by-reference): a reel is a list of clips, each a range of a
// library video, with a transition into the next. This file is the contract and the one pure
// timeline function that the preview player and the build both follow.
import type { ReelBuild } from './render.ts'

// How one clip gives way to the next. Dissolve comes later (it overlaps two clips).
export const reelTransitions = ['cut', 'fade'] as const
export type ReelTransition = (typeof reelTransitions)[number]

// A fade goes through black: the outgoing clip's last FADE_SEC fade out, the incoming clip's
// first FADE_SEC fade in. Nothing overlaps, so a reel is as long as its clips.
export const FADE_SEC = 0.3
// The shortest clip the editor allows (a fade needs room on both ends).
export const MIN_CLIP_SEC = 1

// ok: the video is as it was when the clip was marked. shifted: its file changed (another
// length or fingerprint), so the range may show something else. missing: no longer in the library.
export type ReelClipStatus = 'ok' | 'shifted' | 'missing'

export interface ReelClipInput {
  sceneId: string
  start: number // seconds into the video
  end: number
}

export interface ReelClip extends ReelClipInput {
  id: number
  transition: ReelTransition | null // into the next clip; null follows the reel's default
  status: ReelClipStatus
  // what the editor and the preview need of the video; null when it is missing
  source: {
    title: string
    durationSec: number
    height: number
    screenshot: string
    vtt: string | null // sprite sheet index, for the trimmer's filmstrip
    direct: string
    hls: string
    container: string
    videoCodec: string
    audioCodec: string
  } | null
}

export interface Reel {
  id: number
  name: string
  transition: ReelTransition // the default between clips
  clipCount: number
  durationSec: number
  cover: string | null // the first clip's video still
  updatedAt: string
  build: ReelBuild | null // its latest build, if one was ever queued
  state: ReelState
  published: ReelFile | null // the approved file, listed and played like a video
  rating: number | null // 0-5 stars, half steps
  resumeSec: number
  playCount: number
  performers: ReelRef[]
  tags: ReelRef[]
  studios: ReelRef[]
}

// draft: no build. queued, building, failed: its latest build. review: a finished build the
// user has not approved yet. published: the approved file is the latest.
export type ReelState = 'draft' | 'queued' | 'building' | 'failed' | 'review' | 'published'

export interface ReelFile {
  buildId: number
  url: string
  durationSec: number
  sizeBytes: number
}

export interface ReelRef {
  id: string // Stash id
  name: string
}

// What the review page offers for a reel, from the videos its clips come from. `share` is the
// part of the reel's running time the entry appears in; `suggested` is ticked to begin with.
export interface ReelProposed extends ReelRef {
  share: number
  suggested: boolean
}
export interface ReelProposal {
  performers: ReelProposed[]
  tags: ReelProposed[]
  studios: ReelProposed[]
}

// A category is suggested when it covers at least this share of the reel; performers and
// studios always are (a reel is about who is in it).
export const TAG_SHARE = 0.5

export function proposeDetails(clips: { length: number; performers: ReelRef[]; tags: ReelRef[]; studio: ReelRef | null }[]): ReelProposal {
  const total = clips.reduce((n, c) => n + Math.max(0, c.length), 0)
  const rank = (pick: (c: (typeof clips)[number]) => ReelRef[], suggest: (share: number) => boolean): ReelProposed[] => {
    const by = new Map<string, { name: string; length: number }>()
    for (const c of clips) {
      for (const r of new Map(pick(c).map((x) => [x.id, x])).values()) {
        const e = by.get(r.id) ?? { name: r.name, length: 0 }
        e.length += Math.max(0, c.length)
        by.set(r.id, e)
      }
    }
    return [...by]
      .map(([id, e]) => ({ id, name: e.name, share: total > 0 ? e.length / total : 0 }))
      .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name))
      .map((p) => ({ ...p, suggested: suggest(p.share) }))
  }
  return {
    performers: rank((c) => c.performers, () => true),
    tags: rank((c) => c.tags, (share) => share >= TAG_SHARE),
    studios: rank((c) => (c.studio ? [c.studio] : []), () => true),
  }
}

// Where a reel stands, from its latest build and the build that was approved.
export function reelState(latest: { id: number; status: ReelBuild['status'] } | null, publishedBuildId: number | null): ReelState {
  if (!latest) return 'draft'
  if (latest.status === 'done') return latest.id === publishedBuildId ? 'published' : 'review'
  return latest.status
}

export interface ReelDetail extends Reel {
  clips: ReelClip[]
}

// One clip on the reel's own clock.
export interface ReelSegment {
  index: number
  clipId: number
  sceneId: string
  start: number // in the video
  end: number
  at: number // where it begins on the reel
  length: number
  into: ReelTransition | null // how it gives way to the next; null for the last
  from: ReelTransition | null // how it was entered; null for the first
}

export interface ReelPlan {
  segments: ReelSegment[]
  duration: number
}

type Plannable = Pick<ReelClip, 'id' | 'sceneId' | 'start' | 'end' | 'transition'> & { status?: ReelClipStatus }

// The reel as a timeline. Missing clips and empty ranges are left out, so what is planned is
// what plays.
export function planReel(reel: { transition: ReelTransition; clips: Plannable[] }): ReelPlan {
  const clips = reel.clips.filter((c) => c.status !== 'missing' && c.end - c.start > 0)
  const segments: ReelSegment[] = []
  let at = 0
  clips.forEach((c, i) => {
    const length = c.end - c.start
    const into = i < clips.length - 1 ? (c.transition ?? reel.transition) : null
    segments.push({ index: i, clipId: c.id, sceneId: c.sceneId, start: c.start, end: c.end, at, length, into, from: i > 0 ? segments[i - 1].into : null })
    at += length
  })
  return { segments, duration: at }
}

// Where a moment of the reel falls: which segment, and the time in that clip's video. Past
// the end it is the last frame of the last clip; null only for an empty reel.
export function locate(plan: ReelPlan, t: number): { segment: ReelSegment; time: number } | null {
  const last = plan.segments.at(-1)
  if (!last) return null
  const clamped = Math.min(Math.max(t, 0), plan.duration)
  const segment = plan.segments.find((s) => clamped < s.at + s.length) ?? last
  return { segment, time: Math.min(segment.start + (clamped - segment.at), segment.end) }
}

// The reverse: a time in a segment's video, on the reel's clock.
export const reelTime = (segment: ReelSegment, videoTime: number): number =>
  segment.at + Math.min(Math.max(videoTime - segment.start, 0), segment.length)

// How much of the picture and sound shows at a moment of the reel: 1, except inside a fade,
// where it falls to 0 at the join and rises again. A clip shorter than two fades splits its
// length between them.
export function fadeLevel(plan: ReelPlan, t: number): number {
  const at = locate(plan, t)
  if (!at) return 1
  const s = at.segment
  const span = Math.min(FADE_SEC, s.length / 2)
  const sinceStart = at.time - s.start
  const untilEnd = s.end - at.time
  let level = 1
  if (s.from === 'fade' && sinceStart < span) level = Math.min(level, sinceStart / span)
  if (s.into === 'fade' && untilEnd < span) level = Math.min(level, untilEnd / span)
  return Math.max(0, Math.min(1, level))
}

// A range the editor may save for a video of `durationSec`: inside the video, start before
// end, at least MIN_CLIP_SEC long. Null when the video is too short to hold one.
export function clampClip(start: number, end: number, durationSec: number): { start: number; end: number } | null {
  if (!(durationSec >= MIN_CLIP_SEC)) return null
  const s = Math.min(Math.max(0, Number.isFinite(start) ? start : 0), durationSec - MIN_CLIP_SEC)
  const e = Math.min(durationSec, Math.max(Number.isFinite(end) ? end : durationSec, s + MIN_CLIP_SEC))
  const r = (n: number) => Math.round(n * 1000) / 1000
  return { start: r(s), end: r(e) }
}
