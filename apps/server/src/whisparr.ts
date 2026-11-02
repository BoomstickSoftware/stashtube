import type { PerformerWatch, WantedList, WantedScene, WantedState, WhisparrActivity } from '@flix/shared'
import { PINNED, VOLATILE } from './cache/memory.ts'
import { config } from './config.ts'
import { remoteImageUrl } from './remote.ts'
import { dataCache, sceneStashIdMap } from './stash.ts'
import * as stashdb from './stashdb.ts'

// Whisparr v3 (Radarr-based; scenes are "movies"). flix reads what it knows and has not
// downloaded, and writes three things besides deleting: fetch ONE scene the user clicked
// (`getScene` refuses anything but a single id), and, for the follow sync (sync.ts), a
// performer's or studio's monitoring flags and tags. The policy (decisions/whisparr-nothing-
// monitored): only followed performers are monitored, for new releases only; nothing here ever
// starts a search of a performer or studio, and no flag write touches their back catalogue.

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
// adds; flix's own writes patch the cached copy, and the 30 s activity reads show what moved
// meanwhile.
const LIST_TTL = 15 * 60_000
const ACTIVITY_TTL = 30_000 // queue and grabs move faster, and the cards show them
const GRABBED_FOR = 48 * 3_600_000 // a grab older than this with no download is treated as gone
// A Get the user pressed, until Whisparr's queue or grabs show it (or this long has passed with
// nothing: the search found no release). Kept in memory, movie id → ms; it outlives the 15 min
// list refresh and is gone after a restart, when the cards fall back to Whisparr's own states.
const REQUESTED_FOR = 60 * 60_000
export const requested = new Map<number, number>()

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

// Cached reads, all memory-only ('whisparr' lets a delete drop them all). The movie list is
// PINNED: every shelf page, the Home row and a delete read it, and the volatile cap must never
// sweep it (a long shelf session did, 2026-10-31). Queue and grabs ('whisparr:activity') are
// what a Get changes, so a Get drops only those.
const LIST = 'whisparr:list'
const ACTIVITY = 'whisparr:activity'
const cached = <T>(key: string, ttl: number, tags: string[], load: () => Promise<T>) => dataCache.get(`whisparr:${key}`, ttl, ['whisparr', ...tags], load)

// Only what flix reads of a movie (toWanted, stateOf, the shelf filters, movieForFile,
// placementFor): the cache holds this projection, about a quarter of the 41 MB answer, and far
// fewer objects; `images` is cut to the one cover toWanted picks.
export const PROJECTED = ['id', 'title', 'path', 'movieFile', 'hasFile', 'monitored', 'releaseDate', 'runtime', 'stashId', 'studioTitle', 'studioForeignId', 'performerNames', 'performerForeignIds', 'images', 'qualityProfileId', 'rootFolderPath'] as const satisfies readonly (keyof Movie)[]
export function project(m: Movie): Movie {
  const out: Partial<Movie> = {}
  for (const k of PROJECTED) if (m[k] !== undefined) (out as Record<string, unknown>)[k] = m[k]
  out.movieFile = m.movieFile ? { relativePath: m.movieFile.relativePath } : undefined
  const img = cover(m)
  out.images = img ? [{ coverType: img.coverType, remoteUrl: img.remoteUrl }] : []
  return out as Movie
}

export const movies = () => cached('movies', LIST_TTL, [LIST, PINNED], async () => (await call<Movie[]>('GET', '/movie')).map(project))
const queue = () => cached('queue', ACTIVITY_TTL, [ACTIVITY, VOLATILE], async () => (await call<Paged<QueueRecord>>('GET', '/queue?pageSize=500')).records)
const grabbed = () =>
  cached('grabbed', ACTIVITY_TTL, [ACTIVITY, VOLATILE], async () =>
    (await call<Paged<HistoryRecord>>('GET', '/history?pageSize=200&eventType=1&sortKey=date&sortDirection=descending')).records,
  )

// After a write: the cached list patched in place (no 41 MB refetch), the queue and grabs
// dropped so the new state shows within the request that follows.
function listChanged(patch: (all: Movie[]) => Movie[]) {
  dataCache.patch<Movie[]>('whisparr:movies', patch)
  dataCache.invalidate(ACTIVITY)
}

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
  listChanged((all) => all.filter((m) => m.id !== id))
}

// --- wanted scenes ---------------------------------------------------------------------

export interface Activity {
  downloading: Set<number>
  grabbedAt: Map<number, number> // movie id → ms of the latest grab
  requestedAt: Map<number, number> // movie id → ms of the Get from flix, while recent (REQUESTED_FOR)
}

export const activityOf = (q: QueueRecord[], h: HistoryRecord[], now = Date.now(), asked: Map<number, number> = requested): Activity => {
  const grabbedAt = new Map<number, number>()
  for (const r of h) {
    const t = Date.parse(r.date)
    if (now - t <= GRABBED_FOR && t > (grabbedAt.get(r.movieId) ?? 0)) grabbedAt.set(r.movieId, t)
  }
  const requestedAt = new Map<number, number>()
  for (const [id, t] of asked) {
    if (now - t > REQUESTED_FOR) asked.delete(id)
    else requestedAt.set(id, t)
  }
  return { downloading: new Set(q.map((r) => r.movieId)), grabbedAt, requestedAt }
}

