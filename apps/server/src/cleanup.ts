// The Whisparr cleanup (architecture/whisparr-cleanup). Whisparr keeps a record for every scene and
// studio it ever learned; flix browses StashDB itself and a Get adds a scene by its StashDB id,
// so only records backed by a file, or by something in flight, are worth keeping:
// - Scenes: a record without a file goes unless it is downloading or grabbed, a Get from flix
//   still waiting (`whisparr_gets`), or in the Get queue. Monitored or not, scene or film.
// - Studios, then performers: after the scenes, one with no scene record left goes. A performer
//   is kept if a remaining scene names them by id or, for the few records without ids, by name.
// Never a file (`deleteFiles: false`), never an import exclusion, never a record with a file.
// Each run starts with a Whisparr Backup and deletes in paced chunks, in the background.
// `studio` or `performer` narrows a run to that one (the test before a full run).
import { db } from './db/index.ts'
import { getQueue, whisparrGets } from './db/schema.ts'
import { config } from './config.ts'
import * as whisparr from './whisparr.ts'
import type { Movie, WPerformer, WStudio } from './whisparr.ts'

export const CHUNK = 100
export const PAUSE = 5_000 // ms between scene chunks: Whisparr runs on a small NAS with SQLite
export const ONE_PAUSE = 300 // ms between studio or performer deletes (one call each)

type MovieLike = Pick<Movie, 'id' | 'hasFile' | 'stashId' | 'studioForeignId'>
export interface CleanupPlan {
  total: number
  remove: number[]
  kept: { file: number; busy: number; gets: number; queued: number }
}

// Pure: which scene records go.
export function planCleanup(movies: MovieLike[], busy: Set<number>, gets: Set<number>, queued: Set<string>, studio?: string): CleanupPlan {
  const plan: CleanupPlan = { total: movies.length, remove: [], kept: { file: 0, busy: 0, gets: 0, queued: 0 } }
  for (const m of movies) {
    if (studio && m.studioForeignId !== studio) continue
    if (m.hasFile) plan.kept.file++
    else if (busy.has(m.id)) plan.kept.busy++
    else if (gets.has(m.id)) plan.kept.gets++
    else if (m.stashId && queued.has(m.stashId)) plan.kept.queued++
    else plan.remove.push(m.id)
  }
  return plan
}

// Pure: studios with no scene record left (read after the scene deletes).
export function emptyStudios(studios: Pick<WStudio, 'id' | 'foreignId'>[], movies: Pick<Movie, 'studioForeignId'>[], studio?: string): number[] {
  const used = new Set(movies.map((m) => m.studioForeignId).filter(Boolean))
  return studios.filter((s) => (!studio || s.foreignId === studio) && !used.has(s.foreignId)).map((s) => s.id)
}

// Pure: performers no remaining scene names, by id or by name.
export function emptyPerformers(performers: Pick<WPerformer, 'id' | 'foreignId' | 'fullName'>[], movies: Pick<Movie, 'performerForeignIds' | 'performerNames'>[], performer?: string): number[] {
  const ids = new Set(movies.flatMap((m) => m.performerForeignIds ?? []))
  const names = new Set(movies.flatMap((m) => m.performerNames ?? []))
  return performers.filter((p) => (!performer || p.foreignId === performer) && !ids.has(p.foreignId) && !names.has(p.fullName)).map((p) => p.id)
}

export interface CleanupStatus {
  running: boolean
  phase: string | null
  planned: number
  deleted: number
  kept: CleanupPlan['kept'] | null
  studios: { planned: number; deleted: number; failed: number }
  performers: { planned: number; deleted: number; failed: number }
  studio: string | null
  performer: string | null
  error: string | null
  startedAt: string | null
  finishedAt: string | null
}
const idle = (): CleanupStatus => ({ running: false, phase: null, planned: 0, deleted: 0, kept: null, studios: { planned: 0, deleted: 0, failed: 0 }, performers: { planned: 0, deleted: 0, failed: 0 }, studio: null, performer: null, error: null, startedAt: null, finishedAt: null })
export let cleanupStatus: CleanupStatus = idle()

