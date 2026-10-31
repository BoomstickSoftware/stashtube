import type { WantedList, WantedScene, WantedState, WhisparrActivity } from '@flix/shared'
import { VOLATILE } from './cache/memory.ts'
import { config } from './config.ts'
import { dataCache, sceneStashIdMap } from './stash.ts'
import * as stashdb from './stashdb.ts'

// Whisparr v3 (Radarr-based; scenes are "movies"). flix reads what it knows and has not
// downloaded, and does exactly one kind of write besides deleting: fetch ONE scene the user
// clicked. The library policy (nas repo, "Media library policy" 4 and known-issues #40) is that
// nothing is monitored and downloads are chosen by hand, so there is deliberately no way here
// to monitor or search a studio or a performer, and `getScene` refuses anything but a single id.

export interface Movie {
  id: number
  title: string
  path: string
  movieFile?: { relativePath: string }
  hasFile?: boolean
  monitored?: boolean
  itemType?: 'scene' | 'movie'
  releaseDate?: string | null
  runtime?: number
  stashId?: string | null
  studioTitle?: string | null
  studioForeignId?: string | null
  performerNames?: string[]
  performerForeignIds?: string[]
  images?: { coverType: string; url?: string; remoteUrl?: string }[]
  qualityProfileId?: number
  rootFolderPath?: string
}

interface QueueRecord {
  movieId: number
  trackedDownloadState?: string
  status?: string
}
interface HistoryRecord {
  movieId: number
  date: string
  eventType: string
}
interface Paged<T> {
  records: T[]
}

const TIMEOUT = 60_000 // ms
// The movie list is ~41 MB (13,079 entries, 2026-10-31) and changes only when Whisparr imports or
// adds; flix's own writes drop it, and the 30 s activity reads show what moved meanwhile.
const LIST_TTL = 15 * 60_000
const ACTIVITY_TTL = 30_000 // queue and grabs move faster, and the cards show them
const GRABBED_FOR = 48 * 3_600_000 // a grab older than this with no download is treated as gone

