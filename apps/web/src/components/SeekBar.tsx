import type { Marker } from '@flix/shared'
import clsx from 'clsx'
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { duration as fmt } from '../lib/format'
import { loadSprites, type SpriteCue } from '../lib/media'
import { groupMarkers, tickLabel, type Tick } from '../lib/playback'
import { SpriteThumb } from './SpriteThumb'

type Pos = { t: number }

export interface SeekPoint {
  t: number
  scrubbing: boolean // dragging (false: a mouse hovering)
}

// Lets a swipe elsewhere (the picture) drive the bar exactly as a drag on the bar would.
export interface SeekBarHandle {
  grab: () => void // start scrubbing from where playback is
  drag: (dx: number) => void // px the finger has moved since it went down
  drop: () => void // seek to where the drag ended
  cancel: () => void
}

const DRAG_SLOP = 8 // px a touch moves before it is a drag rather than a tap

// The video seek bar, shared by the player and stations: buffered and played spans, markers,
// and a sprite thumbnail with the time being pointed at. Mouse: the playhead goes where the
// pointer is and seeks as it moves. Touch: the hit area reaches well above the thin track; a
// tap jumps to where it landed (or to the marker whose tick it hit), a drag moves the playhead
// by as far as the finger moves, 1:1 with the bar's width, from wherever it was, previewing as
// it goes and seeking once, on release, so a finger's jitter does not throw the video around.
// `spans` shades parts of the bar (a station's moments).
export function SeekBar({
  ref,
  dur,
  time,
  buffered,
  markers,
  vtt,
  spans,
  onSeek,
  onPoint,
}: {
  ref?: Ref<SeekBarHandle>
  dur: number
  time: number
  buffered: number
  markers: Marker[]
  vtt: string | null
  spans?: { start: number; end: number }[]
  onSeek: (t: number) => void
  onPoint?: (p: SeekPoint | null) => void // what the bar is pointing at, for the time readout and keeping controls up
}) {
  const bar = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState<{ vtt: string; cues: SpriteCue[] } | null>(null)
  const sprites = loaded && loaded.vtt === vtt ? loaded.cues : []
  const [hover, setHover] = useState<Pos | null>(null) // mouse over the bar
  const [scrub, setScrub] = useState<Pos | null>(null) // dragging the bar

  useEffect(() => {
    if (vtt) loadSprites(vtt).then((cues) => setLoaded({ vtt, cues }))
  }, [vtt])

  const point = scrub ?? hover
  const show = (h: Pos | null, s: Pos | null) => {
    setHover(h)
    setScrub(s)
    const p = s ?? h
    onPoint?.(p ? { t: p.t, scrubbing: !!s } : null)
  }

  const ticks = useMemo(() => groupMarkers(markers, dur), [markers, dur])
  const clamp = (t: number) => Math.max(0, Math.min(dur || 0, t))

  const timeAt = (clientX: number): Pos => {
    const r = bar.current!.getBoundingClientRect()
    return { t: clamp(((clientX - r.left) / r.width) * (dur || 0)) }
  }
  // The pointer position, snapped to the tick whose pad it is over.
  const pointAt = (e: React.PointerEvent): Pos & { tick: Tick | null } => {
    const pad = (e.target as HTMLElement).closest?.('[data-tick]') as HTMLElement | null
    const tick = pad ? (ticks[Number(pad.dataset.tick)] ?? null) : null
    return tick ? { t: tick.t, tick } : { ...timeAt(e.clientX), tick: null }
  }

  // A touch drag in progress: where the finger went down, the time the playhead had then,
  // where it is now, and what a tap would seek to. `moved` stays false until the finger has
  // gone DRAG_SLOP (until then it is a tap); after that every px the finger moved counts.
  const drag = useRef<{ from: number; moved: boolean; t0: number; t: number; tap: number | null } | null>(null)
  const begin = (tap: number | null, from = 0) => {
    drag.current = { from, moved: false, t0: time, t: time, tap }
  }
  const move = (dx: number) => {
    const d = drag.current
    if (!d || (!d.moved && Math.abs(dx) < DRAG_SLOP)) return
    d.moved = true
    const w = bar.current?.getBoundingClientRect().width || 1
    d.t = clamp(d.t0 + (dx / w) * (dur || 0))
    show(null, { t: d.t })
  }
  const end = () => {
    const d = drag.current
    drag.current = null
    if (d?.moved) onSeek(d.t)
    else if (d && d.tap !== null) onSeek(d.tap)
    show(null, null)
  }
  const abort = () => {
    drag.current = null
    show(null, null)
  }
  useImperativeHandle(ref, () => ({ grab: () => begin(null), drag: move, drop: end, cancel: abort }))

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = pointAt(e)
    if (e.pointerType !== 'mouse') return begin(p.t, e.clientX)
    show(null, p)
    onSeek(p.t)
  }
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') {
      if (drag.current) move(e.clientX - drag.current.from)
    } else if (scrub) {
      const p = timeAt(e.clientX)
      show(null, p)
      onSeek(p.t)
    } else {
      show(pointAt(e), null)
    }
  }
  const onUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') end()
    else show(null, null)
  }

  const shown = scrub ? scrub.t : time
  const pct = (t: number) => `${(t / (dur || 1)) * 100}%`
  const thumbW = 192

  return (
    <div
      ref={bar}
      className="group/bar relative flex h-5 cursor-pointer touch-none items-center touch:h-9"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={abort}
      onPointerLeave={(e) => e.pointerType === 'mouse' && !scrub && show(null, null)}
    >
      {/* on touch the bar takes a finger anywhere up to 28 px above the track, which stays thin */}
      <div className="absolute inset-x-0 -top-7 bottom-0 hidden touch:block" />
      <div
        className={clsx(
          'relative h-1 w-full rounded-full bg-white/25 transition-[height] group-hover/bar:h-1.5 touch:h-1.5',
          scrub && 'h-1.5 touch:h-2',
        )}
      >
        {spans?.map((s, i) => (
          <div key={i} className="absolute inset-y-0 rounded-full bg-white/25" style={{ left: pct(s.start), width: pct(s.end - s.start) }} />
        ))}
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: pct(buffered) }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: pct(shown) }} />
        {ticks.map((k, i) => (
          <div key={k.markers[0].id} className="absolute inset-y-0 -translate-x-1/2" style={{ left: pct(k.t) }}>
            <div className={clsx('absolute -inset-y-0.5 left-1/2 -translate-x-1/2 rounded-full', k.o ? 'w-0.5 bg-white/80' : 'w-1 bg-star')} />
            {k.markers.length > 1 && (
              <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-[9px] leading-none font-semibold text-star tabular-nums">{k.markers.length}</span>
            )}
            {/* the tap target: a tap here seeks to the marker, not to where the finger landed */}
            <div data-tick={i} className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2" />
          </div>
        ))}
        {hover && !scrub && <div className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: pct(hover.t) }} />}
        <div
          className={clsx(
            'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-accent transition-transform group-hover/bar:scale-100 touch:scale-100',
            scrub && 'scale-125 touch:scale-125',
          )}
          style={{ left: pct(shown) }}
        />
      </div>
      {point && (
        <div
          // above the playhead, clear of the finger and of the bar's raised hit area, kept on the bar
          className="pointer-events-none absolute bottom-7 flex flex-col items-center touch:bottom-[4.5rem]"
          style={{ left: `clamp(${thumbW / 2}px, ${pct(point.t)}, calc(100% - ${thumbW / 2}px))`, transform: 'translateX(-50%)' }}
        >
          {sprites.length > 0 && <SpriteThumb cues={sprites} t={point.t} width={thumbW} className="overflow-hidden rounded-lg ring-2 ring-white/90" />}
          {(() => {
            const near = ticks.find((k) => Math.abs(k.t - point.t) < (dur || 1) * 0.01)
            return near ? (
              <span className={clsx('mt-1 max-w-48 truncate rounded px-1.5 py-0.5 text-xs font-semibold', near.o ? 'bg-white/90 text-black' : 'bg-star text-black')}>
                {tickLabel(near)}
              </span>
            ) : null
          })()}
          <span className="mt-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium tabular-nums">{fmt(point.t)}</span>
        </div>
      )}
    </div>
  )
}
