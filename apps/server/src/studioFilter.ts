// What keeps a not-yet-downloaded scene out by its studio's name or because it is VR
// (wiki features/studio-name-filter). Like the blocklist, this applies to Discover, the
// not-downloaded shelf and the automatic Gets, never to library lists.
import { getSettings } from './settings.ts'

// A studio is filtered when its name contains one of the user's words, in any case.
export function matchesStudioFilter(studioName: string | null | undefined, words: string[]): boolean {
  if (!studioName || !words.length) return false
  const name = studioName.toLowerCase()
  return words.some((w) => w && name.includes(w.toLowerCase()))
}

// Is this StashDB scene VR? Any of: the title or a category says so ([VR], (VR), the word VR,
// Virtual Reality, 180° or 360°), or the studio's name carries VR in capitals (how VR studios
// brand themselves; capitals so a name merely containing the letters does not match) or starts
// with "Virtual". Left out when Settings hideVr is on. A VR studio whose name says neither is
// what the studio name filter is for.
const VR_TEXT = /\bVR\b|virtual[\s-]*reality|\b(180|360)\s*(°|degrees?\b|vr\b)/i
const VR_STUDIO = /VR/ // case-sensitive on purpose
const VIRTUAL_STUDIO = /^virtual/i
export function isVrScene(r: { title?: string | null; studioName?: string | null; tags: unknown }): boolean {
  return (
    VR_TEXT.test(r.title ?? '') ||
    (r.tags as { name: string }[]).some((t) => VR_TEXT.test(t.name)) ||
    (!!r.studioName && (VR_STUDIO.test(r.studioName) || VIRTUAL_STUDIO.test(r.studioName)))
  )
}

export interface NameFilters {
  studioWords: string[]
  hideVr: boolean
}
export async function nameFilters(): Promise<NameFilters> {
  const s = await getSettings()
  return { studioWords: s.studioFilters ?? [], hideVr: s.hideVr }
}
// Whether the filters keep this scene out (what the automatic Gets and the shelf ask).
export const filteredOut = (r: { title?: string | null; studioName?: string | null; tags: unknown }, f: NameFilters): boolean =>
  matchesStudioFilter(r.studioName, f.studioWords) || (f.hideVr && isVrScene(r))
