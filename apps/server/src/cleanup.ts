// The Whisparr cleanup (architecture/whisparr-cleanup): Whisparr holds ~28k scene records it
// learned while performers and studios were watched, nearly all without a file. flix browses
// StashDB itself now and Gets add a scene by its StashDB id, so a record without a file that
// nothing is fetching is dead weight. This deletes those records (never a file, no import
// exclusion), after a Whisparr Backup, in paced chunks, in the background.
// - Kept: anything with a file, monitored, downloading or grabbed, a Get from flix, in the Get
//   queue, and feature films (`itemType: 'movie'`).
// - `studio`: only that studio's records, then a refresh of that studio, reporting how many of
//   the deleted ones came back (the test before a full run).
import { db } from './db/index.ts'
import { getQueue, whisparrGets } from './db/schema.ts'
import { config } from './config.ts'
import * as whisparr from './whisparr.ts'
import type { Movie } from './whisparr.ts'

export const CHUNK = 100
export const PAUSE = 5_000 // ms between chunks: Whisparr runs on a small NAS with SQLite

export interface CleanupPlan {
  total: number
  remove: number[]
  kept: { file: number; monitored: number; busy: number; gets: number; queued: number; films: number }
}

// Pure: which records go.
export function planCleanup(movies: Pick<Movie, 'id' | 'hasFile' | 'monitored' | 'itemType' | 'stashId' | 'studioForeignId'>[], busy: Set<number>, gets: Set<number>, queued: Set<string>, studio?: string): CleanupPlan {
  const plan: CleanupPlan = { total: movies.length, remove: [], kept: { file: 0, monitored: 0, busy: 0, gets: 0, queued: 0, films: 0 } }
  for (const m of movies) {
    if (studio && m.studioForeignId !== studio) continue
    if (m.hasFile) plan.kept.file++
    else if (m.monitored) plan.kept.monitored++
    else if (busy.has(m.id)) plan.kept.busy++
    else if (gets.has(m.id)) plan.kept.gets++
    else if (m.stashId && queued.has(m.stashId)) plan.kept.queued++
    else if (m.itemType === 'movie') plan.kept.films++
    else plan.remove.push(m.id)
  }
  return plan
}

export interface CleanupStatus {
  running: boolean
  phase: string | null
  planned: number
  deleted: number
  kept: CleanupPlan['kept'] | null
  studio: string | null
  cameBack: number | null // after the studio test's refresh
  error: string | null
  startedAt: string | null
  finishedAt: string | null
}
export let cleanupStatus: CleanupStatus = { running: false, phase: null, planned: 0, deleted: 0, kept: null, studio: null, cameBack: null, error: null, startedAt: null, finishedAt: null }

async function plan(studio?: string) {
  const [movies, a, g, q] = await Promise.all([whisparr.freshMovies(), whisparr.activity(), db.select().from(whisparrGets), db.select().from(getQueue)])
  return {
    movies,
    plan: planCleanup(movies, new Set([...a.downloading, ...a.grabbedAt.keys()]), new Set(g.map((r) => r.movieId)), new Set(q.map((r) => r.stashdbId)), studio),
  }
}

// Dry run: what would go.
export async function previewCleanup(studio?: string) {
  if (!config.whisparr) throw new RangeError('Whisparr is not configured')
  const { plan: p } = await plan(studio)
  return { total: p.total, remove: p.remove.length, kept: p.kept, studio: studio ?? null }
}

// Start a run in the background; the status says how it goes.
export async function startCleanup(studio?: string): Promise<CleanupStatus> {
  if (!config.whisparr) throw new RangeError('Whisparr is not configured')
  if (cleanupStatus.running) throw new RangeError('a cleanup is already running')
  cleanupStatus = { running: true, phase: 'planning', planned: 0, deleted: 0, kept: null, studio: studio ?? null, cameBack: null, error: null, startedAt: new Date().toISOString(), finishedAt: null }
  run(studio).catch((e: Error) => (cleanupStatus.error = e.message)).finally(() => {
    cleanupStatus.running = false
    cleanupStatus.phase = cleanupStatus.error ? 'failed' : 'done'
    cleanupStatus.finishedAt = new Date().toISOString()
  })
  return cleanupStatus
}

async function run(studio?: string) {
  const { plan: p } = await plan(studio)
  cleanupStatus.planned = p.remove.length
  cleanupStatus.kept = p.kept
  if (!p.remove.length) return
  cleanupStatus.phase = 'backup'
  const b = await whisparr.runCommand({ name: 'Backup' }, 180_000)
  if (b !== 'completed') throw new Error(`Whisparr Backup did not complete (${b}); nothing deleted`)
  await new Promise((r) => setTimeout(r, 3000)) // the backup's SQLite lock
  cleanupStatus.phase = 'deleting'
  const removed = new Set<number>()
  for (let i = 0; i < p.remove.length; i += CHUNK) {
    if (i) await new Promise((r) => setTimeout(r, PAUSE))
    const chunk = p.remove.slice(i, i + CHUNK)
    await whisparr.deleteRecords(chunk)
    for (const id of chunk) removed.add(id)
    cleanupStatus.deleted += chunk.length
  }
  if (!studio) return
  // The test: refresh that studio and count deleted scenes that came back (by StashDB id).
  cleanupStatus.phase = 'refreshing'
  const before = await whisparr.freshMovies()
  const studios = await whisparr.listStudios()
  const s = studios.find((x) => x.foreignId === studio)
  if (!s) throw new Error('studio not in Whisparr')
  const r = await whisparr.runCommand({ name: 'RefreshStudios', studioIds: [s.id] }, 300_000)
  if (r !== 'completed') throw new Error(`RefreshStudios ended ${r}`)
  const after = await whisparr.freshMovies()
  const had = new Set(before.filter((m) => m.studioForeignId === studio).map((m) => m.id))
  cleanupStatus.cameBack = after.filter((m) => m.studioForeignId === studio && !had.has(m.id)).length
}