async function call<T>(method: 'GET' | 'DELETE' | 'PUT' | 'POST', path: string, body?: unknown): Promise<T> {
  const w = config.whisparr
  if (!w) throw new Error('Whisparr is not configured')
  const res = await fetch(`${w.url}/api/v3${path}`, {
    method,
    headers: { 'X-Api-Key': w.apiKey, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch((e: Error) => {
    throw new Error(e.name === 'TimeoutError' ? `Whisparr: no answer in ${TIMEOUT / 1000} s` : `Whisparr: ${e.message}`)
  })
  if (!res.ok) throw new Error(`Whisparr HTTP ${res.status} on ${method} ${path.split('?')[0]}`)
  return (method === 'DELETE' ? undefined : await res.json()) as T
}

// Cached reads. VOLATILE keeps the 41 MB list out of the on-disk cache; 'whisparr' lets a
// write drop them all.
const cached = <T>(key: string, ttl: number, load: () => Promise<T>) => dataCache.get(`whisparr:${key}`, ttl, ['whisparr', VOLATILE], load)

export const movies = () => cached('movies', LIST_TTL, () => call<Movie[]>('GET', '/movie'))
const queue = () => cached('queue', ACTIVITY_TTL, async () => (await call<Paged<QueueRecord>>('GET', '/queue?pageSize=500')).records)
const grabbed = () =>
  cached('grabbed', ACTIVITY_TTL, async () => (await call<Paged<HistoryRecord>>('GET', '/history?pageSize=200&eventType=1&sortKey=date&sortDirection=descending')).records)

// --- the delete flow -------------------------------------------------------------------

function toWhisparrPath(stashPath: string): string {
  for (const [from, to] of config.whisparr?.pathMap ?? []) {
    if (stashPath.startsWith(`${from}/`)) return to + stashPath.slice(from.length)
  }
  return stashPath
}

const fileOf = (m: Movie) => (m.movieFile ? `${m.path.replace(/\/$/, '')}/${m.movieFile.relativePath}` : null)

const UUID = /\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi

// The Whisparr entry whose file is exactly this one. Looked up by StashDB scene id (Stash's
// link, or the [uuid] Whisparr puts in the folder name); feature films resolve by TMDB and
// carry neither, so they fall back to the full list.
export async function movieForFile(stashPath: string, stashIds: string[]): Promise<Movie | null> {
  const want = toWhisparrPath(stashPath)
  const ids = new Set(stashIds)
  for (const m of stashPath.matchAll(UUID)) ids.add(m[1]!.toLowerCase())
  for (const id of ids) {
    const hit = (await call<Movie[]>('GET', `/movie?stashId=${encodeURIComponent(id)}`)).find((m) => fileOf(m) === want)
    if (hit) return hit
  }
  return (await movies()).find((m) => fileOf(m) === want) ?? null
}

// Deletes the entry with its folder and files, and adds an import exclusion so no search
// grabs it again.
export async function deleteMovie(id: number) {
  await call('DELETE', `/movie/${id}?deleteFiles=true&addImportExclusion=true`)
  dataCache.invalidate('whisparr')
}

// --- wanted scenes ---------------------------------------------------------------------

export interface Activity {
  downloading: Set<number>
  grabbedAt: Map<number, number> // movie id → ms of the latest grab
}

export const activityOf = (q: QueueRecord[], h: HistoryRecord[], now = Date.now()): Activity => {
  const grabbedAt = new Map<number, number>()
  for (const r of h) {
    const t = Date.parse(r.date)
    if (now - t <= GRABBED_FOR && t > (grabbedAt.get(r.movieId) ?? 0)) grabbedAt.set(r.movieId, t)
  }
  return { downloading: new Set(q.map((r) => r.movieId)), grabbedAt }
}

export const stateOf = (m: Movie, a: Activity): WantedState =>
  m.hasFile ? 'downloaded' : a.downloading.has(m.id) ? 'downloading' : a.grabbedAt.has(m.id) ? 'grabbed' : 'available'

export function toWanted(m: Movie, a: Activity): WantedScene {
  const img = m.images?.find((i) => i.coverType === 'screenshot') ?? m.images?.find((i) => i.coverType === 'poster') ?? m.images?.[0]
  return {
    whisparrId: m.id,
    stashdbId: m.stashId ?? null,
    title: m.title,
    date: m.releaseDate ? m.releaseDate.slice(0, 10) : null,
    studio: m.studioTitle || null,
    performers: m.performerNames ?? [],
    image: img?.remoteUrl || null,
    runtime: m.runtime || null,
    state: stateOf(m, a),
  }
}

const byDateDesc = (a: Movie, b: Movie) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '')

async function activity(): Promise<Activity> {
  const [q, h] = await Promise.all([queue(), grabbed()])
  return activityOf(q, h)
}

// Scenes Whisparr lists for a performer or studio (by StashDB id) that have no file, newest
// release first. Either side may carry several StashDB ids (duplicates merged on StashDB).
export async function wantedInWhisparr(by: { performers?: string[]; studios?: string[] }, limit = 60): Promise<WantedScene[]> {
  if (!config.whisparr) return []
  const perf = new Set(by.performers ?? [])
  const stud = new Set(by.studios ?? [])
  if (!perf.size && !stud.size) return []
  const [all, a] = await Promise.all([movies(), activity()])
  return all
    .filter((m) => !m.hasFile && (m.performerForeignIds?.some((id) => perf.has(id)) || (m.studioForeignId ? stud.has(m.studioForeignId) : false)))
    .sort(byDateDesc)
    .slice(0, limit)
    .map((m) => toWanted(m, a))
}

// One page of StashDB's catalogue for the performer or studio, each scene labelled by where it
// is: already in Stash (dropped: the shelf is what is missing), in Whisparr (its download
// state), or only on StashDB (`remote`). Falls back to Whisparr's own list when StashDB is not
// configured or does not answer.
export async function wanted(by: { performers?: string[]; studios?: string[] }, page = 1): Promise<WantedList> {
  if (!config.whisparr) return { source: 'whisparr', items: [], page, hasMore: false }
  if (!(await stashdb.available())) return { source: 'whisparr', items: await wantedInWhisparr(by), page, hasMore: false }
  try {
    const [sdb, all, a, inStash] = await Promise.all([stashdb.scenesOf(by, page), movies(), activity(), sceneStashIdMap()])
    const byStashId = new Map<string, Movie>()
    for (const m of all) if (m.stashId) byStashId.set(m.stashId, m)
    return { source: 'stashdb', items: mergeRemote(sdb.scenes, byStashId, a, inStash), page, hasMore: sdb.hasMore }
  } catch (e) {
    console.error('stashdb:', (e as Error).message)
    return { source: 'whisparr', items: await wantedInWhisparr(by), page, hasMore: false }
  }
}

export function mergeRemote(scenes: stashdb.SdbScene[], byStashId: Map<string, Movie>, a: Activity, inStash: Map<string, string>): WantedScene[] {
  const out: WantedScene[] = []
  for (const s of scenes) {
    if (inStash.has(s.id)) continue
    const m = byStashId.get(s.id)
    out.push(m ? toWanted(m, a) : stashdb.toRemote(s))
  }
  return out
}

// Recent releases (last `days`) from these performers that are not downloaded: the Home row.
export async function recentWanted(performers: string[], days = 60, limit = 24): Promise<WantedScene[]> {
  if (!config.whisparr || !performers.length) return []
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const perf = new Set(performers)
  const [all, a] = await Promise.all([movies(), activity()])
  return all
    .filter((m) => !m.hasFile && (m.releaseDate ?? '') >= since && m.performerForeignIds?.some((id) => perf.has(id)))
    .sort(byDateDesc)
    .slice(0, limit)
    .map((m) => toWanted(m, a))
}

// What is moving right now: Whisparr's queue, and grabs of the last two days that have not
// reached the queue (or have left it without a file yet).
export async function currentActivity(): Promise<WhisparrActivity> {
  if (!config.whisparr) return { downloading: [], grabbed: [] }
  const [all, a] = await Promise.all([movies(), activity()])
  const byId = new Map(all.map((m) => [m.id, m]))
  const pick = (ids: Iterable<number>) =>
    [...ids]
      .map((id) => byId.get(id))
      .filter((m): m is Movie => !!m && !m.hasFile)
      .map((m) => toWanted(m, a))
  return {
    downloading: pick(a.downloading),
    grabbed: pick([...a.grabbedAt.keys()].filter((id) => !a.downloading.has(id))),
  }
}

// The one write: monitor this scene and search for it. One positive integer id, nothing else;
// a studio- or performer-wide search is what the policy forbids and what known-issues #40 cost.
export function assertSingleId(id: unknown): number {
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) throw new RangeError('one Whisparr scene id is required')
  return id
}

export async function getScene(whisparrId: unknown): Promise<WantedScene> {
  const id = assertSingleId(whisparrId)
  const m = await call<Movie>('GET', `/movie/${id}`)
  if (m.itemType && m.itemType !== 'scene') throw new RangeError('only scenes can be fetched from flix')
  if (!m.monitored) await call('PUT', `/movie/${id}`, { ...m, monitored: true })
  await call('POST', '/command', { name: 'MoviesSearch', movieIds: [id] })
  dataCache.invalidate('whisparr')
  const a = await activity()
  return { ...toWanted(m, a), state: m.hasFile ? 'downloaded' : 'grabbed' }
}

interface Lookup extends Movie {
  qualityProfileId?: number
  rootFolderPath?: string
}

// Where a new scene goes: the profile and root folder of a Whisparr scene from the same studio,
// else Whisparr's first quality profile and root folder.
async function placementFor(studioForeignId: string | null | undefined): Promise<{ qualityProfileId: number; rootFolderPath: string }> {
  const all = await movies()
  const sibling = (studioForeignId && all.find((m) => m.studioForeignId === studioForeignId && m.qualityProfileId && m.rootFolderPath)) || all.find((m) => m.qualityProfileId && m.rootFolderPath)
  if (sibling) return { qualityProfileId: sibling.qualityProfileId!, rootFolderPath: sibling.rootFolderPath! }
  const [profiles, roots] = await Promise.all([
    cached('qualityprofile', LIST_TTL, () => call<{ id: number }[]>('GET', '/qualityprofile')),
    cached('rootfolder', LIST_TTL, () => call<{ path: string }[]>('GET', '/rootfolder')),
  ])
  if (!profiles[0] || !roots[0]) throw new Error('Whisparr has no quality profile or root folder to add a scene to')
  return { qualityProfileId: profiles[0].id, rootFolderPath: roots[0].path }
}

// The other write, for a scene only StashDB knows: look it up in Whisparr by StashDB id and add
// that ONE scene, monitored, with a search. One uuid, one lookup, one POST; a scene Whisparr
// already has goes through getScene instead, so nothing is ever added twice.
export async function getRemote(stashdbId: unknown): Promise<WantedScene> {
  if (!stashdb.isStashDbId(stashdbId)) throw new RangeError('one StashDB scene id is required')
  const found = await call<Lookup[]>('GET', `/movie/lookup?term=${encodeURIComponent(`stash:${stashdbId}`)}`)
  const hit = found.find((m) => m.stashId?.toLowerCase() === stashdbId.toLowerCase()) ?? found[0]
  if (!hit) throw new RangeError('Whisparr does not know this scene')
  if (hit.itemType && hit.itemType !== 'scene') throw new RangeError('only scenes can be fetched from flix')
  if (hit.id > 0) return getScene(hit.id)
  const placement = await placementFor(hit.studioForeignId)
  const added = await call<Movie>('POST', '/movie', {
    ...hit,
    ...placement,
    monitored: true,
    addOptions: { searchForMovie: true, monitor: 'movieOnly' },
  })
  dataCache.invalidate('whisparr')
  const a = await activity()
  return { ...toWanted(added, a), state: 'grabbed' }
}
