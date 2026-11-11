// Small things the reel screens share.
import type { ReelClip } from '@flix/shared'
import { canDirectPlay } from './media'
import { pickSource } from './playback'

// "1:23.4": a clip's edges are set to a tenth of a second.
export function tenths(sec: number): string {
  const t = Math.max(0, Math.round(sec * 10))
  const s = Math.floor(t / 10)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const mm = h ? String(m % 60).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}.${t % 10}`
}

// What a preview element plays for a clip: the original file when this browser can, else
// Stash's transcode.
export const clipSrc = (source: NonNullable<ReelClip['source']>): string => pickSource(source, { canDirect: canDirectPlay(source) }).src

// The reel last added to, offered first the next time.
export const LAST_REEL_KEY = 'flix.reels.last'
