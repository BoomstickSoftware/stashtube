// Plays a reel from the original files (wiki features/reels): two video elements, the one
// showing the current clip and the other holding the next clip ready at its start, so a join is
// a swap and not a load. The timeline is the shared `planReel`; the build follows the same one.
//
// From the iPhone spike (2026-11-10): the second element must be started inside the first tap
// or it may never start on its own, and it must be started MUTED, or iOS pauses the first
// video when the second one begins with sound.
import { fadeLevel, locate, planReel, type ReelDetail, reelTime } from '@flix/shared'
import clsx from 'clsx'
import { SkipBack, SkipForward } from 'lucide-react'
import { type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { attachSource, createClock } from '../lib/playback'
import { nowPlaying } from '../lib/nowPlaying'
import { clipSrc } from '../lib/reels'
import { PlayPause, TimeReadout } from './PlayerParts'
import { SeekBar, type SeekPoint } from './SeekBar'
import { Spinner } from './ui'

export interface ReelPlayerHandle {
  seek: (t: number) => void // on the reel's clock
  play: () => void
}

interface Slot {
  key: string | null // the source attached
  detach: (() => void) | null
  unlocked: boolean
}

const NEAR_END = 0.04 // seconds before a clip's end at which the next one is started

export function ReelPlayer({ reel, ref, onSegment }: { reel: ReelDetail; ref?: Ref<ReelPlayerHandle>; onSegment?: (clipId: number | null) => void }) {
  // The reel object is new on every render of the page; what matters is whether its timeline
  // or a source changed, so both are remembered by content.
  const shape = JSON.stringify([reel.transition, reel.clips.map((c) => [c.id, c.sceneId, c.start, c.end, c.transition, c.status, c.source && clipSrc(c.source)])])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planReel(reel), [shape])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sources = useMemo(() => new Map(reel.clips.filter((c) => c.source).map((c) => [c.id, clipSrc(c.source!)])), [shape])
  const els = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)]
  const slots = useRef<Slot[]>([
    { key: null, detach: null, unlocked: false },
    { key: null, detach: null, unlocked: false },
  ])
  const cur = useRef(0) // which element shows the current clip
  const seg = useRef(0) // index of the current segment
  const swapping = useRef(false)
  const wantPlay = useRef(false)
  const [clock] = useState(createClock)
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [point, setPoint] = useState<SeekPoint | null>(null)
  const planRef = useRef(plan)
  planRef.current = plan

  // Put a segment into an element, parked at `time` (its start unless seeking).
  const load = useCallback(
    (el: number, index: number, time?: number) => {
      const v = els[el].current
      const s = planRef.current.segments[index]
      const slot = slots.current[el]
      if (!v || !s) return
      const src = sources.get(s.clipId)
      if (!src) return
      const at = time ?? s.start
      if (slot.key !== src) {
        slot.detach?.()
        slot.key = src
        slot.detach = attachSource(v, src, at)
        const park = () => {
          v.currentTime = at
        }
        if (v.readyState >= 1) park()
        else v.addEventListener('loadedmetadata', park, { once: true })
      } else if (Math.abs(v.currentTime - at) > 0.05) {
        v.currentTime = at
      }
    },
    // the element refs are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources],
  )

  const show = (el: number, level: number) => {
    const v = els[el].current
    if (!v) return
    v.style.opacity = String(level)
    v.volume = level // ignored on an iPhone, where only the picture fades
  }

  // Go to a moment of the reel: the clip it falls in goes into the current element, the clip
  // after it into the other.
  const seek = useCallback(
    (t: number) => {
      const at = locate(planRef.current, t)
      if (!at) return
      seg.current = at.segment.index
      load(cur.current, at.segment.index, at.time)
      load(1 - cur.current, at.segment.index + 1)
      els[1 - cur.current].current?.pause()
      show(cur.current, fadeLevel(planRef.current, t))
      show(1 - cur.current, 0)
      clock.set(reelTime(at.segment, at.time))
      onSegment?.(at.segment.clipId)
      if (wantPlay.current) els[cur.current].current?.play().catch(() => {})
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load, clock, onSegment],
  )

  // The plan changed (a trim, a reorder, a new clip): start over from where the reel's clock
  // is, with fresh sources.
  useEffect(() => {
    seek(Math.min(clock.get().time, plan.duration))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  useEffect(
    () => () => {
      for (const [i, slot] of slots.current.entries()) {
        slot.detach?.()
        const v = els[i].current
        if (v) {
          v.removeAttribute('src')
          v.load()
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const stop = () => {
    wantPlay.current = false
    setPlaying(false)
    els.forEach((e) => e.current?.pause())
  }

  // The current clip reached its end: start the next element and swap once it runs.
  const advance = useCallback(async () => {
    if (swapping.current) return
    const p = planRef.current
    const next = p.segments[seg.current + 1]
    if (!next) {
      stop()
      clock.set(p.duration)
      return
    }
    swapping.current = true
    const from = cur.current
    const to = 1 - from
    const b = els[to].current
    try {
      if (b) {
        b.muted = false
        await b.play().catch(async () => {
          // refused with sound: better a silent clip than a stuck reel
          b.muted = true
          await b.play().catch(() => {})
        })
      }
      els[from].current?.pause()
      cur.current = to
      seg.current = next.index
      clock.set(next.at)
      show(to, fadeLevel(p, next.at))
      show(from, 0)
      onSegment?.(next.clipId)
      load(from, next.index + 1)
    } finally {
      swapping.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, load, onSegment])

  // While playing: the reel's clock, the fade level, and the hand-over near a clip's end.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const v = els[cur.current].current
      const s = planRef.current.segments[seg.current]
      if (v && s && !swapping.current) {
        const t = reelTime(s, v.currentTime)
        clock.set(t)
        show(cur.current, fadeLevel(planRef.current, t))
        if (v.currentTime >= s.end - NEAR_END || v.ended) void advance()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, advance, clock])

  const play = useCallback(() => {
    const p = planRef.current
    if (!p.segments.length) return
    nowPlaying.close() // one thing plays at a time
    if (clock.get().time >= p.duration - 0.05) seek(0)
    wantPlay.current = true
    setPlaying(true)
    const a = els[cur.current].current
    const b = els[1 - cur.current].current
    const other = slots.current[1 - cur.current]
    // inside the tap: the waiting element is started muted and paused again, so it may start
    // by itself at the join
    if (b && other.key && !other.unlocked) {
      other.unlocked = true
      b.muted = true
      b.play().then(
        () => {
          if (els[cur.current].current !== b) b.pause()
        },
        () => {},
      )
    }
    slots.current[cur.current].unlocked = true
    if (a) {
      a.muted = false
      a.play().catch(() => stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, seek])

  const toggle = () => (playing ? stop() : play())
  useImperativeHandle(ref, () => ({ seek, play }), [seek, play])

  const step = (dir: 1 | -1) => {
    const p = planRef.current
    const s = p.segments[seg.current]
    if (!s) return
    // back: to this clip's start, or the one before when already near it
    const target = dir === 1 ? p.segments[seg.current + 1] : clock.get().time - s.at > 2 ? s : (p.segments[seg.current - 1] ?? s)
    if (target) seek(target.at)
  }

  const ticks = useMemo(
    () => plan.segments.slice(1).map((s) => ({ id: `clip-${s.clipId}`, seconds: s.at, endSeconds: null, title: `Clip ${s.index + 1}`, tag: `Clip ${s.index + 1}`, tagId: '' })),
    [plan],
  )

  const video = (i: number) => (
    <video
      ref={els[i]}
      playsInline
      preload="auto"
      className="absolute inset-0 h-full w-full bg-black object-contain"
      style={{ opacity: i === 0 ? 1 : 0 }}
      onWaiting={() => i === cur.current && setWaiting(true)}
      onPlaying={() => i === cur.current && setWaiting(false)}
      onCanPlay={() => i === cur.current && setWaiting(false)}
      onError={() => i === cur.current && wantPlay.current && void advance()}
    />
  )

  if (!plan.segments.length) return <div className="flex aspect-video items-center justify-center rounded-xl bg-black text-sm text-muted">Add a clip to see the reel here.</div>

  return (
    <div className="overflow-hidden rounded-xl bg-black">
      <div className="relative aspect-video" onClick={toggle}>
        {video(0)}
        {video(1)}
        {waiting && playing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        )}
        {!playing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-black/60">
              <PlayPause playing={false} size={30} />
            </span>
          </div>
        )}
      </div>
      <div className="px-3 pt-1 pb-2">
        <SeekBar dur={plan.duration} clock={clock} markers={ticks} vtt={null} onSeek={seek} onPoint={setPoint} />
        <div className="flex items-center gap-1 text-sm">
          <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle} className="flex size-11 items-center justify-center rounded-full hover:bg-white/10">
            <PlayPause playing={playing} size={20} />
          </button>
          <button type="button" aria-label="Previous clip" onClick={() => step(-1)} className="flex size-11 items-center justify-center rounded-full text-white hover:bg-white/10">
            <SkipBack size={18} />
          </button>
          <button
            type="button"
            aria-label="Next clip"
            onClick={() => step(1)}
            className={clsx('flex size-11 items-center justify-center rounded-full text-white hover:bg-white/10')}
          >
            <SkipForward size={18} />
          </button>
          <TimeReadout clock={clock} dur={plan.duration} point={point} className="ml-2 text-white" />
        </div>
      </div>
    </div>
  )
}
