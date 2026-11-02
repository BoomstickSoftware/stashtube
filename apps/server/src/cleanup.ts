// The Whisparr cleanup (architecture/whisparr-cleanup). Whisparr keeps a record for every scene and
// studio it ever learned; flix browses StashDB itself and a Get adds a scene by its StashDB id,
// so only records backed by a file, or by something in flight, are worth keeping:
// - Scenes: a record without a file goes unless it is downloading or grabbed, a Get from flix
//   still waiting (`whisparr_gets`), or in the Get queue. Monitored or not, scene or film.
// - Studios: after the scenes, a studio with no scene record left goes.
// Never a file (`deleteFiles: false`), never an import exclusion, never a record with a file.
// Each run starts with a Whisparr Backup and deletes in paced chunks, in the background.
// `studio` narrows a run to that one studio (the test before a full run).
import { db } from './db/index.ts'
import { getQueue, whisparrGets } from './db/schema.ts'
import { config } from './config.ts'
import * as whisparr from './whisparr.ts'
import type { Movie, WStudio } from './whisparr.ts'

export const CHUNK = 100
export const PAUSE = 5_000 // ms between scene chunks: Whisparr runs on a small NAS with SQLite
export const STUDIO_PAUSE = 300 // ms between studio deletes (one call each)

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

export interface CleanupStatus {
  running: boolean
  phase: string | null
  planned: number
  deleted: number
  kept: CleanupPlan['kept'] | null
  studios: { planned: number; deleted: number; failed: number }
  studio: string | null
  error: string | null
  startedAt: string | null
  finishedAt: string | null
}
const idle = (): CleanupStatus => ({ running: false, phase: null, planned: 0, deleted: 0, kept: null, studios: { planned: 0, deleted: 0, failed: 0 }, studio: null, error: null, startedAt: null, finishedAt: null })
export let cleanupStatus: CleanupStatus = idle()

async function plan(studio?: string) {
  const [movies, a, g, q] = await Promise.all([whisparr.freshMovies(), whisparr.activity(), db.select().from(whisparrGets), db.select().from(getQueue)])
  return planCleanup(movies, new Set([...a.downloading, ...a.grabbedAt.keys()]), new Set(g.map((r) => r.movieId)), new Set(q.map((r) => r.stashdbId)), studio)
}

// Dry run: what would go. Studios are counted as if the scene deletes had happened.
export async function previewCleanup(studio?: string) {
  if (!config.whisparr) throw new RangeError('Whisparr is not configured')
  const p = await plan(studio)
  const gone = new Set(p.remove)
  whisparr.forgetLists()
  const [movies, studios] = await Promise.all([whisparr.movies(), whisparr.listStudios()])
  const studiosGone = emptyStudios(studios, movies.filter((m) => !gone.has(m.id)), studio)
  return { total: p.total, remove: p.remove.length, kept: p.kept, studios: studios.length, studiosRemove: studiosGone.length, studio: studio ?? null }
}

// Start a run in the background; the status says how it goes.
export async function startCleanup(studio?: string): Promise<CleanupStatus> {
  if (!config.whisparr) throw new RangeError('Whisparr is not configured')
  if (cleanupStatus.running) throw new RangeError('a cleanup is already running')
  cleanupStatus = { ...idle(), running: true, phase: 'planning', studio: studio ?? null, startedAt: new Date().toISOString() }
  run(studio)
    .catch((e: Error) => (cleanupStatus.error = e.message))
    .finally(() => {
      cleanupStatus.running = false
      cleanupStatus.phase = cleanupStatus.error ? 'failed' : 'done'
      cleanupStatus.finishedAt = new Date().toISOString()
    })
  return cleanupStatus
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function run(studio?: string) {
  const p = await plan(studio)
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
  // Studios from what Whisparr holds now, not from the plan: a studio keeps any scene left.
  cleanupStatus.phase = 'deleting studios'
  whisparr.forgetLists()
  const [movies, studios] = await Promise.all([whisparr.freshMovies(), whisparr.listStudios()])
  const empty = emptyStudios(studios, movies, studio)
  cleanupStatus.studios.planned = empty.length
  let failedInARow = 0
  for (const id of empty) {
    try {
      await whisparr.deleteStudio(id)
      cleanupStatus.studios.deleted++
      failedInARow = 0
    } catch (e) {
      cleanupStatus.studios.failed++
      if (++failedInARow >= 5) throw new Error(`studio deletes failing: ${(e as Error).message}`)
    }
    await sleep(STUDIO_PAUSE)
  }
}
