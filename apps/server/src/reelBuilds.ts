// The reel build queue (wiki features/reel-builds). flix owns the schedule; the builder on the
// NAS only asks "anything for me?" once a minute and renders what it is handed.
//
// - A reel queued with "Build now" is offered at any hour.
// - Otherwise queued reels are offered from 02:00 to 05:00 US Eastern, oldest first, one at a
//   time, the next no sooner than 5 minutes after the last one ended. Nothing is stopped: a
//   build claimed before 05:00 runs to its end.
// - A builder that stops reporting loses its claim after 10 minutes and the reel is queued again.
import { createHash } from 'node:crypto'
import { type BuildPlan, dominantFps, planReel, type ReelBuild, type ReelTransition, RENDER_QP, type RenderClip } from '@flix/shared'
import { and, asc, eq, inArray, lt, ne, sql } from 'drizzle-orm'
import { config } from './config.ts'
import { db } from './db/index.ts'
import { reelBuilds, reelItems, reels } from './db/schema.ts'
import { getScene } from './stash.ts'

export const WINDOW_FROM_HOUR = 2
export const WINDOW_TO_HOUR = 5
export const BREATHER_MS = 5 * 60_000
export const CLAIM_STALE_MS = 10 * 60_000
const ZONE = 'America/New_York'

// The hour of the day in US Eastern time, whatever the server's clock zone (the pod runs UTC).
export function easternHour(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', hourCycle: 'h23' }).format(d))
}
export const inWindow = (d: Date): boolean => {
  const h = easternHour(d)
  return h >= WINDOW_FROM_HOUR && h < WINDOW_TO_HOUR
}

export interface QueueState {
  queued: { id: number; now: boolean; queuedAt: Date }[]
  building: boolean // a build is claimed and still reporting
  lastEndedAt: Date | null // when the last build finished or failed
}

// Which queued build the builder may have now, if any.
export function nextBuild(now: Date, s: QueueState): number | null {
  if (s.building) return null
  const oldest = (list: QueueState['queued']) => [...list].sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime() || a.id - b.id)[0]?.id ?? null
  const asap = oldest(s.queued.filter((q) => q.now))
  if (asap != null) return asap
  if (!inWindow(now)) return null
  if (s.lastEndedAt && now.getTime() - s.lastEndedAt.getTime() < BREATHER_MS) return null
  return oldest(s.queued)
}

type BuildRow = typeof reelBuilds.$inferSelect

export const toReelBuild = (b: BuildRow, stale: boolean | null): ReelBuild => ({
  id: b.id,
  status: b.status,
  now: b.now,
  progress: b.progress,
  message: b.message,
  error: b.error,
  url: b.status === 'done' && b.file ? `/media/reel/${b.id}` : null,
  durationSec: b.durationSec,
  sizeBytes: b.sizeBytes,
  queuedAt: b.queuedAt.toISOString(),
  finishedAt: b.finishedAt?.toISOString() ?? null,
  stale,
})

export const hashPlan = (plan: BuildPlan): string => createHash('sha256').update(JSON.stringify([plan.settings, plan.clips])).digest('hex')

// The reel as the builder renders it: every playable clip with its file's facts from Stash.
// Null when the reel is gone; a plan with no clips when nothing in it is playable.
export async function buildPlan(reelId: number): Promise<BuildPlan | null> {
  const [r] = await db.select().from(reels).where(eq(reels.id, reelId))
  if (!r) return null
  const items = await db.select().from(reelItems).where(eq(reelItems.reelId, reelId)).orderBy(asc(reelItems.position), asc(reelItems.id))
  const ids = [...new Set(items.map((i) => i.sceneId))]
  const found = await Promise.all(ids.map((id) => getScene(id).then((s) => s?.scene ?? null)))
  const scenes = new Map(ids.map((id, i) => [id, found[i]]))
  const playable = items.filter((i) => scenes.get(i.sceneId)?.file)
  const plan = planReel({
    transition: r.transition as ReelTransition,
    clips: playable.map((i) => ({ id: i.id, sceneId: i.sceneId, start: i.startSec, end: i.endSec, transition: i.transition })),
  })
  const clips: RenderClip[] = plan.segments.map((s) => {
    const scene = scenes.get(s.sceneId)!
    const f = scene.file!
    return {
      path: f.path,
      start: s.start,
      end: s.end,
      width: scene.width,
      height: scene.height,
      videoCodec: f.videoCodec,
      hasAudio: !!f.audioCodec,
      bitrate: f.bitrate,
      fadeIn: s.from === 'fade',
      fadeOut: s.into === 'fade',
    }
  })
  const fps = dominantFps(plan.segments.map((s) => ({ fps: scenes.get(s.sceneId)!.file!.framerate, length: s.length })))
  return { reelId, settings: { fps, qp: RENDER_QP }, clips, duration: plan.duration }
}

// The latest build of each reel asked for.
export async function latestBuilds(reelIds: number[]): Promise<Map<number, BuildRow>> {
  if (!reelIds.length) return new Map()
  const rows = await db.select().from(reelBuilds).where(inArray(reelBuilds.reelId, reelIds)).orderBy(asc(reelBuilds.id))
  return new Map(rows.map((b) => [b.reelId, b])) // later rows win
}

// Queue a reel. A build already waiting or failed is replaced; one being rendered is left to
// finish (RangeError). RangeError too when the reel has nothing to render.
export async function queueBuild(reelId: number, now: boolean): Promise<number> {
  const plan = await buildPlan(reelId)
  if (!plan) throw new RangeError('no such reel')
  if (!plan.clips.length) throw new RangeError('the reel has no clips that can be played')
  const [busy] = await db.select({ id: reelBuilds.id }).from(reelBuilds).where(and(eq(reelBuilds.reelId, reelId), eq(reelBuilds.status, 'building')))
  if (busy) throw new RangeError('this reel is being built right now')
  await db.delete(reelBuilds).where(and(eq(reelBuilds.reelId, reelId), inArray(reelBuilds.status, ['queued', 'failed'])))
  const [row] = await db.insert(reelBuilds).values({ reelId, now, planHash: hashPlan(plan), plan }).returning({ id: reelBuilds.id })
  return row.id
}

