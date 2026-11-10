// The pieces the video page's Player and the station player draw the same way.
import clsx from 'clsx'
import { Pause, Play } from 'lucide-react'
import { duration as fmt } from '../lib/format'
import { type Clock, useClock } from '../lib/playback'
import type { SeekPoint } from './SeekBar'

// "1:23 / 45:00", following the scrub point while the bar is dragged. Its own component so the
// clock's ticks re-render only this span.
export function TimeReadout({ clock, dur, point, className }: { clock: Clock; dur: number; point: SeekPoint | null; className?: string }) {
  const { time } = useClock(clock)
  return (
    <span className={clsx('whitespace-nowrap tabular-nums', className)}>
      {fmt(point?.scrubbing ? point.t : time)} <span className="text-white/50">/ {fmt(dur)}</span>
    </span>
  )
}

// The short label in the middle of the picture ("+10s", "Marked"); a pill, so a longer one
// ("Switched to 720p") fits.
export function Flash({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div className="pointer-events-none absolute inset-0 m-auto flex h-12 w-fit min-w-20 items-center justify-center rounded-full bg-black/60 px-5 text-lg font-semibold whitespace-nowrap">
      {text}
    </div>
  )
}

export function PlayPause({ playing, size, className = 'fill-white' }: { playing: boolean; size: number; className?: string }) {
  return playing ? <Pause size={size} className={className} /> : <Play size={size} className={className} />
}
