// Reels: ordered ranges of library videos (wiki decisions/reels-edit-by-reference). Postgres
// holds the design; the videos' facts come from Stash at read time, so a clip whose video
// changed or left the library says so instead of playing something else.
import { clampClip, planReel, proposeDetails, type Reel, type ReelClip, type ReelClipStatus, type ReelDetail, type ReelProposal, type ReelRef, reelState, type ReelTransition } from '@flix/shared'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { db } from './db/index.ts'
import { reelItems, reelRefs, reels } from './db/schema.ts'
import { buildPlan, buildsById, dropBuild, hashPlan, latestBuilds, toReelBuild } from './reelBuilds.ts'
import { getScene } from './stash.ts'

type ItemRow = typeof reelItems.$inferSelect

const touch = (id: number) => db.update(reels).set({ updatedAt: new Date() }).where(eq(reels.id, id))

// A video's length may differ by a rounding between two reads; more than this is another file.
const SAME_LENGTH_SEC = 0.5
export const clipStatus = (markedDuration: number, nowDuration: number | null): ReelClipStatus =>
  nowDuration == null ? 'missing' : Math.abs(nowDuration - markedDuration) > SAME_LENGTH_SEC ? 'shifted' : 'ok'

type ReelRow = typeof reels.$inferSelect
type RefRow = typeof reelRefs.$inferSelect
type BuildRow = Awaited<ReturnType<typeof latestBuilds>> extends Map<number, infer B> ? B : never

// What a list shows of a reel. `latest` is its newest build, `published` the approved one
// (they are the same row when nothing newer was built).
function summary(
  r: ReelRow,
  clips: Pick<ItemRow, 'id' | 'sceneId' | 'startSec' | 'endSec' | 'transition'>[],
  refs: RefRow[],
  latest: BuildRow | undefined,
  published: BuildRow | undefined,
  stale: boolean | null = null,
): Reel {
  const of = (kind: RefRow['kind']) => refs.filter((x) => x.kind === kind).map((x) => ({ id: x.stashId, name: x.name }))
  return {
    id: r.id,
    name: r.name,
    transition: r.transition,
    clipCount: clips.length,
    durationSec: planReel({ transition: r.transition, clips: clips.map((c) => ({ id: c.id, sceneId: c.sceneId, start: c.startSec, end: c.endSec, transition: c.transition })) }).duration,
    cover: clips[0] ? `/media/stash/scene/${clips[0].sceneId}/screenshot` : null,
    updatedAt: r.updatedAt.toISOString(),
    build: latest ? toReelBuild(latest, stale) : null,
    state: reelState(latest ?? null, r.publishedBuildId),
    published:
      published?.file && published.durationSec != null && published.sizeBytes != null
        ? { buildId: published.id, url: `/media/reel/${published.id}`, durationSec: published.durationSec, sizeBytes: published.sizeBytes }
        : null,
    rating: r.rating,
    resumeSec: r.resumeSec,
    playCount: r.playCount,
    performers: of('performer'),
    tags: of('tag'),
    studios: of('studio'),
  }
}

const itemsOf = (reelId: number) => db.select().from(reelItems).where(eq(reelItems.reelId, reelId)).orderBy(asc(reelItems.position), asc(reelItems.id))

export interface ReelFilter {
  q?: string // in the name, or the name of a performer, category or studio it is filed under
  performer?: string
  tag?: string
  studio?: string
  state?: 'review' | 'published'
}

