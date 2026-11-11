// Reels: ordered ranges of library videos (wiki decisions/reels-edit-by-reference). Postgres
// holds the design; the videos' facts come from Stash at read time, so a clip whose video
// changed or left the library says so instead of playing something else.
import { clampClip, planReel, type Reel, type ReelClip, type ReelClipStatus, type ReelDetail, type ReelTransition } from '@flix/shared'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { db } from './db/index.ts'
import { reelItems, reels } from './db/schema.ts'
import { buildPlan, hashPlan, latestBuilds, toReelBuild } from './reelBuilds.ts'
import { getScene } from './stash.ts'

type ItemRow = typeof reelItems.$inferSelect

const touch = (id: number) => db.update(reels).set({ updatedAt: new Date() }).where(eq(reels.id, id))

// A video's length may differ by a rounding between two reads; more than this is another file.
const SAME_LENGTH_SEC = 0.5
export const clipStatus = (markedDuration: number, nowDuration: number | null): ReelClipStatus =>
  nowDuration == null ? 'missing' : Math.abs(nowDuration - markedDuration) > SAME_LENGTH_SEC ? 'shifted' : 'ok'

const summary = (r: typeof reels.$inferSelect, clips: Pick<ItemRow, 'id' | 'sceneId' | 'startSec' | 'endSec' | 'transition'>[], build: Reel['build'] = null): Reel => ({
  id: r.id,
  name: r.name,
  transition: r.transition,
  clipCount: clips.length,
  durationSec: planReel({ transition: r.transition, clips: clips.map((c) => ({ id: c.id, sceneId: c.sceneId, start: c.startSec, end: c.endSec, transition: c.transition })) }).duration,
  cover: clips[0] ? `/media/stash/scene/${clips[0].sceneId}/screenshot` : null,
  updatedAt: r.updatedAt.toISOString(),
  build,
})

const itemsOf = (reelId: number) => db.select().from(reelItems).where(eq(reelItems.reelId, reelId)).orderBy(asc(reelItems.position), asc(reelItems.id))

export async function listReels(): Promise<Reel[]> {
  const rows = await db.select().from(reels).orderBy(desc(reels.updatedAt))
  const items = await db.select().from(reelItems).orderBy(asc(reelItems.position), asc(reelItems.id))
  const builds = await latestBuilds(rows.map((r) => r.id))
  return rows.map((r) => {
    const b = builds.get(r.id)
    return summary(r, items.filter((i) => i.reelId === r.id), b ? toReelBuild(b, null) : null)
  })
}

export async function getReel(id: number): Promise<ReelDetail | null> {
  const [r] = await db.select().from(reels).where(eq(reels.id, id))
  if (!r) return null
  const items = await itemsOf(id)
  const sceneIds = [...new Set(items.map((i) => i.sceneId))]
  const found = await Promise.all(sceneIds.map((sid) => getScene(sid).then((s) => s?.scene ?? null)))
  const scenes = new Map(sceneIds.map((sid, i) => [sid, found[i]]))
  const clips: ReelClip[] = items.map((i) => {
    const s = scenes.get(i.sceneId) ?? null
    return {
      id: i.id,
      sceneId: i.sceneId,
      start: i.startSec,
      end: i.endSec,
      transition: i.transition,
      status: clipStatus(i.sourceDurationSec, s ? s.durationSec : null),
      source: s && {
        title: s.title,
        durationSec: s.durationSec,
        height: s.height,
        screenshot: s.screenshot,
        vtt: s.vtt,
        direct: s.playback.direct,
        hls: s.playback.hls,
        container: s.playback.container,
        videoCodec: s.playback.videoCodec,
        audioCodec: s.playback.audioCodec,
      },
    }
  })
  // has the design changed since the latest build was queued?
  const b = (await latestBuilds([id])).get(id)
  const plan = b ? await buildPlan(id) : null
  const build = b ? toReelBuild(b, plan ? hashPlan(plan) !== b.planHash : null) : null
  return { ...summary(r, items, build), clips }
}

export async function createReel(name: string, transition: ReelTransition = 'cut') {
  const [r] = await db.insert(reels).values({ name, transition }).returning({ id: reels.id })
  return r.id
}

export async function updateReel(id: number, patch: { name?: string; transition?: ReelTransition }) {
  const r = await db.update(reels).set({ ...patch, updatedAt: new Date() }).where(eq(reels.id, id)).returning({ id: reels.id })
  return r.length > 0
}

export const deleteReel = (id: number) => db.delete(reels).where(eq(reels.id, id))

// Adds a range of a video at the end of the reel. RangeError: the reel or the video is not
// there, or the video is too short to hold a clip.
export async function addClip(reelId: number, sceneId: string, start: number, end: number): Promise<number> {
  const [r] = await db.select({ id: reels.id }).from(reels).where(eq(reels.id, reelId))
  if (!r) throw new RangeError('no such reel')
  const scene = (await getScene(sceneId))?.scene
  if (!scene) throw new RangeError('no such video')
  const range = clampClip(start, end, scene.durationSec)
  if (!range) throw new RangeError('the video is too short for a clip')
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${reelItems.position}), -1)::int + 1` }).from(reelItems).where(eq(reelItems.reelId, reelId))
  const [row] = await db
    .insert(reelItems)
    .values({ reelId, sceneId, startSec: range.start, endSec: range.end, position: next, sourceDurationSec: scene.durationSec })
    .returning({ id: reelItems.id })
  await touch(reelId)
  return row.id
}

// Changes a clip's range or its transition. A new range is fitted to the video as it is now,
// which also accepts the video's present length as the clip's (a "shifted" clip the user
// re-trimmed is ok again).
export async function updateClip(reelId: number, clipId: number, patch: { start?: number; end?: number; transition?: ReelTransition | null }): Promise<boolean> {
  const [item] = await db.select().from(reelItems).where(eq(reelItems.id, clipId))
  if (!item || item.reelId !== reelId) return false
  const set: Partial<typeof reelItems.$inferInsert> = {}
  if (patch.transition !== undefined) set.transition = patch.transition
  if (patch.start !== undefined || patch.end !== undefined) {
    const scene = (await getScene(item.sceneId))?.scene
    if (!scene) throw new RangeError('the video is no longer in the library')
    const range = clampClip(patch.start ?? item.startSec, patch.end ?? item.endSec, scene.durationSec)
    if (!range) throw new RangeError('the video is too short for a clip')
    Object.assign(set, { startSec: range.start, endSec: range.end, sourceDurationSec: scene.durationSec })
  }
  if (Object.keys(set).length) await db.update(reelItems).set(set).where(eq(reelItems.id, clipId))
  await touch(reelId)
  return true
}

export async function removeClip(reelId: number, clipId: number) {
  const gone = await db.delete(reelItems).where(sql`${reelItems.id} = ${clipId} and ${reelItems.reelId} = ${reelId}`).returning({ id: reelItems.id })
  if (gone.length) await touch(reelId)
  return gone.length > 0
}

// The order the user dragged the clips into. Ids that are not this reel's are ignored; clips
// left out keep their relative order after the listed ones.
export async function reorderClips(reelId: number, clipIds: number[]) {
  const items = await itemsOf(reelId)
  const mine = new Set(items.map((i) => i.id))
  const listed = [...new Set(clipIds)].filter((id) => mine.has(id))
  const order = [...listed, ...items.map((i) => i.id).filter((id) => !listed.includes(id))]
  await db.transaction(async (tx) => {
    for (const [position, id] of order.entries()) await tx.update(reelItems).set({ position }).where(eq(reelItems.id, id))
  })
  await touch(reelId)
}
