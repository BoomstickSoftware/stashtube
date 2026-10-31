// Rows that point at scenes Stash no longer has. A delete from flix already cleans up after
// itself (playlists.forgetScene); a scene deleted in Stash's own UI, by Whisparr or by a move
// on the NAS left ghost playlist items (counted, shown as a broken cover) and dead station
// resume points (taking up the 50 slots). Swept a little after startup and after every change
// Stash reports.
import { inArray } from 'drizzle-orm'
import { db } from './db/index.ts'
import { playlistItems, stationResume } from './db/schema.ts'
import { existingSceneIds } from './stash.ts'

// A Stash in a bad state (a half-restored database, the wrong library) could answer that most
// scenes are gone; then nothing is removed and it is only logged.
const MAX_SHARE = 0.5

export async function sweepGhosts(): Promise<{ checked: number; removed: string[] }> {
  const [items, resumes] = await Promise.all([
    db.selectDistinct({ id: playlistItems.sceneId }).from(playlistItems),
    db.selectDistinct({ id: stationResume.sceneId }).from(stationResume),
  ])
  const ids = [...new Set([...items, ...resumes].map((r) => r.id))]
  if (!ids.length) return { checked: 0, removed: [] }
  const found = await existingSceneIds(ids)
  const gone = ids.filter((id) => !found.has(id))
  if (!gone.length) return { checked: ids.length, removed: [] }
  if (gone.length > ids.length * MAX_SHARE && gone.length > 3) {
    console.error(`ghost sweep: Stash is missing ${gone.length} of ${ids.length} referenced scenes; removing nothing`)
    return { checked: ids.length, removed: [] }
  }
  await db.transaction(async (tx) => {
    await tx.delete(playlistItems).where(inArray(playlistItems.sceneId, gone))
    await tx.delete(stationResume).where(inArray(stationResume.sceneId, gone))
  })
  console.log(`ghost sweep: removed scenes ${gone.join(', ')} from playlists and station resume points`)
  return { checked: ids.length, removed: gone }
}

let running = false
export function scheduleSweep() {
  const run = () => {
    if (running) return
    running = true
    sweepGhosts()
      .catch((e) => console.error('ghost sweep:', (e as Error).message))
      .finally(() => (running = false))
  }
  setTimeout(run, 2 * 60_000).unref()
  return run
}