// Every reel, newest first; a filter by name or by who or what it is filed under returns
// published reels only (those are the ones listed beside videos).
export async function listReels(f: ReelFilter = {}): Promise<Reel[]> {
  const rows = await db.select().from(reels).orderBy(desc(reels.updatedAt))
  const items = await db.select().from(reelItems).orderBy(asc(reelItems.position), asc(reelItems.id))
  const refs = await db.select().from(reelRefs)
  const latest = await latestBuilds(rows.map((r) => r.id))
  const published = await buildsById(rows.map((r) => r.publishedBuildId).filter((x): x is number => x != null))
  const all = rows.map((r) =>
    summary(r, items.filter((i) => i.reelId === r.id), refs.filter((x) => x.reelId === r.id), latest.get(r.id), r.publishedBuildId != null ? published.get(r.publishedBuildId) : undefined),
  )
  const q = f.q?.trim().toLowerCase()
  const listed = f.performer || f.tag || f.studio || q
  return all.filter(
    (r) =>
      (!listed || r.published) &&
      (!f.state || (f.state === 'published' ? !!r.published : r.state === 'review')) &&
      (!f.performer || r.performers.some((x) => x.id === f.performer)) &&
      (!f.tag || r.tags.some((x) => x.id === f.tag)) &&
      (!f.studio || r.studios.some((x) => x.id === f.studio)) &&
      (!q || r.name.toLowerCase().includes(q) || [...r.performers, ...r.tags, ...r.studios].some((x) => x.name.toLowerCase().includes(q))),
  )
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
  const published = r.publishedBuildId != null ? (await buildsById([r.publishedBuildId])).get(r.publishedBuildId) : undefined
  const refs = await db.select().from(reelRefs).where(eq(reelRefs.reelId, id))
  return { ...summary(r, items, refs, b, published, b && plan ? hashPlan(plan) !== b.planHash : null), clips }
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

// --- review, publishing and what is recorded of watching (wiki features/reel-review) ---------

// What the review page offers: who and what the reel's clips show, by share of its running time.
export async function proposal(reelId: number): Promise<ReelProposal | null> {
  const [r] = await db.select({ id: reels.id }).from(reels).where(eq(reels.id, reelId))
  if (!r) return null
  const items = await itemsOf(reelId)
  const ids = [...new Set(items.map((i) => i.sceneId))]
  const found = await Promise.all(ids.map((sid) => getScene(sid).then((s) => s?.scene ?? null)))
  const scenes = new Map(ids.map((sid, i) => [sid, found[i]]))
  return proposeDetails(
    items.flatMap((i) => {
      const s = scenes.get(i.sceneId)
      const pick = (x: { id: string; name: string }) => ({ id: x.id, name: x.name })
      return s ? [{ length: i.endSec - i.startSec, performers: s.performers.map(pick), tags: s.tags.map(pick), studio: s.studio ? pick(s.studio) : null }] : []
    }),
  )
}

export interface Approval {
  name?: string
  performers: ReelRef[]
  tags: ReelRef[]
  studios: ReelRef[]
}

// Approve the reel's latest finished build: it becomes the file that is listed and played,
// filed under what the user confirmed. RangeError when there is no finished build to approve.
export async function approve(reelId: number, a: Approval): Promise<void> {
  const [r] = await db.select().from(reels).where(eq(reels.id, reelId))
  if (!r) throw new RangeError('no such reel')
  const b = (await latestBuilds([reelId])).get(reelId)
  if (!b || b.status !== 'done') throw new RangeError('the reel has no finished build to approve')
  const rows = (['performer', 'tag', 'studio'] as const).flatMap((kind) =>
    [...new Map((kind === 'performer' ? a.performers : kind === 'tag' ? a.tags : a.studios).map((x) => [x.id, x])).values()].map((x) => ({ reelId, kind, stashId: x.id, name: x.name })),
  )
  await db.transaction(async (tx) => {
    await tx.delete(reelRefs).where(eq(reelRefs.reelId, reelId))
    if (rows.length) await tx.insert(reelRefs).values(rows)
    // a new file starts unwatched; the rating stays with the reel
    const fresh = r.publishedBuildId !== b.id
    await tx
      .update(reels)
      .set({ ...(a.name ? { name: a.name } : {}), publishedBuildId: b.id, publishedAt: new Date(), updatedAt: new Date(), ...(fresh ? { resumeSec: 0 } : {}) })
      .where(eq(reels.id, reelId))
  })
  if (r.publishedBuildId != null && r.publishedBuildId !== b.id) await dropBuild(r.publishedBuildId) // the builder removes its file
}

// Send a finished build back: it is dropped and the reel is a draft again (or stays published
// with its earlier file). False when there is nothing waiting for review.
export async function sendBack(reelId: number): Promise<boolean> {
  const [r] = await db.select({ published: reels.publishedBuildId }).from(reels).where(eq(reels.id, reelId))
  const b = (await latestBuilds([reelId])).get(reelId)
  if (!r || !b || b.status !== 'done' || b.id === r.published) return false
  await dropBuild(b.id)
  return true
}

// Where the viewer stopped, and a play once enough was watched. The web app does not call
// this in a private session.
export async function recordActivity(reelId: number, a: { resumeSec?: number; played?: boolean }): Promise<boolean> {
  const set: Partial<typeof reels.$inferInsert> = {}
  if (a.resumeSec !== undefined) set.resumeSec = Math.max(0, a.resumeSec)
  if (a.played) Object.assign(set, { playCount: sql`${reels.playCount} + 1`, lastPlayedAt: new Date() })
  if (!Object.keys(set).length) return true
  const rows = await db.update(reels).set(set).where(eq(reels.id, reelId)).returning({ id: reels.id })
  return rows.length > 0
}

export async function rateReel(reelId: number, rating: number | null): Promise<boolean> {
  const rows = await db.update(reels).set({ rating }).where(eq(reels.id, reelId)).returning({ id: reels.id })
  return rows.length > 0
}