// Take a waiting build back out of the queue.
export async function cancelBuild(reelId: number): Promise<boolean> {
  const gone = await db.delete(reelBuilds).where(and(eq(reelBuilds.reelId, reelId), eq(reelBuilds.status, 'queued'))).returning({ id: reelBuilds.id })
  return gone.length > 0
}

// The builder asks for work. Claims that went silent go back to the queue first.
export async function claimBuild(now = new Date()): Promise<{ id: number; plan: BuildPlan } | null> {
  await db
    .update(reelBuilds)
    .set({ status: 'queued', claimedAt: null, heartbeatAt: null, progress: 0, message: 'The builder stopped reporting; queued again' })
    .where(and(eq(reelBuilds.status, 'building'), lt(reelBuilds.heartbeatAt, new Date(now.getTime() - CLAIM_STALE_MS))))
  const open = await db.select().from(reelBuilds).where(inArray(reelBuilds.status, ['queued', 'building']))
  const [last] = await db.select({ at: sql<Date | null>`max(${reelBuilds.finishedAt})` }).from(reelBuilds)
  const id = nextBuild(now, {
    queued: open.filter((b) => b.status === 'queued').map((b) => ({ id: b.id, now: b.now, queuedAt: b.queuedAt })),
    building: open.some((b) => b.status === 'building'),
    lastEndedAt: last?.at ? new Date(last.at) : null,
  })
  if (id == null) return null
  const [row] = await db
    .update(reelBuilds)
    .set({ status: 'building', claimedAt: now, heartbeatAt: now, progress: 0, message: 'Starting', error: null })
    .where(and(eq(reelBuilds.id, id), eq(reelBuilds.status, 'queued')))
    .returning()
  return row ? { id: row.id, plan: row.plan as BuildPlan } : null
}

// A sign of life from the builder. False when the build is no longer its to render (cancelled
// with its reel, or taken back): it should stop.
export async function reportProgress(id: number, progress: number, message: string | null, now = new Date()): Promise<boolean> {
  const rows = await db
    .update(reelBuilds)
    .set({ progress: Math.min(1, Math.max(0, progress)), message, heartbeatAt: now })
    .where(and(eq(reelBuilds.id, id), eq(reelBuilds.status, 'building')))
    .returning({ id: reelBuilds.id })
  return rows.length > 0
}

const FILE_NAME = /^reel-\d+-b\d+\.mp4$/

export async function finishBuild(id: number, r: { file: string; durationSec: number; sizeBytes: number }, now = new Date()): Promise<boolean> {
  if (!FILE_NAME.test(r.file)) throw new RangeError('not a reel file name')
  const [row] = await db
    .update(reelBuilds)
    .set({ status: 'done', progress: 1, message: null, error: null, file: r.file, durationSec: r.durationSec, sizeBytes: r.sizeBytes, finishedAt: now, heartbeatAt: now })
    .where(and(eq(reelBuilds.id, id), eq(reelBuilds.status, 'building')))
    .returning({ reelId: reelBuilds.reelId })
  if (!row) return false
  // the reel's earlier builds are replaced by this one, except the approved one, which keeps
  // playing until this one is approved; the builder removes the files of the rows that go
  const [reel] = await db.select({ published: reels.publishedBuildId }).from(reels).where(eq(reels.id, row.reelId))
  await db
    .delete(reelBuilds)
    .where(and(eq(reelBuilds.reelId, row.reelId), ne(reelBuilds.id, id), ne(reelBuilds.id, reel?.published ?? 0), inArray(reelBuilds.status, ['done', 'failed'])))
  return true
}

export async function failBuild(id: number, error: string, now = new Date()): Promise<boolean> {
  const rows = await db
    .update(reelBuilds)
    .set({ status: 'failed', error: error.slice(0, 500), finishedAt: now, heartbeatAt: now })
    .where(and(eq(reelBuilds.id, id), eq(reelBuilds.status, 'building')))
    .returning({ id: reelBuilds.id })
  return rows.length > 0
}

// The built files that belong to a reel: the builder deletes any other reel file in its folder.
export async function builtFiles(): Promise<string[]> {
  const rows = await db.select({ file: reelBuilds.file }).from(reelBuilds).where(eq(reelBuilds.status, 'done'))
  return rows.map((r) => r.file).filter((f): f is string => !!f)
}

// Where a finished build's file is, as Stash would name the path; null when there is none.
export async function builtFilePath(id: number): Promise<string | null> {
  const [b] = await db.select({ file: reelBuilds.file, status: reelBuilds.status }).from(reelBuilds).where(eq(reelBuilds.id, id))
  return b?.status === 'done' && b.file && FILE_NAME.test(b.file) ? `${config.reelsDir}/${b.file}` : null
}

// The finished builds asked for, by id (the approved files of a list of reels).
export async function buildsById(ids: number[]): Promise<Map<number, BuildRow>> {
  if (!ids.length) return new Map()
  const rows = await db.select().from(reelBuilds).where(and(inArray(reelBuilds.id, ids), eq(reelBuilds.status, 'done')))
  return new Map(rows.map((b) => [b.id, b]))
}

// Drop a finished build (sent back at review, or replaced by a newer approved one).
export const dropBuild = (id: number) => db.delete(reelBuilds).where(and(eq(reelBuilds.id, id), eq(reelBuilds.status, 'done')))
