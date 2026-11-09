import type { CSSProperties } from 'react'

// One colour per category, the same everywhere and on every device: a hue from the name's hash
// (FNV-1a), at a lightness that reads on the dark surface. Names only, so StashDB's and the
// library's spelling of a category get the same colour.
export function categoryHue(name: string): number {
  let h = 0x811c9dc5
  for (const ch of name.trim().toLowerCase()) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) % 360
}

// `bg`: the background's alpha; stronger over a picture (Discover's hover overlay).
export function categoryStyle(name: string, bg = 0.16): CSSProperties {
  const hue = categoryHue(name)
  return {
    color: `hsl(${hue} 75% 72%)`,
    backgroundColor: `hsl(${hue} 70% 45% / ${bg})`,
    boxShadow: `inset 0 0 0 1px hsl(${hue} 70% 60% / 0.35)`,
  }
}