// Whisparr's own evidence first (a file, the queue, a grab); "requested" only fills the gap
// between flix's Get and the grab, which the user otherwise saw as a Get button again.
export const stateOf = (m: Movie, a: Activity): WantedState =>
  m.hasFile ? 'downloaded' : a.downloading.has(m.id) ? 'downloading' : a.grabbedAt.has(m.id) ? 'grabbed' : a.requestedAt.has(m.id) ? 'requested' : 'available'

const cover = (m: Movie) => m.images?.find((i) => i.coverType === 'screenshot') ?? m.images?.find((i) => i.coverType === 'poster') ?? m.images?.[0]

export function toWanted(m: Movie, a: Activity): WantedScene {
  const img = cover(m)
  return {
    whisparrId: m.id,
    stashdbId: m.stashId ?? null,
    title: m.title,
    date: m.releaseDate ? m.releaseDate.slice(0, 10) : null,
    studio: m.studioTitle || null,
    performers: m.performerNames ?? [],
    image: remoteImageUrl(img?.remoteUrl), // through /media/remote, never hotlinked
    runtime: m.runtime || null,
    state: stateOf(m, a),
  }
}

const byDateDesc = (a: Movie, b: Movie) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '')

export async function activity(): Promise<Activity> {
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
  listChanged((all) => all.map((x) => (x.id === id ? { ...x, monitored: true } : x)))
  requested.set(id, Date.now())
  const a = await activity()
  return toWanted({ ...m, monitored: true }, a) // 'requested' until the queue or a grab shows it
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
    cached('qualityprofile', LIST_TTL, [LIST, VOLATILE], () => call<{ id: number }[]>('GET', '/qualityprofile')),
    cached('rootfolder', LIST_TTL, [LIST, VOLATILE], () => call<{ path: string }[]>('GET', '/rootfolder')),
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
  listChanged((all) => [...all.filter((m) => m.id !== added.id), project(added)])
  requested.set(added.id, Date.now())
  const a = await activity()
  return toWanted(added, a)
}

// --- the follow sync's reads and writes (sync.ts) -------------------------------------------

export interface WPerformer {
  id: number
  fullName: string
  foreignId: string // StashDB uuid
  monitored: boolean
  whisparrMonitorNewItems: boolean
  tags: number[]
}
export interface WStudio {
  id: number
  title: string
  foreignId: string
  monitored: boolean
  whisparrMonitorNewItems: boolean
  tags: number[]
}

// ~5,300 performers (2026-11-02); cached briefly for the performer page's watch line, dropped
// by every sync write.
const PEOPLE_TTL = 5 * 60_000
export const listPerformers = () => cached('performers', PEOPLE_TTL, ['whisparr:people'], async () => (await call<WPerformer[]>('GET', '/performer')).map(({ id, fullName, foreignId, monitored, whisparrMonitorNewItems, tags }) => ({ id, fullName, foreignId, monitored, whisparrMonitorNewItems, tags: tags ?? [] })))
export const listStudios = () => cached('studios', PEOPLE_TTL, ['whisparr:people'], async () => (await call<WStudio[]>('GET', '/studio')).map(({ id, title, foreignId, monitored, whisparrMonitorNewItems, tags }) => ({ id, title, foreignId, monitored, whisparrMonitorNewItems, tags: tags ?? [] })))
export const listTags = () => call<{ id: number; label: string }[]>('GET', '/tag')
export const createTag = (label: string) => call<{ id: number; label: string }>('POST', '/tag', { label })

// Change only these fields of one performer or studio: GET the whole object, set them, PUT it
// back (Whisparr's PUT replaces). No command, so no search.
type Flags = Partial<Pick<WPerformer, 'monitored' | 'whisparrMonitorNewItems' | 'tags'>>
export async function patchPerformer(id: number, flags: Flags) {
  const o = await call<Record<string, unknown>>('GET', `/performer/${id}`)
  await call('PUT', `/performer/${id}`, { ...o, ...flags })
  dataCache.invalidate('whisparr:people')
}
export async function patchStudio(id: number, flags: Flags) {
  const o = await call<Record<string, unknown>>('GET', `/studio/${id}`)
  await call('PUT', `/studio/${id}`, { ...o, ...flags })
  dataCache.invalidate('whisparr:people')
}

// The performer page's line: is Whisparr watching them, because of flix, and is anything of
// theirs downloading.
export async function performerWatch(stashdbIds: string[], tagId: number | null): Promise<PerformerWatch> {
  const none = { watching: false, managed: false, downloading: 0 }
  if (!config.whisparr || !stashdbIds.length) return none
  const ids = new Set(stashdbIds)
  const [people, all, a] = await Promise.all([listPerformers(), movies(), activity()])
  const p = people.find((x) => ids.has(x.foreignId))
  if (!p) return none
  const busy = new Set([...a.downloading, ...a.grabbedAt.keys()])
  const downloading = all.filter((m) => busy.has(m.id) && !m.hasFile && m.performerForeignIds?.some((f) => ids.has(f))).length
  return { watching: p.monitored && p.whisparrMonitorNewItems, managed: tagId !== null && p.tags.includes(tagId), downloading }
}

// Unmonitor these scenes (the follow sync's trim), in chunks; no command, so no search. The
// cached list is patched rather than refetched (it is ~40 MB).
export async function unmonitorMovies(ids: number[]) {
  for (let i = 0; i < ids.length; i += 500) await call('PUT', '/movie/editor', { movieIds: ids.slice(i, i + 500), monitored: false })
  const gone = new Set(ids)
  dataCache.patch<Movie[]>('whisparr:movies', (list) => list.map((m) => (gone.has(m.id) ? { ...m, monitored: false } : m)))
}
