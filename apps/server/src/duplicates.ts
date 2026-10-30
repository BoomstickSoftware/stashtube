import type { DuplicateGroup, DuplicateScene } from '@flix/shared'

// Which copy of a duplicated video to keep. Better picture first (more pixels), then the
// higher bit rate, then the bigger file; if the files are a wash, keep the one the user has
// already watched or rated, so their history stays attached to a scene that still exists.
// The id breaks any remaining tie so the answer is stable between requests.
export function pickKeep(scenes: readonly DuplicateScene[]): string {
  if (!scenes.length) throw new Error('empty duplicate group')
  return [...scenes].sort(byQuality)[0].id
}

const byQuality = (a: DuplicateScene, b: DuplicateScene) =>
  b.width * b.height - a.width * a.height ||
  b.file.bitrate - a.file.bitrate ||
  b.size - a.size ||
  Number(touched(b)) - Number(touched(a)) ||
  a.id.localeCompare(b.id, undefined, { numeric: true })

const touched = (s: DuplicateScene) => s.playCount > 0 || (s.rating ?? 0) > 0 || s.oCount > 0

export function toGroup(scenes: DuplicateScene[]): DuplicateGroup {
  const keep = pickKeep(scenes)
  return { scenes: [...scenes].sort(byQuality), keep, suggested: scenes.filter((s) => s.id !== keep).map((s) => s.id) }
}
