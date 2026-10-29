import type { Marker } from '@flix/shared'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { duration as fmt } from '../lib/format'
import { loadSprites, type SpriteCue } from '../lib/media'
import { SpriteThumb } from './SpriteThumb'

type Pos = { x: number; t: number; w: number }

export interface SeekPoint {
  t: number
  scrubbing: boolean // dragging (false: a mouse hovering)
}

// The video seek bar, shared by the player and stations: buffered and played spans, markers,
// and a sprite thumbnail with the time under the pointer. Mouse: seeks as it moves. Touch: the
// drag previews (thumbnail and time) and seeks once, on release, so a finger's jitter does not
// throw the video around. `spans` shades parts of the bar (a station's moments).
export function SeekBar({
  dur,
  time,
  buffered,
  markers,
  vtt,
  spans,
  onSeek,
  onPoint,
}: {
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

  const timeAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect()
    const x = Math.max(0, Math.min(r.width, clientX - r.left))
    return { x, t: (x / r.width) * (dur || 0), w: r.width }
  }
  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = timeAt(e.clientX)
    show(null, p)
    if (e.pointerType === 'mouse') onSeek(p.t)
  }
  const onMove = (e: React.PointerEvent) => {
    const p = timeAt(e.clientX)
    if (scrub) {
      show(null, p)
      if (e.pointerType === 'mouse') onSeek(p.t)
    } else if (e.pointerType === 'mouse') {
      show(p, null)
    }
  }
  const onUp = (e: React.PointerEvent) => {
    if (scrub && e.pointerType !== 'mouse') onSeek(timeAt(e.clientX).t)
    show(null, null)
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
      onPointerCancel={() => show(null, null)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && !scrub && show(null, null)}
    >
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
        {markers.map((m) => (
          <div key={m.id} className="absolute -inset-y-0.5 w-1 -translate-x-1/2 rounded-full bg-star" style={{ left: pct(m.seconds) }} />
        ))}
        {hover && !scrub && <div className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: hover.x }} />}
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
          className="pointer-events-none absolute bottom-7 flex flex-col items-center touch:bottom-10"
          style={{ left: Math.max(thumbW / 2, Math.min(point.w - thumbW / 2, point.x)), transform: 'translateX(-50%)' }}
        >
          {sprites.length > 0 && <SpriteThumb cues={sprites} t={point.t} width={thumbW} className="overflow-hidden rounded-lg ring-2 ring-white/90" />}
          {(() => {
            const near = markers.find((m) => Math.abs(m.seconds - point.t) < (dur || 1) * 0.01)
            return near ? <span className="mt-1 max-w-48 truncate rounded bg-star px-1.5 py-0.5 text-xs font-semibold text-black">{near.title || 'Marker'}</span> : null
          })()}
          <span className="mt-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium tabular-nums">{fmt(point.t)}</span>
        </div>
      )}
    </div>
  )
}
