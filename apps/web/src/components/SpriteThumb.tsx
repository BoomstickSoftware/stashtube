import type { CSSProperties } from 'react'
import { cueAt, type SpriteCue } from '../lib/media'

// One frame of a scene's sprite sheet (Stash's scrubber thumbnails) at time `t`, `width` px
// wide: the seek bar's hover thumbnail and a card's hover scrub.
export function SpriteThumb({ cues, t, width, className, style }: { cues: SpriteCue[]; t: number; width: number; className?: string; style?: CSSProperties }) {
  const cue = cueAt(cues, t)
  if (!cue) return null
  const scale = width / cue.w
  return (
    <div
      className={className}
      style={{
        width,
        height: cue.h * scale,
        backgroundImage: `url(${cue.url})`,
        backgroundPosition: `-${cue.x * scale}px -${cue.y * scale}px`,
        // tiles are scaled from cue.w to width; the sheet scales with them
        ...sheetSize(cues, scale),
        ...style,
      }}
    />
  )
}

// Sprite sheets are a grid of equal tiles; infer the sheet size from the cues.
function sheetSize(cues: SpriteCue[], scale: number) {
  let w = 0
  let h = 0
  for (const c of cues) {
    w = Math.max(w, c.x + c.w)
    h = Math.max(h, c.y + c.h)
  }
  return { backgroundSize: `${w * scale}px ${h * scale}px` }
}