async function plan(studio?: string, performer?: string) {
  const [movies, a, g, q] = await Promise.all([whisparr.freshMovies(), whisparr.activity(), db.select().from(whisparrGets), db.select().from(getQueue)])
  const p = planCleanup(performer ? [] : movies, new Set([...a.downloading, ...a.grabbedAt.keys()]), new Set(g.map((r) => r.movieId)), new Set(q.map((r) => r.stashdbId)), studio)
  return { ...p, total: movies.length }
}

// Dry run: what would go. Studios are counted as if the scene deletes had happened.
export async function previewCleanup(studio?: string, performer?: string) {
  if (!config.whisparr) throw new RangeError('Whisparr is not configured')
  const p = await plan(studio, performer)
  const gone = new Set(p.remove)
  whisparr.forgetLists()
  const [movies, studios, performers] = await Promise.all([whisparr.movies(), whisparr.listStudios(), whisparr.listPerformers()])
  const left = movies.filter((m) => !gone.has(m.id))
  const studiosGone = performer ? [] : emptyStudios(studios, left, studio)
  const performersGone = studio ? [] : emptyPerformers(performers, left, performer)
  return {
    total: p.total,
    remove: p.remove.length,
    kept: p.kept,
    studios: studios.length,
    studiosRemove: studiosGone.length,
    performers: performers.length,
    performersRemove: performersGone.length,
    studio: studio ?? null,
    performer: performer ?? null,
  }
}

// Start a run in the background; the status says how it goes.
export async function startCleanup(studio?: string, performer?: string): Promise<CleanupStatus> {
  if (!config.whisparr) throw new RangeError('Whisparr is not configured')
  if (cleanupStatus.running) throw new RangeError('a cleanup is already running')
  cleanupStatus = { ...idle(), running: true, phase: 'planning', studio: studio ?? null, performer: performer ?? null, startedAt: new Date().toISOString() }
  run(studio, performer)
    .catch((e: Error) => (cleanupStatus.error = e.message))
    .finally(() => {
      cleanupStatus.running = false
      cleanupStatus.phase = cleanupStatus.error ? 'failed' : 'done'
      cleanupStatus.finishedAt = new Date().toISOString()
    })
  return cleanupStatus
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// One record at a time; five failures in a row stop the run.
async function deleteEach(ids: number[], del: (id: number) => Promise<void>, count: CleanupStatus['studios']) {
  count.planned = ids.length
  let failedInARow = 0
  for (const id of ids) {
    try {
      await del(id)
      count.deleted++
      failedInARow = 0
    } catch (e) {
      count.failed++
      if (++failedInARow >= 5) throw new Error(`deletes failing: ${(e as Error).message}`)
    }
    await sleep(ONE_PAUSE)
  }
}

async function run(studio?: string, performer?: string) {
  const p = await plan(studio, performer)
  cleanupStatus.planned = p.remove.length
  cleanupStatus.kept = p.kept
  cleanupStatus.phase = 'backup'
  const b = await whisparr.runCommand({ name: 'Backup' }, 180_000)
  if (b !== 'completed') throw new Error(`Whisparr Backup did not complete (${b}); nothing deleted`)
  await sleep(3000) // the backup's SQLite lock
  cleanupStatus.phase = 'deleting scenes'
  for (let i = 0; i < p.remove.length; i += CHUNK) {
    if (i) await sleep(PAUSE)
    const chunk = p.remove.slice(i, i + CHUNK)
    await whisparr.deleteRecords(chunk)
    cleanupStatus.deleted += chunk.length
  }
  // Studios and performers from what Whisparr holds now, not from the plan: any scene left keeps them.
  whisparr.forgetLists()
  const [movies, studios, performers] = await Promise.all([whisparr.freshMovies(), whisparr.listStudios(), whisparr.listPerformers()])
  if (!performer) {
    cleanupStatus.phase = 'deleting studios'
    await deleteEach(emptyStudios(studios, movies, studio), whisparr.deleteStudio, cleanupStatus.studios)
  }
  if (!studio) {
    cleanupStatus.phase = 'deleting performers'
    await deleteEach(emptyPerformers(performers, movies, performer), whisparr.deletePerformer, cleanupStatus.performers)
  }
}
