// Stash GraphQL client and the mapping from Stash shapes to the flix API contract.
// Everything Stash-specific stays in this file.
import type {
  DuplicateScene,
  HistoryEntry,
  JobStatus,
  PerformerCard,
  PerformerDetail,
  Ref,
  SceneCard,
  SceneDetail,
  SceneQuery,
  Stats,
  StudioCard,
  StudioDetail,
  TagCard,
  TagDetail,
  TagTile, SceneFacets, Marker } from '@flix/shared'
import { MemoryCache, PINNED, VOLATILE } from './cache/memory.ts'
import { config } from './config.ts'
import { signScene } from './signing.ts'
// Generated from stash.schema.graphql (Stash's own schema; see codegen.ts). Filter inputs are
// exact: a criterion Stash does not have is a type error here instead of a 400 from Stash.
import type {
  DateCriterionInput,
  FindFilterType,
  FindPerformersResultType,
  FindScenesResultType,
  FindStudiosResultType,
  FindTagsResultType,
  GenderCriterionInput,
  IdentifyFieldOptionsInput,
  Mutation,
  Performer,
  PerformerFilterType,
  Query,
  ResolutionEnum,
  Scene,
  SceneFilterType,
  SceneMarker,
  SceneMarkerCreateInput,
  SceneMarkerUpdateInput,
  SceneUpdateInput,
  Studio,
  StudioFilterType,
  Tag,
  TagFilterType,
  VideoFile,
} from './stash.schema.ts'

export type { FindFilterType, GenderCriterionInput, PerformerFilterType, SceneFilterType } from './stash.schema.ts'

export class StashError extends Error {}

// Every request flix makes to Stash, by kind, since start: the load the caches did not absorb.
export const upstream = { queries: 0, mutations: 0, assets: 0, streams: 0, changeChecks: 0 }

export const dataCache = new MemoryCache({
  maxEntries: config.cache.dataMaxEntries,
  staleFor: config.cache.dataStaleFor,
  // The per-filter facet working sets share this cap (30 let a long shelf session evict the
  // facets, 2026-10-31); the sets every page leans on (the unfiltered facets, the tiles,
  // sceneStashIdMap, Whisparr's list) are PINNED and never swept.
  maxVolatile: 60,
})

// The finished home feed (api.ts homeRows), one entry per visit seed: dropped by a pinned-row,
// settings or blocklist write, left stale by what its rows carry.
export const HOME = 'home-rows'
export const HOME_TTL = 5 * 60_000

const TIMEOUT = 60_000 // ms; a hung Stash request must not hold a page (or a shared in-flight read) forever

// Uncached; use query() for reads and mutate() for writes.
async function gql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  kind: 'queries' | 'mutations' | 'changeChecks' = query.trimStart().startsWith('mutation') ? 'mutations' : 'queries',
): Promise<T> {
  // Stash's SQLite is locked while a scan or identify job writes; reads fail with
  // "database is locked" until it lets go. Retry briefly rather than fail the page.
  for (let attempt = 0; ; attempt++) {
    upstream[kind]++
    const res = await fetch(`${config.stashUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ApiKey: config.stashApiKey },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT),
    }).catch((e: Error) => {
      throw e.name === 'TimeoutError' ? new StashError(`no answer in ${TIMEOUT / 1000} s`) : e
    })
    if (!res.ok) throw new StashError(`Stash HTTP ${res.status}: ${await errorDetail(res)}`)
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] }
    if (!body.errors?.length) return body.data as T
    const message = body.errors.map((e) => e.message).join('; ')
    if (!/database is locked/.test(message) || attempt >= LOCK_RETRIES.length) throw new StashError(message)
    await new Promise((r) => setTimeout(r, LOCK_RETRIES[attempt]))
  }
}

const LOCK_RETRIES = [250, 500, 1000, 2000] // ms between attempts

// What Stash said with a non-2xx answer. A rejected query (an unknown criterion, a wrong
// variable type) comes back as 400 or 422 with GraphQL errors in the body; a bare status
// would hide which query was wrong.
async function errorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const body = JSON.parse(text) as { errors?: { message: string }[] }
    if (body.errors?.length) return body.errors.map((e) => e.message).join('; ')
  } catch {
    // not JSON; fall through to the raw text
  }
  return text.slice(0, 200)
}

// Stash's performer, studio and tag filters have no id criterion (v0.31.1's schema; see
// stash.test.ts), so blocked ids are dropped from each page after the fact. Blocked lists are
// short and pages small; `total` still counts blocked items that fell on other pages.
function dropBlocked<T extends { id: string }>(r: { total: number; items: T[] }, blocked: string[]) {
  if (!blocked.length) return r
  const items = r.items.filter((x) => !blocked.includes(x.id))
  return { total: r.total - (r.items.length - items.length), items }
}

// Cached read. Tags name what a write must drop: 'scene' for anything showing scene data,
// 'scene:<id>' for one scene; same for performer, studio, tag. 'activity:play' and
// 'activity:resume' mark results that depend on play counts or resume points.
function query<T>(q: string, variables: Record<string, unknown>, tags: string[], ttl = config.cache.dataTtl): Promise<T> {
  return dataCache.get(JSON.stringify([q, variables]), ttl, tags, () => gql<T>(q, variables))
}

// A computed answer (facets, tiles) cached over cached reads: its loader's reads wait for
// their refresh instead of being served stale (memory.ts `freshInputs`). Not VOLATILE: the
// answers are small and go into the snapshot, so a restart answers them without Stash.
function computed<T>(key: unknown[], tags: string[], load: () => Promise<T>, ttl = config.cache.dataTtl): Promise<T> {
  return dataCache.get(JSON.stringify(key), ttl, tags, load, { freshInputs: true })
}

// Derive something (a lookup Map) from a cached answer once per answer: a cache hit hands back the
// same object, so the derived value is reused until the answer is refetched.
export function memoBy<K extends object, V>(fn: (k: K) => V): (k: K) => V {
  const seen = new WeakMap<K, V>()
  return (k) => {
    let v = seen.get(k)
    if (v === undefined) seen.set(k, (v = fn(k)))
    return v
  }
}

// Write, then drop the cached results it changes. `expires` names results that it changes
// only slightly (a progress bar on a card): they stay, served once more while they refresh.
async function mutate<T = unknown>(q: string, variables: Record<string, unknown>, invalidates: string[], expires: string[] = []) {
  const d = await gql<T>(q, variables)
  if (invalidates.length) dataCache.invalidate(...invalidates) // none given must not mean "everything"

  if (expires.length) dataCache.expire(...expires)
  // anything that can move a Featured score leaves the pool stale, served while it refreshes
  if ([...invalidates, ...expires].some((t) => t.startsWith('scene') || t.startsWith('activity'))) dataCache.expire(POOL)
  return d
}

// Which activity tags a scene query needs, from the fields its filter or sort reads.
function activityTags(...parts: unknown[]): string[] {
  const s = JSON.stringify(parts)
  const tags: string[] = []
  if (/play_count|last_played|play_duration/.test(s)) tags.push('activity:play')
  if (/resume_time/.test(s)) tags.push('activity:resume')
  return tags
}

// Uncached health probe.
export const stashVersion = () => gql<Pick<Query, 'version'>>('{ version { version } }')

// Random-sort seed that changes once a day: shuffled lists page stably within a day and
// re-shuffle the next, instead of being frozen forever by a constant.
export const daySeed = () => Math.floor(Date.now() / 86_400_000)

// GET a Stash path with the API key. Used by the asset cache and the media proxy.
export function stashFetch(path: string, headers: Record<string, string>, signal?: AbortSignal) {
  if (/\/stream/.test(path)) upstream.streams++
  else upstream.assets++
  return fetch(`${config.stashUrl}${path}`, { headers: { ...headers, ApiKey: config.stashApiKey }, signal })
}

// --- change detection ---------------------------------------------------------------
// Scans, Identify and edits in Stash's own UI bump counts or updated_at. One small query
// per poll, only while flix is in use, marks the query cache stale when anything moved:
// pages keep loading instantly from the old results while they refresh.
// (Play activity does not bump updated_at; flix's own writes invalidate directly.)

let lastFingerprint: string | null = null
let lastActivity = 0
let lastCheck = 0
const IDLE_AFTER = 10 * 60_000

// Decides when the listeners (the re-warm of the home feed, facets and tiles) run after the
// fingerprint moved. The cache is expired on the spot, but a scan or an import moves the
// fingerprint on every poll, and warming ~20 queries a minute against a locked database only
// competes with the user: wait until it has held still for `stablePolls` polls in a row, and
// never warm more than once per `minGap` ms. Exported for tests.
export class WarmDebounce {
  private stablePolls: number
  private minGap: number
  private pending = false
  private stable = 0
  private lastWarm = -Infinity // the gap applies only after a warm has run

  constructor(opts: { stablePolls: number; minGap: number }) {
    this.stablePolls = opts.stablePolls
    this.minGap = opts.minGap
  }

  // Called once per poll with whether the fingerprint moved; true when it is time to warm.
  poll(changed: boolean, now = Date.now()): boolean {
    if (changed) {
      this.pending = true
      this.stable = 0
      return false
    }
    if (!this.pending) return false
    this.stable++
    if (this.stable < this.stablePolls || now - this.lastWarm < this.minGap) return false
    this.pending = false
    this.lastWarm = now
    return true
  }
}

const warmDebounce = new WarmDebounce({ stablePolls: 2, minGap: 5 * 60_000 })

async function fingerprint(): Promise<string> {
  const d = await gql<{ s: FindScenesResultType; p: FindPerformersResultType; st: FindStudiosResultType; t: FindTagsResultType }>(`{
    s: findScenes(filter: { per_page: 1, sort: "updated_at", direction: DESC }) { count scenes { updated_at } }
    p: findPerformers(filter: { per_page: 1, sort: "updated_at", direction: DESC }) { count performers { updated_at } }
    st: findStudios(filter: { per_page: 1, sort: "updated_at", direction: DESC }) { count studios { updated_at } }
    t: findTags(filter: { per_page: 1, sort: "updated_at", direction: DESC }) { count tags { updated_at } }
  }`, {}, 'changeChecks')
  const fp = JSON.stringify([
    d.s.count, d.s.scenes[0]?.updated_at,
    d.p.count, d.p.performers[0]?.updated_at,
    d.st.count, d.st.studios[0]?.updated_at,
    d.t.count, d.t.tags[0]?.updated_at,
  ])
  return fp
}

async function checkForChanges() {
  lastCheck = Date.now()
  const fp = await fingerprint()
  const changed = lastFingerprint !== null && fp !== lastFingerprint
  if (changed) {
    console.log('stash data changed; refreshing cached queries')
    dataCache.expire()
  }
  if (warmDebounce.poll(changed)) {
    console.log('stash data settled; re-warming')
    for (const fn of changeListeners) fn()
  }
  lastFingerprint = fp
}

// After flix's own bulk writes (the Cast sync), take Stash's new fingerprint as the baseline, so
// those writes are not seen as an outside change that expires everything and re-warms again.
// The cache entries they affect were already expired by the writes themselves.
export async function acceptOwnChanges() {
  if (lastFingerprint !== null) lastFingerprint = await fingerprint()
}

const changeListeners: (() => void)[] = []
// Runs once Stash has settled after a change that marked the cache stale (two unchanged polls
// in a row, at most every 5 min), e.g. to re-warm the home feed.
export function onStashChange(fn: () => void) {
  changeListeners.push(fn)
}

// Whether flix answered an API request in the last `ms` (background jobs pace themselves by it).
export const activeWithin = (ms: number) => Date.now() - lastActivity < ms

// Call on every API request. After an idle spell, check before trusting cached data.
export function noteActivity() {
  const now = Date.now()
  const wasIdle = now - lastActivity > IDLE_AFTER
  lastActivity = now
  if (config.cache.pollInterval && wasIdle && now - lastCheck > config.cache.pollInterval) {
    checkForChanges().catch((e) => console.error('change check:', e.message))
  }
}

export function startChangeDetection() {
  if (!config.cache.pollInterval) return
  setInterval(() => {
    if (Date.now() - lastActivity < IDLE_AFTER) checkForChanges().catch((e) => console.error('change check:', e.message))
  }, config.cache.pollInterval).unref()
}

// Stash returns absolute URLs to itself, some carrying the API key. The browser gets
// the same path under /media/stash, which the BFF proxies with the key attached.
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const u = new URL(url, config.stashUrl)
  u.searchParams.delete('apikey')
  return `/media/stash${u.pathname}${u.search}`
}

const stars = (r: number | null | undefined) => (r == null ? null : r / 20)
export const rating100 = (s: number | null) => (s == null || s <= 0 ? null : Math.round(s * 20))

// --- fragments ------------------------------------------------------------------

// A card's performers carry no image: no card renders one (a quarter of a list's raw bytes,
// 2026-10-31); the scene page's avatars come from SCENE_DETAIL, which selects it.
const SCENE_CARD = `
  id title date created_at rating100 play_count o_counter resume_time last_played_at
  files { path duration width height size }
  paths { screenshot preview vtt }
  studio { id name image_path }
  performers { id name }
`

const SCENE_DETAIL = `
  ${SCENE_CARD}
  details code director urls
  performers { image_path gender }
  studio { parent_studio { id } }
  tags { id name }
  files { size format video_codec audio_codec bit_rate frame_rate }
  scene_markers { id seconds end_seconds title primary_tag { id name } }
`

const PERFORMER_CARD = `id name image_path scene_count favorite rating100 gender country`
// depth -1: a network counts its studios' videos
const STUDIO_CARD = `id name image_path scene_count(depth: -1) favorite parent_studio { id name }`
const TAG_CARD = `id name scene_count favorite`

// --- mappers --------------------------------------------------------------------

// The mappers take Stash's object types whole, but each query selects only the fields its
// fragment names: a field the fragment leaves out is `undefined` at runtime whatever the type
// says. Hence the `?? 0` / `|| null` defaults, and new fields go into the fragment first.
const file = (s: Pick<Scene, 'files'>) => s.files?.[0] as VideoFile | undefined

const ref = (r: Pick<Performer | Studio, 'id' | 'name' | 'image_path'>): Ref => ({
  id: r.id,
  name: r.name,
  image: mediaUrl(r.image_path),
})

function sceneTitle(s: Pick<Scene, 'id' | 'title' | 'files'>): string {
  if (s.title) return s.title
  const path = file(s)?.path
  return path ? path.split('/').pop()!.replace(/\.[^.]+$/, '') : `Scene ${s.id}`
}

export function toSceneCard(s: Scene): SceneCard {
  const f = file(s)
  return {
    id: s.id,
    title: sceneTitle(s),
    date: s.date ?? null,
    durationSec: f?.duration ?? 0,
    width: f?.width ?? 0,
    height: f?.height ?? 0,
    size: f?.size ?? 0,
    rating: stars(s.rating100),
    playCount: s.play_count ?? 0,
    oCount: s.o_counter ?? 0,
    resumeTime: s.resume_time ?? 0,
    lastPlayedAt: s.last_played_at ?? null,
    createdAt: s.created_at,
    studio: s.studio ? ref(s.studio) : null,
    performers: (s.performers ?? []).map((p) => ({ id: p.id, name: p.name })),
    screenshot: mediaUrl(s.paths?.screenshot)!,
    preview: mediaUrl(s.paths?.preview),
    vtt: mediaUrl(s.paths?.vtt),
  }
}

function toSceneDetail(s: Scene): Omit<SceneDetail, 'hidden' | 'unlisted' | 'unlistedVia' | 'cast'> {
  const markers = (s.scene_markers ?? []).map(toMarker).sort((a, b) => a.seconds - b.seconds)
  const f = file(s)
  return {
    ...toSceneCard(s),
    performers: (s.performers ?? []).map((p) => ref(p)), // with avatars
    details: s.details || null,
    code: s.code || null,
    director: s.director || null,
    urls: s.urls ?? [],
    tags: (s.tags ?? []).map((t) => ({ id: t.id, name: t.name })),
    file: f
      ? {
          path: f.path,
          size: f.size,
          container: f.format,
          videoCodec: f.video_codec,
          audioCodec: f.audio_codec,
          bitrate: f.bit_rate,
          framerate: f.frame_rate,
        }
      : null,
    markers,
    playback: {
      direct: `${config.mediaOrigin}/media/play/${s.id}?st=${signScene(s.id)}`,
      hls: `${config.mediaOrigin}/media/stash/scene/${s.id}/stream.m3u8?resolution=ORIGINAL&st=${signScene(s.id)}`,
      container: f?.format ?? '',
      videoCodec: f?.video_codec ?? '',
      audioCodec: f?.audio_codec ?? '',
    },
  }
}

export const toPerformerCard = (p: Performer): PerformerCard => ({
  id: p.id,
  name: p.name,
  image: mediaUrl(p.image_path),
  sceneCount: p.scene_count ?? 0,
  favorite: !!p.favorite,
  rating: stars(p.rating100),
  gender: p.gender ?? null,
  country: p.country || null,
})

export const toStudioCard = (s: Studio): StudioCard => ({
  id: s.id,
  name: s.name,
  image: mediaUrl(s.image_path),
  sceneCount: s.scene_count ?? 0,
  favorite: !!s.favorite,
  parent: s.parent_studio ? { id: s.parent_studio.id, name: s.parent_studio.name } : null,
})

export const toTagCard = (t: Tag): TagCard => ({
  id: t.id,
  name: t.name,
  sceneCount: t.scene_count ?? 0,
  favorite: !!t.favorite,
})

// --- filters --------------------------------------------------------------------

export interface Exclusions {
  tags: string[]
  performers: string[]
  studios: string[]
  people?: People
  unlisted?: UnlistedSets // Unlisted categories (with the hand-unlist tag), performers, studios (unlisted.ts)
  holdUnlisted?: boolean // leave Unlisted videos out (views flix assembles: unlisted.ts curated())
}

export interface UnlistedSets {
  tags: string[]
  performers: string[]
  studios: string[]
}

// Performer attributes a scene must have: one performer (of `gender`, when one is given; the
// Settings gender switch no longer feeds it, decisions/gender-switch-performers-page-only)
// matching the age at filming and any of the ethnicities. `firstYear` is the earliest scene date.
export interface People {
  gender?: GenderCriterionInput | null
  firstYear: number
  minAge?: number
  maxAge?: number
  ethnicities?: string[]
}

// Joins filters with OR (Stash nests them: a OR (b OR (c …))).
function anyOf<F extends { OR?: F | null }>(filters: F[]): F | null {
  if (!filters.length) return null
  return filters.reduceRight<F | null>((rest, f) => (rest ? { ...f, OR: rest } : f), null)
}

// The scene-level criterion for `People`, or null. Stash has no "age at filming" per performer,
// so scenes are matched in release-date buckets: a scene released around date D has a performer
// aged A..B if they were born between D-(B+1)y and D-Ay, with D the middle of the bucket. One
// bucket per year (right to about six months), wider if the library spans more than
// MAX_BUCKETS years: SQLite's parser overflows on long OR chains (36 failed, 18 worked).
// Contains OR, so it goes last in an AND chain.
const MAX_BUCKETS = 16

// The people criterion as the alternatives its OR chain joins (each a plain set of criteria), so
// the Vault's own alternatives can be multiplied in; `maxBuckets` keeps the product under MAX_OR.
function peopleAlternatives(p: People | undefined, maxBuckets = MAX_BUCKETS): SceneFilterType[] {
  if (!p || (!p.minAge && !p.maxAge && !p.ethnicities?.length)) return []
  const base: PerformerFilterType = p.gender ? { gender: p.gender } : {}
  const who: PerformerFilterType[] = p.ethnicities?.length ? p.ethnicities.map((e) => ({ ...base, ethnicity: { value: e, modifier: 'EQUALS' } })) : [base]
  if (!p.minAge && !p.maxAge) return [{ performers_filter: anyOf(who) }]
  const last = new Date().getFullYear()
  const step = Math.max(1, Math.ceil((last - p.firstYear + 1) / maxBuckets))
  const buckets: SceneFilterType[] = []
  for (let y = p.firstYear; y <= last; y += step) {
    const end = y + step - 1
    const mid = (y + end + 1) / 2 // in years; .5 is July 1
    const at = (years: number) => `${Math.floor(years)}-${years % 1 ? '07' : '01'}-01`
    const born: DateCriterionInput =
      p.minAge && p.maxAge
        ? { value: at(mid - p.maxAge - 1), value2: at(mid - p.minAge), modifier: 'BETWEEN' }
        : p.maxAge
          ? { value: at(mid - p.maxAge - 1), modifier: 'GREATER_THAN' }
          : { value: at(mid - p.minAge!), modifier: 'LESS_THAN' }
    buckets.push({
      date: { value: `${y}-01-01`, value2: `${end}-12-31`, modifier: 'BETWEEN' },
      performers_filter: anyOf<PerformerFilterType>(who.map((w) => ({ ...w, birthdate: born }))),
    })
  }
  return buckets
}

// The longest OR chain sent with the Vault: the Vault's alternatives times the age buckets stay at
// or under this. 32 overflowed SQLite's parser ("parser stack overflow", 27 buckets of three
// conditions, 2026-11-09); 16 is the people criterion's proven size.
const MAX_OR = MAX_BUCKETS

const ids = (csv?: string) => (csv ? csv.split(',').filter(Boolean) : [])

const minResolution: Record<number, ResolutionEnum> = {
  720: 'WEB_HD',
  1080: 'STANDARD_HD',
  2160: 'QUAD_HD',
}

// Stash allows one criterion per field per level, so each exclusion (and each extra criterion
// that may repeat a field) nests one AND deeper.
// `alternatives`: one of which a scene must match (the Vault); joined with the people criterion
// by distributing, since a filter holds one OR chain (Stash allows no AND beside an OR).
function withExclusions(filter: SceneFilterType, ex: Exclusions, extra: SceneFilterType[] = [], alternatives: SceneFilterType[] = []): SceneFilterType {
  const parts: SceneFilterType[] = [...extra]
  // Unlisted ids join the blocked ones in the one criterion per field: a second `tags EXCLUDES`
  // (depth 0, its own AND level) was ignored by Stash, so Edu videos stayed on Home (2026-11-09,
  // wiki gotchas/second-tags-exclusion-ignored)
  const u = ex.holdUnlisted ? ex.unlisted : undefined
  const join = (a: string[], b: string[] = []) => (b.length ? [...new Set([...a, ...b])] : a)
  const tagsOut = join(ex.tags, u?.tags)
  const performersOut = join(ex.performers, u?.performers)
  const studiosOut = join(ex.studios, u?.studios)
  if (tagsOut.length) parts.push({ tags: { value: tagsOut, modifier: 'EXCLUDES', depth: -1 } })
  if (performersOut.length) parts.push({ performers: { value: performersOut, modifier: 'EXCLUDES' } })
  if (studiosOut.length) parts.push({ studios: { value: studiosOut, modifier: 'EXCLUDES', depth: -1 } })
  // last: it may hold an OR, and Stash allows no AND beside an OR
  const people = peopleAlternatives(ex.people, alternatives.length ? Math.max(1, Math.floor(MAX_OR / alternatives.length)) : MAX_BUCKETS)
  const either = alternatives.length && people.length ? alternatives.flatMap((a) => people.map((p) => ({ ...a, ...p }))) : alternatives.length ? alternatives : people
  const last = anyOf(either)
  if (last) parts.push(last)
  let node = filter
  for (const p of parts) {
    node.AND = p
    node = p
  }
  return filter
}

export function sceneFilter(q: SceneQuery, blocked: Exclusions): SceneFilterType {
  const f: SceneFilterType = {}
  const tags = ids(q.tags)
  const performers = ids(q.performers)
  const studios = ids(q.studios)
  if (tags.length) f.tags = { value: tags, modifier: 'INCLUDES_ALL', depth: 0 }
  if (performers.length) f.performers = { value: performers, modifier: 'INCLUDES_ALL' }
  if (studios.length) f.studios = { value: studios, modifier: 'INCLUDES', depth: -1 }
  if (q.minRating) f.rating100 = { value: q.minRating * 20 - 1, modifier: 'GREATER_THAN' }
  if (q.minHeight && minResolution[q.minHeight]) {
    f.resolution = { value: minResolution[q.minHeight], modifier: 'GREATER_THAN' }
  }
  if (q.minDuration && q.maxDuration) {
    f.duration = { value: q.minDuration * 60, value2: q.maxDuration * 60, modifier: 'BETWEEN' }
  } else if (q.minDuration) {
    f.duration = { value: q.minDuration * 60, modifier: 'GREATER_THAN' }
  } else if (q.maxDuration) {
    f.duration = { value: q.maxDuration * 60, modifier: 'LESS_THAN' }
  }
  if (q.unwatched) f.play_count = { value: 0, modifier: 'EQUALS' }
  if (q.inProgress) f.resume_time = { value: 0, modifier: 'GREATER_THAN' }
  if (q.favorites) f.performer_favorite = true

  // Cleanup filters. Each can repeat a field set above (e.g. a min and a max resolution).
  const extra: SceneFilterType[] = []
  if (q.maxHeight && minResolution[q.maxHeight]) {
    extra.push({ resolution: { value: minResolution[q.maxHeight], modifier: 'LESS_THAN' } })
  }
  if (q.maxRating) extra.push({ rating100: { value: q.maxRating * 20 + 1, modifier: 'LESS_THAN' } })
  if (q.unmatched) extra.push({ stash_id_count: { value: 0, modifier: 'EQUALS' } })
  if (q.olderDays) {
    // day granularity keeps the filter, and so the query cache key, stable through the day
    const before = new Date(Date.now() - q.olderDays * 86_400_000).toISOString().slice(0, 10)
    extra.push({ created_at: { value: before, modifier: 'LESS_THAN' } })
  }
  if (q.duplicates) extra.push({ duplicated: { duplicated: true, phash: true, distance: 8 } })

  const ex: Exclusions = q.unblocked ? { tags: [], performers: [], studios: [], unlisted: blocked.unlisted, holdUnlisted: blocked.holdUnlisted } : { ...blocked }
  // Unlisted: the Vault asks for only those videos; `noUnlisted` (stations) holds them out; an
  // Unlisted id the query names is let in for this query, as a named blocked id is.
  const u = blocked.unlisted ?? { tags: [], performers: [], studios: [] }
  if (q.vault) ex.holdUnlisted = false
  else if (q.noUnlisted) ex.holdUnlisted = true
  if (ex.holdUnlisted)
    ex.unlisted = { tags: u.tags.filter((t) => !tags.includes(t)), performers: u.performers.filter((p) => !performers.includes(p)), studios: u.studios.filter((s) => !studios.includes(s)) }
  const vault: SceneFilterType[] = q.vault ? vaultAlternatives(u) : []
  // The list's own age or ethnicity filter replaces the Settings defaults; Show blocked drops them.
  if (blocked.people) {
    const own = q.minAge || q.maxAge || q.ethnicities
    const defaults: Partial<People> = q.unblocked || own ? {} : blocked.people
    ex.people = {
      gender: blocked.people.gender,
      firstYear: blocked.people.firstYear,
      minAge: own ? q.minAge : defaults.minAge,
      maxAge: own ? q.maxAge : defaults.maxAge,
      ethnicities: own ? q.ethnicities?.split(',').filter(Boolean) : defaults.ethnicities,
    }
  }
  // A blocked id the user explicitly asked to include wins for this query.
  ex.tags = [...new Set([...ex.tags, ...ids(q.xtags)])].filter((t) => !tags.includes(t))
  ex.performers = ex.performers.filter((p) => !performers.includes(p))
  ex.studios = ex.studios.filter((s) => !studios.includes(s))
  return withExclusions(f, ex, extra, vault)
}

// A scene in the Vault has an Unlisted category, performer or studio (sub-studios included).
// Nothing Unlisted: an impossible id, so the Vault is empty rather than the whole library.
function vaultAlternatives(u: UnlistedSets): SceneFilterType[] {
  const alt: SceneFilterType[] = []
  if (u.tags.length) alt.push({ tags: { value: u.tags, modifier: 'INCLUDES', depth: -1 } })
  if (u.performers.length) alt.push({ performers: { value: u.performers, modifier: 'INCLUDES' } })
  if (u.studios.length) alt.push({ studios: { value: u.studios, modifier: 'INCLUDES', depth: -1 } })
  return alt.length ? alt : [{ id: { value: 0, modifier: 'EQUALS' } }]
}

export function findFilter(q: {
  q?: string
  sort?: string
  dir?: 'asc' | 'desc'
  page?: number
  perPage?: number
  seed?: number
}): FindFilterType {
  const sort = q.sort === 'random' ? `random_${q.seed ?? 1}` : q.sort
  return {
    q: q.q || undefined,
    sort,
    direction: q.dir === 'asc' ? 'ASC' : 'DESC',
    page: q.page ?? 1,
    per_page: q.perPage ?? 40,
  }
}

// --- queries --------------------------------------------------------------------

// Year of the earliest dated scene (bounds the age-at-filming filter).
export async function firstSceneYear(): Promise<number> {
  const d = await query<Pick<Query, 'findScenes'>>(
    `query { findScenes(filter: { per_page: 1, sort: "date", direction: ASC }, scene_filter: { date: { value: "1900-01-01", modifier: GREATER_THAN } }) { scenes { date } } }`,
    {},
    // not 'scene': every list waits on this, and an edit to one video (a rating, a tag) cannot
    // move the earliest date; a scan that adds videos refreshes it with everything else
    ['library'],
  )
  const y = Number(d.findScenes.scenes[0]?.date?.slice(0, 4))
  return Number.isFinite(y) && y > 1900 ? y : 1970
}

export async function findScenes(filter: FindFilterType, sceneFilter: SceneFilterType = {}) {
  const d = await query<Pick<Query, 'findScenes'>>(
    `query($f: FindFilterType, $s: SceneFilterType) {
      findScenes(filter: $f, scene_filter: $s) { count scenes { ${SCENE_CARD} } }
    }`,
    { f: filter, s: sceneFilter },
    ['scene', ...activityTags(filter, sceneFilter)],
  )
  return { total: d.findScenes.count, items: d.findScenes.scenes.map(toSceneCard) }
}

// Perceptual-hash duplicates for the workbench, grouped as Stash groups them. Every scene is
// included, blocked and hidden ones too: this is library hygiene, not browsing. Stash answers
// in well under a second for 2.2k scenes, so the normal data TTL (dropped on any scene change)
// is plenty.
export async function findDuplicateScenes(distance: number, durationDiff: number): Promise<DuplicateScene[][]> {
  const d = await query<Pick<Query, 'findDuplicateScenes'>>(
    `query($d: Int, $t: Float) {
      findDuplicateScenes(distance: $d, duration_diff: $t) { ${SCENE_CARD} files { video_codec bit_rate frame_rate } }
    }`,
    { d: distance, t: durationDiff },
    ['scene'],
  )
  return d.findDuplicateScenes.map((group) =>
    group.map((s) => {
      const f = file(s)
      return { ...toSceneCard(s), file: { path: f?.path ?? '', bitrate: f?.bit_rate ?? 0, videoCodec: f?.video_codec ?? '', framerate: f?.frame_rate ?? 0 } }
    }),
  )
}

// Which of these scene ids Stash still has, asked fresh (never from the cache): the ghost sweep
// removes flix's rows for the rest. Throws when Stash does not answer, so nothing is removed then.
export async function existingSceneIds(sceneIds: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  for (let i = 0; i < sceneIds.length; i += 500) {
    const d = await gql<Pick<Query, 'findScenes'>>(`query($ids: [ID!]) { findScenes(ids: $ids) { scenes { id } } }`, { ids: sceneIds.slice(i, i + 500) })
    for (const s of d.findScenes.scenes) found.add(s.id)
  }
  return found
}

// `blocked`: leave out what the blocklist and "Not interested" exclude (station resume points).
export async function findScenesByIds(sceneIds: string[], blocked?: Exclusions): Promise<SceneCard[]> {
  if (!sceneIds.length) return []
  const d = await query<Pick<Query, 'findScenes'>>(
    `query($ids: [ID!]) { findScenes(ids: $ids) { scenes { ${SCENE_CARD} ${blocked ? BLOCK_FIELDS : ''} } } }`,
    { ids: sceneIds },
    ['scene'],
  )
  const scenes = blocked ? d.findScenes.scenes.filter((s) => !isBlocked(s, blocked)) : d.findScenes.scenes
  const byId = new Map<string, SceneCard>(scenes.map((s) => [s.id, toSceneCard(s)]))
  return sceneIds.map((id) => byId.get(id)).filter((s): s is SceneCard => !!s)
}

export async function getScene(id: string) {
  const d = await query<Pick<Query, 'findScene'>>(`query($id: ID!) { findScene(id: $id) { ${SCENE_DETAIL} } }`, { id }, ['scene', `scene:${id}`])
  if (!d.findScene) return null
  return {
    scene: toSceneDetail(d.findScene),
    group: groupFolder(file(d.findScene)?.path), // the studio's (or uploader's) folder, for related videos
    performerIds: d.findScene.performers.map((p) => p.id),
    studioId: d.findScene.studio?.id ?? null,
    tagIds: d.findScene.tags.map((t) => t.id),
    genders: d.findScene.performers.map((p) => p.gender ?? null), // for the Cast line
    marks: d.findScene as Pick<Scene, 'tags' | 'performers' | 'studio'>, // for unlistedReasons
  }
}

// Files are laid out <library>/<network>/<studio>/<date - title>/<file> (stash-library in the
// wiki), or <library>/<uploader>/<title>/<file> for a pack: a scene's own folder holds only it,
// the one above is its studio or uploader. That folder, or null when it would be the library
// itself (a file only two levels down).
export function groupFolder(path: string | undefined): string | null {
  const parts = path?.split('/').filter(Boolean) ?? []
  return parts.length >= 6 ? `/${parts.slice(0, -2).join('/')}` : null
}

// Stash path of a scene's primary file, for direct play from the NFS mount.
export async function sceneFilePath(id: string): Promise<string | null> {
  const d = await query<Pick<Query, 'findScene'>>(`query($id: ID!) { findScene(id: $id) { files { path } } }`, { id }, [`scene:${id}`])
  return d.findScene ? (file(d.findScene)?.path ?? null) : null
}

// Candidates share a performer or the studio; score favours performers, then studio,
// then tag overlap, then rating. A video with too few of those (nothing identified yet, a
// pack from one folder) is topped up from its own folder, then with unwatched videos, so
// the row is never empty.
const RELATED_MIN = 8 // fewer related videos than this and the row is topped up

export async function relatedScenes(
  id: string,
  performerIds: string[],
  studioId: string | null,
  tagIds: string[],
  blocked: Exclusions,
  group: string | null = null,
  // The source's Unlisted reasons (unlisted.ts relatedSide): a candidate that is Unlisted must
  // share all of its reasons. Null: the source is not Unlisted, so Stash leaves them out.
  allowed: Set<string> | null = null,
): Promise<SceneCard[]> {
  const fields = `${SCENE_CARD} ${BLOCK_FIELDS}`
  const queries: Promise<Pick<Query, 'findScenes'>>[] = []
  const ex: Exclusions = allowed ? { ...blocked, holdUnlisted: false } : { ...blocked, holdUnlisted: true }
  const fits = (s: Scene) => !allowed || !blocked.unlisted || withinReasons(unlistedReasons(s, blocked.unlisted), allowed)
  const notSelf = (f: SceneFilterType) => withExclusions({ ...f, id: { value: Number(id), modifier: 'NOT_EQUALS' } }, { ...ex })
  const run = (f: SceneFilterType) =>
    query<Pick<Query, 'findScenes'>>(`query($s: SceneFilterType) { findScenes(scene_filter: $s, filter: { per_page: 40, sort: "random_${daySeed()}" }) { scenes { ${fields} } } }`, {
      s: notSelf(f),
    }, ['scene', VOLATILE]) // 40 full cards each, three per video page: memory only, capped, not snapshotted
  if (performerIds.length) queries.push(run({ performers: { value: performerIds, modifier: 'INCLUDES' } }))
  if (studioId) queries.push(run({ studios: { value: [studioId], modifier: 'INCLUDES', depth: 0 } }))
  if (tagIds.length) queries.push(run({ tags: { value: tagIds.slice(0, 20), modifier: 'INCLUDES', depth: 0 } }))
  const results = await Promise.all(queries)
  const seen = new Map<string, Scene>()
  for (const r of results) for (const s of r.findScenes.scenes) if (fits(s)) seen.set(s.id, s)
  const tagSet = new Set(tagIds)
  const perfSet = new Set(performerIds)
  const score = (s: Scene) =>
    s.performers.filter((p) => perfSet.has(p.id)).length * 10 +
    (studioId && s.studio?.id === studioId ? 4 : 0) +
    s.tags.filter((t) => tagSet.has(t.id)).length * 0.25 +
    (s.rating100 ?? 50) / 100
  const ranked = [...seen.values()].sort((a, b) => score(b) - score(a)).slice(0, 24)
  for (const fallback of [
    // a regex: Stash's INCLUDES on a path matches loosely by words, almost the whole library
    group ? { path: { value: `^${group.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}/`, modifier: 'MATCHES_REGEX' } } : null,
    { play_count: { value: 0, modifier: 'EQUALS' } },
  ] as (SceneFilterType | null)[]) {
    if (ranked.length >= RELATED_MIN || !fallback) continue
    for (const s of (await run(fallback)).findScenes.scenes) {
      if (seen.has(s.id) || ranked.length >= 24 || !fits(s)) continue
      seen.set(s.id, s)
      ranked.push(s)
    }
  }
  return ranked.map(toSceneCard)
}

// A rating, O, edit or play drops only its scene and marks every list stale: lists are served
// once more while they refresh (so one sorted by rating may lag one refresh, a decision of
// 2026-10-31), instead of Home and Browse rebuilding cold after every tap on a star.
export async function updateSceneRating(id: string, stars: number | null) {
  await mutate(`mutation($id: ID!, $r: Int) { sceneUpdate(input: { id: $id, rating100: $r }) { id } }`, {
    id,
    r: rating100(stars),
  }, [`scene:${id}`], ['scene'])
}

// Plays and progress saves (every 15 s while watching) also drop the lists that filter or
// sort by activity: small ones (Continue, Recently watched). The big computed answers (Home, the
// facets) do not carry the activity tags: they are only expired through `scene`, served stale and
// rebuilt in the background, so watching never sends the next Home or Filters to a cold build.
export async function addScenePlay(id: string) {
  await mutate(`mutation($id: ID!) { sceneAddPlay(id: $id) { count } }`, { id }, [`scene:${id}`, 'activity:play'], ['scene'])
}

export async function saveSceneActivity(id: string, resumeTime: number, playDuration: number) {
  await mutate(`mutation($id: ID!, $r: Float, $d: Float) { sceneSaveActivity(id: $id, resume_time: $r, playDuration: $d) }`, {
    id,
    r: resumeTime,
    d: playDuration,
  }, [`scene:${id}`, 'activity:resume'], ['scene'])
}

// Clear resume points (Continue's Remove, the 30-day expiry); one write per video, in order.
export async function clearResume(ids: string[]) {
  for (const id of ids) await saveSceneActivity(id, 0, 0)
}

// Videos in Continue with the last time they were touched: the last play, or for a resume point
// with no play on record (set before flix counted plays, or in Stash's own UI) when it was added.
// Uncached: the expiry must see Stash as it is.
export async function continueAges(): Promise<{ id: string; touched: string }[]> {
  const d = await gql<Pick<Query, 'findScenes'>>(
    `{ findScenes(filter: { per_page: -1 }, scene_filter: { resume_time: { value: 0, modifier: GREATER_THAN } }) { scenes { id last_played_at created_at } } }`,
  )
  return d.findScenes.scenes.map((s) => ({ id: s.id, touched: s.last_played_at ?? s.created_at }))
}

export async function addSceneO(id: string) {
  const d = await mutate<Pick<Mutation, 'sceneAddO'>>(`mutation($id: ID!) { sceneAddO(id: $id) { count } }`, { id }, [`scene:${id}`], ['scene'])
  return d.sceneAddO.count
}

export async function findPerformers(filter: FindFilterType, blocked: Exclusions, extra: PerformerFilterType = {}, gender: GenderCriterionInput | null = null) {
  const pf: PerformerFilterType = { ...extra }
  if (gender) pf.gender = gender

  const d = await query<Pick<Query, 'findPerformers'>>(
    `query($f: FindFilterType, $p: PerformerFilterType) {
      findPerformers(filter: $f, performer_filter: $p) { count performers { ${PERFORMER_CARD} } }
    }`,
    { f: filter, p: pf },
    ['performer'],
  )
  return dropBlocked({ total: d.findPerformers.count, items: d.findPerformers.performers.map(toPerformerCard) }, blocked.performers)
}

export async function getPerformer(id: string): Promise<PerformerDetail | null> {
  const d = await query<Pick<Query, 'findPerformer'>>(
    `query($id: ID!) { findPerformer(id: $id) {
      ${PERFORMER_CARD} disambiguation alias_list birthdate ethnicity hair_color eye_color height_cm
      measurements fake_tits career_start career_end tattoos piercings details urls tags { id name }
    } }`,
    { id },
    ['performer', `performer:${id}`],
  )
  const p = d.findPerformer
  if (!p) return null
  return {
    ...toPerformerCard(p),
    disambiguation: p.disambiguation || null,
    aliases: p.alias_list ?? [],
    birthdate: p.birthdate || null,
    ethnicity: p.ethnicity || null,
    hairColor: p.hair_color || null,
    eyeColor: p.eye_color || null,
    heightCm: p.height_cm ?? null,
    measurements: p.measurements || null,
    fakeTits: p.fake_tits || null,
    careerStart: p.career_start ?? null,
    careerEnd: p.career_end ?? null,
    tattoos: p.tattoos || null,
    piercings: p.piercings || null,
    details: p.details || null,
    urls: p.urls ?? [],
    tags: (p.tags ?? []).map((t) => ({ id: t.id, name: t.name })),
  }
}

// Drops the performer; the performer lists and the scene rows a favourite drives ("New from
// performers you follow") are served once more while they refresh.
export async function setPerformerFavorite(id: string, favorite: boolean) {
  await mutate(`mutation($id: ID!, $f: Boolean) { performerUpdate(input: { id: $id, favorite: $f }) { id } }`, {
    id,
    f: favorite,
  }, [`performer:${id}`], ['performer', 'scene'])
}

export async function setPerformerRating(id: string, stars: number | null) {
  await mutate(`mutation($id: ID!, $r: Int) { performerUpdate(input: { id: $id, rating100: $r }) { id } }`, {
    id,
    r: rating100(stars),
  }, ['performer'])
}

export async function findStudios(filter: FindFilterType, blocked: Exclusions) {
  const sf: StudioFilterType = {}
  const d = await query<Pick<Query, 'findStudios'>>(
    `query($f: FindFilterType, $s: StudioFilterType) {
      findStudios(filter: $f, studio_filter: $s) { count studios { ${STUDIO_CARD} } }
    }`,
    { f: filter, s: sf },
    ['studio'],
  )
  return dropBlocked({ total: d.findStudios.count, items: d.findStudios.studios.map(toStudioCard) }, blocked.studios)
}

export async function getStudio(id: string): Promise<StudioDetail | null> {
  const d = await query<Pick<Query, 'findStudio'>>(
    `query($id: ID!) { findStudio(id: $id) { ${STUDIO_CARD} details urls child_studios { id name image_path } } }`,
    { id },
    ['studio', `studio:${id}`],
  )
  const s = d.findStudio
  if (!s) return null
  return {
    ...toStudioCard(s),
    details: s.details || null,
    urls: s.urls ?? [],
    children: (s.child_studios ?? []).map((c) => ref(c)),
  }
}

export async function setStudioFavorite(id: string, favorite: boolean) {
  await mutate(`mutation($id: ID!, $f: Boolean) { studioUpdate(input: { id: $id, favorite: $f }) { id } }`, {
    id,
    f: favorite,
  }, ['studio'])
}

export async function setTagFavorite(id: string, favorite: boolean) {
  await mutate(`mutation($id: ID!, $f: Boolean) { tagUpdate(input: { id: $id, favorite: $f }) { id } }`, {
    id,
    f: favorite,
  }, ['tag'])
}

export async function findTags(filter: FindFilterType, blocked: Exclusions, onlyUsed = true) {
  const tf: TagFilterType = {}
  if (onlyUsed) tf.scene_count = { value: 0, modifier: 'GREATER_THAN' }
  const d = await query<Pick<Query, 'findTags'>>(
    `query($f: FindFilterType, $t: TagFilterType) {
      findTags(filter: $f, tag_filter: $t) { count tags { ${TAG_CARD} } }
    }`,
    { f: filter, t: tf },
    ['tag'],
  )
  return dropBlocked({ total: d.findTags.count, items: d.findTags.tags.map(toTagCard) }, blocked.tags)
}

export async function getTag(id: string): Promise<TagDetail | null> {
  const d = await query<Pick<Query, 'findTag'>>(
    `query($id: ID!) { findTag(id: $id) { ${TAG_CARD} description aliases parents { id name } children { id name } } }`,
    { id },
    ['tag', `tag:${id}`],
  )
  const t = d.findTag
  if (!t) return null
  return {
    ...toTagCard(t),
    description: t.description || null,
    aliases: t.aliases ?? [],
    parents: t.parents.map((p) => ({ id: p.id, name: p.name })),
    children: t.children.map((c) => ({ id: c.id, name: c.name })),
  }
}

export async function namesFor(kind: 'tag' | 'performer' | 'studio', id: string): Promise<string | null> {
  const q = {
    tag: `query($id: ID!) { x: findTag(id: $id) { name } }`,
    performer: `query($id: ID!) { x: findPerformer(id: $id) { name } }`,
    studio: `query($id: ID!) { x: findStudio(id: $id) { name } }`,
  }[kind]
  const d = await query<{ x: Pick<Tag, 'name'> | null }>(q, { id }, [kind, `${kind}:${id}`])
  return d.x?.name ?? null
}

// --- edits ------------------------------------------------------------------------

export async function updateScene(id: string, patch: { title?: string; tagIds?: string[] }) {
  const input: SceneUpdateInput = { id }
  if (patch.title !== undefined) input.title = patch.title
  if (patch.tagIds !== undefined) input.tag_ids = patch.tagIds
  // a tag change moves the scene counts on tag cards, so the 'tag' lists go stale too (nothing
  // needs them dropped: the facets and tiles are tagged 'scene')
  const expires = ['scene', ...(patch.tagIds !== undefined ? ['tag'] : [])]
  await mutate(`mutation($i: SceneUpdateInput!) { sceneUpdate(input: $i) { id } }`, { i: input }, [`scene:${id}`], expires)
}

// What deleting a scene needs: its files and StashDB links. Uncached, so it sees the scene as it is now.
// `stashDbIds`: only the ids from StashDB's endpoint (Whisparr's exclusions are keyed by them).
export async function sceneForDeletion(id: string): Promise<{ title: string; paths: string[]; stashIds: string[]; stashDbIds: string[] } | null> {
  const d = await gql<Pick<Query, 'findScene'>>(`query($id: ID!) { findScene(id: $id) { id title files { path } stash_ids { stash_id endpoint } } }`, { id })
  const s = d.findScene
  if (!s) return null
  return { title: sceneTitle(s), paths: s.files.map((f) => f.path), stashIds: s.stash_ids.map((x) => x.stash_id), stashDbIds: s.stash_ids.filter((x) => /stashdb\.org/.test(x.endpoint)).map((x) => x.stash_id) }
}

// Drops the scene and its generated sprites and previews. The file is Whisparr's to delete:
// Stash mounts the library read-only.
// A scan or identify job can hold Stash's database lock far longer than gql's short retries,
// so keep trying for up to DESTROY_WAIT ms (the caller's file is already gone by then).
const DESTROY_WAIT = 30_000
export async function destroyScene(id: string) {
  const until = Date.now() + DESTROY_WAIT
  for (;;) {
    try {
      await mutate(
        `mutation($i: SceneDestroyInput!) { sceneDestroy(input: $i) }`,
        { i: { id, delete_file: false, delete_generated: true, destroy_file_entry: true } },
        ['scene', 'performer', 'studio', 'tag', 'library'],
      )
      return
    } catch (e) {
      if (!/database is locked/.test((e as Error).message) || Date.now() > until) throw e
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

// A Stash tag flix reserves for a mark on one video, created on first use (`create`) and looked
// up once. "Unlisted" (wiki features/vault) and the retired "Not interested": until 2026-11-09 it
// hid a video from every list; now Cleanup lists what still carries it, to delete or keep
// (decisions/hide-means-delete-block-or-unlist).
function reservedTag(name: string) {
  let id: string | null | undefined
  let lookup: Promise<string | null> | null = null // shared by the requests that arrive before it is known
  const find = async (create: boolean): Promise<string | null> => {
    const d = await gql<Pick<Query, 'findTags'>>(`query($n: String!) { findTags(tag_filter: { name: { value: $n, modifier: EQUALS } }) { tags { id } } }`, { n: name })
    id = d.findTags.tags[0]?.id ?? null
    if (!id && create) {
      const c = await mutate<Pick<Mutation, 'tagCreate'>>(`mutation($n: String!) { tagCreate(input: { name: $n }) { id } }`, { n: name }, ['tag'])
      id = c.tagCreate?.id ?? null
    }
    return id ?? null
  }
  return (create = false): Promise<string | null> => {
    if (id !== undefined && !(create && id === null)) return Promise.resolve(id)
    if (create) return find(true)
    lookup ??= find(false).finally(() => (lookup = null))
    return lookup
  }
}
export const hiddenTag = reservedTag('Not interested')
export const unlistedTag = reservedTag('Unlisted')

async function setReservedTag(tagOf: (create: boolean) => Promise<string | null>, id: string, on: boolean) {
  const tag = await tagOf(on)
  const r = tag ? await getScene(id) : null
  if (!tag || !r) return
  await updateScene(id, { tagIds: on ? [...new Set([...r.tagIds, tag])] : r.tagIds.filter((t) => t !== tag) })
}
export const setSceneHidden = (id: string, hidden: boolean) => setReservedTag(hiddenTag, id, hidden)
export const setSceneUnlisted = (id: string, unlisted: boolean) => setReservedTag(unlistedTag, id, unlisted)

export async function hiddenScenes(): Promise<SceneCard[]> {
  const tag = await hiddenTag()
  if (!tag) return []
  return (await findScenes(findFilter({ sort: 'updated_at', perPage: 200 }), { tags: { value: [tag], modifier: 'INCLUDES', depth: 0 } })).items
}

// Videos unlisted by hand (the "Unlisted" tag), newest change first, for Settings.
export async function unlistedScenes(): Promise<SceneCard[]> {
  const tag = await unlistedTag()
  if (!tag) return []
  return (await findScenes(findFilter({ sort: 'updated_at', perPage: 200 }), { tags: { value: [tag], modifier: 'INCLUDES', depth: 0 } })).items
}

// Markers need a primary tag; flix's own go under "Highlight", created on first use.
async function highlightTag(): Promise<string> {
  const d = await gql<Pick<Query, 'findTags'>>(`{ findTags(tag_filter: { name: { value: "Highlight", modifier: EQUALS } }) { tags { id } } }`)
  if (d.findTags.tags[0]) return d.findTags.tags[0].id
  const c = await mutate<Pick<Mutation, 'tagCreate'>>(`mutation { tagCreate(input: { name: "Highlight" }) { id } }`, {}, ['tag'])
  if (!c.tagCreate) throw new StashError('tagCreate returned no tag')
  return c.tagCreate.id
}

// A marker as the app shows it. An untitled marker is named after its primary tag, which Stash
// requires on every marker (flix's own default is "Highlight").
export const toMarker = (m: Pick<SceneMarker, 'id' | 'seconds' | 'end_seconds' | 'title'> & { primary_tag?: { id: string; name: string } | null }): Marker => ({
  id: m.id,
  seconds: m.seconds,
  endSeconds: m.end_seconds ?? null,
  title: m.title || m.primary_tag?.name || '',
  tag: m.primary_tag?.name ?? '',
  tagId: m.primary_tag?.id ?? '',
})

const MARKER_FIELDS = 'id seconds end_seconds title primary_tag { id name }'

// Returns the marker, so the player can offer Undo (and an O upgrade) right after.
export async function createMarker(sceneId: string, seconds: number, title: string, tagId?: string): Promise<Marker> {
  const i: SceneMarkerCreateInput = { scene_id: sceneId, seconds, title, primary_tag_id: tagId || (await highlightTag()) }
  const d = await mutate<Pick<Mutation, 'sceneMarkerCreate'>>(
    `mutation($i: SceneMarkerCreateInput!) { sceneMarkerCreate(input: $i) { ${MARKER_FIELDS} } }`,
    { i },
    [`scene:${sceneId}`],
  )
  if (!d.sceneMarkerCreate) throw new StashError('sceneMarkerCreate returned no marker')
  return toMarker(d.sceneMarkerCreate)
}

export async function updateMarker(sceneId: string, id: string, patch: { title?: string; tagId?: string }): Promise<Marker> {
  const i: SceneMarkerUpdateInput = { id, title: patch.title, primary_tag_id: patch.tagId }
  const d = await mutate<Pick<Mutation, 'sceneMarkerUpdate'>>(
    `mutation($i: SceneMarkerUpdateInput!) { sceneMarkerUpdate(input: $i) { ${MARKER_FIELDS} } }`,
    { i },
    [`scene:${sceneId}`],
  )
  if (!d.sceneMarkerUpdate) throw new StashError('sceneMarkerUpdate returned no marker')
  return toMarker(d.sceneMarkerUpdate)
}

export async function deleteMarker(sceneId: string, id: string) {
  await mutate(`mutation($id: ID!) { sceneMarkerDestroy(id: $id) }`, { id }, [`scene:${sceneId}`])
}

// Look one scene up on StashDB with the merge rules the NAS docs record for Identify
// (merge title, date, details, studio, performers, tags; create missing; skip ambiguous).
// Stash runs it as a job; this waits for it, so the caller gets the finished result in one
// answer (a single scene takes a few seconds). Past `waitMs` (well under the web client's 65 s)
// the current status goes back and the job is followed here instead, so the caches are dropped
// when it finishes whether or not anyone is still polling (until 2026-10-31 that depended on
// the scene page staying open).
const IDENTIFY_WAIT = 40_000
const JOB_DONE = new Set<JobStatus['status']>(['FINISHED', 'FAILED', 'CANCELLED'])
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref())

export async function identifyScene(id: string, { waitMs = IDENTIFY_WAIT, pollMs = 1000 } = {}): Promise<JobStatus> {
  const jobId = await startIdentify(id)
  const until = Date.now() + waitMs
  for (;;) {
    let j: JobStatus | null | undefined
    try {
      j = await jobStatus(jobId)
    } catch {
      // the job itself holds the lock longer than gql's retries: keep asking until the deadline
      if (Date.now() >= until) break
    }
    if (j === null) return jobGone(jobId)
    if (j && JOB_DONE.has(j.status)) return j
    if (Date.now() >= until) break
    await sleep(pollMs)
  }
  followJob(jobId, pollMs)
  return { id: jobId, status: 'RUNNING', progress: null, error: null }
}

async function startIdentify(id: string): Promise<string> {
  const field = (f: string, createMissing = false): IdentifyFieldOptionsInput => ({ field: f, strategy: 'MERGE', createMissing })
  const d = await mutate<Pick<Mutation, 'metadataIdentify'>>(
    `mutation($i: IdentifyMetadataInput!) { metadataIdentify(input: $i) }`,
    {
      i: {
        sources: [{ source: { stash_box_endpoint: 'https://stashdb.org/graphql' } }],
        sceneIDs: [id],
        options: {
          fieldOptions: [
            field('title'), field('date'), field('details'), field('code'), field('urls'),
            field('studio', true), field('performers', true), field('tags', true),
          ],
          setCoverImage: true,
          includeMalePerformers: true,
          skipMultipleMatches: true,
        },
      },
    },
    [],
  )
  return String(d.metadataIdentify)
}

// Identify can touch any of these, and Stash's own change check would catch it only a poll later.
const jobFinished = () => dataCache.invalidate('scene', 'performer', 'studio', 'tag')
// Stash forgets a job once it has left the queue, so a job it no longer lists is over.
const jobGone = (id: string): JobStatus => {
  jobFinished()
  return { id, status: 'FINISHED', progress: 1, error: null }
}

export async function jobStatus(id: string): Promise<JobStatus | null> {
  const d = await gql<Pick<Query, 'findJob'>>(`query($id: ID!) { findJob(input: { id: $id }) { id status progress error } }`, { id })
  const j = d.findJob
  if (!j) return null
  if (j.status === 'FINISHED') jobFinished()
  return { id: j.id, status: j.status, progress: j.progress ?? null, error: j.error ?? null }
}

// Keeps asking after a job that outlived its request, every `pollMs`, for up to `maxMs`; a read
// that fails (the lock) is retried on the next tick. One follower per job.
const following = new Set<string>()
export function followJob(jobId: string, pollMs = 2000, maxMs = 10 * 60_000) {
  if (following.has(jobId)) return
  following.add(jobId)
  const until = Date.now() + maxMs
  const tick = async () => {
    try {
      const j = await jobStatus(jobId)
      if (j === null) jobGone(jobId)
      if (j === null || JOB_DONE.has(j.status)) return following.delete(jobId)
    } catch (e) {
      console.error('job follow:', (e as Error).message)
    }
    if (Date.now() > until) return following.delete(jobId)
    setTimeout(tick, pollMs).unref()
  }
  setTimeout(tick, pollMs).unref()
}

// --- facets: what is inside a filtered set ---------------------------------------------------

// The quick choices (watched, rating, quality, length) are applied here rather than in Stash, so
// each choice group can be counted as if its own pick were not set; everything else filters in Stash.
const LOCAL_KEYS = ['unwatched', 'inProgress', 'minRating', 'minHeight', 'minDuration', 'maxDuration'] as const
type Local = Pick<SceneQuery, (typeof LOCAL_KEYS)[number]>

// Resolution as Stash buckets it, near enough: the short side, with some slack for odd encodes.
const RES_MIN: Record<number, number> = { 720: 700, 1080: 1000, 2160: 2000 }
const local = {
  watched: (s: Scene, q: Local) => (!q.unwatched || !s.play_count) && (!q.inProgress || (s.resume_time ?? 0) > 0),
  rating: (s: Scene, q: Local) => !q.minRating || (s.rating100 ?? 0) > q.minRating * 20 - 1,
  quality: (s: Scene, q: Local) => {
    if (!q.minHeight) return true
    const f = file(s)
    return !!f && Math.min(f.width, f.height) >= (RES_MIN[q.minHeight] ?? q.minHeight)
  },
  length: (s: Scene, q: Local) => {
    const d = file(s)?.duration ?? 0
    return (!q.minDuration || d > q.minDuration * 60) && (!q.maxDuration || d < q.maxDuration * 60)
  },
}
type Group = keyof typeof local
const groups = Object.keys(local) as Group[]
const passes = (s: Scene, q: Local, except?: Group) => groups.every((g) => g === except || local[g](s, q))

// Counts inside the set a query selects: per tag, performer and studio (a studio also counts its
// sub-studios' videos, as its filter does), and per quick choice.
//
// The answer (2–25 KB) is cached per filter set and exclusions under `facets` and snapshotted,
// so a deploy or an evicted working set no longer costs the 1–2 s rebuild on Filters; the raw
// scene dump behind it stays memory-only: PINNED for the unfiltered set every Browse opens,
// VOLATILE (capped) for the rest. Sort and paging do not change the counts and are left out of
// the key.
export async function sceneFacets(q: SceneQuery, blocked: Exclusions): Promise<SceneFacets> {
  const { sort: _sort, dir: _dir, page: _page, perPage: _perPage, seed: _seed, ...counted } = q
  return computed(['facets', counted, blocked], ['scene'], () => buildFacets(counted, blocked))
}

async function buildFacets(q: SceneQuery, blocked: Exclusions): Promise<SceneFacets> {
  const rest: SceneQuery = { ...q }
  for (const k of LOCAL_KEYS) delete rest[k]
  const s = sceneFilter(rest, blocked)
  const unfiltered = !q.q && JSON.stringify(s) === JSON.stringify(sceneFilter({}, blocked))
  const d = await query<Pick<Query, 'findScenes'>>(
    `query($f: FindFilterType, $s: SceneFilterType) { findScenes(filter: $f, scene_filter: $s) { scenes {
      play_count resume_time rating100 files { width height duration } tags { id } performers { id } studio { id parent_studio { id } }
    } } }`,
    { f: { ...findFilter({ q: q.q }), per_page: -1, sort: 'id' }, s },
    ['scene', unfiltered ? PINNED : VOLATILE], // hundreds of KB each: not worth the disk; stale after a play, not dropped
  )
  const all = d.findScenes.scenes
  const inSet = all.filter((s) => passes(s, q))
  const tally = (pick: (s: Scene) => string[]) => {
    const out: Record<string, number> = {}
    for (const s of inSet) for (const id of pick(s)) out[id] = (out[id] ?? 0) + 1
    return out
  }
  // each choice group: how many each of its options would give, with the other groups applied
  const option = (g: Group, opts: Record<string, Local>) => {
    const pool = all.filter((s) => passes(s, q, g))
    return Object.fromEntries(Object.entries(opts).map(([k, o]) => [k, pool.filter((s) => local[g](s, o)).length]))
  }
  return {
    total: inSet.length,
    tags: tally((s) => s.tags.map((t) => t.id)),
    performers: tally((s) => s.performers.map((p) => p.id)),
    studios: tally((s) => (s.studio ? [s.studio.id, ...(s.studio.parent_studio ? [s.studio.parent_studio.id] : [])] : [])),
    options: {
      watched: option('watched', { any: {}, unwatched: { unwatched: true }, inProgress: { inProgress: true } }),
      rating: option('rating', { any: {}, '3': { minRating: 3 }, '4': { minRating: 4 }, '4.5': { minRating: 4.5 } }),
      quality: option('quality', { any: {}, '720': { minHeight: 720 }, '1080': { minHeight: 1080 }, '2160': { minHeight: 2160 } }),
      length: option('length', { any: {}, short: { maxDuration: 15 }, mid: { minDuration: 15, maxDuration: 40 }, long: { minDuration: 40 } }),
    },
  }
}

// --- activity: history, stats, recommendations ---------------------------------------

// Every scene you have touched: played, rated or O'd. One cached query feeds history,
// stats and "For you". Tag sizes (for weighting rare tags) come from tagSceneCounts: asked
// here as `tags { scene_count }`, Stash counted every tag's scenes for every scene, 0.5 of the
// query's 0.6 s (2026-10-31).
async function activityScenes(): Promise<Scene[]> {
  const d = await query<Pick<Query, 'findScenes'>>(
    `query { findScenes(
      filter: { per_page: -1, sort: "last_played_at", direction: DESC },
      scene_filter: {
        play_count: { value: 0, modifier: GREATER_THAN },
        OR: { rating100: { value: 0, modifier: GREATER_THAN }, OR: { o_counter: { value: 0, modifier: GREATER_THAN } } }
      }
    ) { scenes { ${SCENE_CARD} ${BLOCK_FIELDS} play_duration play_history performers { gender image_path } tags { id name } } } }`,
    {},
    ['scene', 'activity:play'],
  )
  return d.findScenes.scenes
}

// The fields isBlocked reads, for queries that apply the blocklist after the fact.
const BLOCK_FIELDS = 'tags { id } performers { id } studio { id parent_studio { id } }'

// Does the blocklist (or "Not interested") exclude this scene? For results Stash cannot
// filter: what was watched, a station's resume points. Age and ethnicity defaults are not
// applied here; they shape what lists offer, not what you already watched.
export function isBlocked(s: Pick<Scene, 'tags' | 'performers' | 'studio'>, ex: Pick<Exclusions, 'tags' | 'performers' | 'studios' | 'unlisted' | 'holdUnlisted'>): boolean {
  return (
    (s.tags ?? []).some((t) => ex.tags.includes(t.id)) ||
    (s.performers ?? []).some((p) => ex.performers.includes(p.id)) ||
    [s.studio?.id, s.studio?.parent_studio?.id].some((id) => id != null && ex.studios.includes(id)) ||
    (!!ex.holdUnlisted && !!ex.unlisted && unlistedReasons(s, ex.unlisted).size > 0)
  )
}

// Why a scene is Unlisted: `tag:<id>`, `performer:<id>`, `studio:<id>` (its studio or the parent).
// Empty: it is not. The related-videos rule compares these sets (wiki features/vault).
export function unlistedReasons(s: Pick<Scene, 'tags' | 'performers' | 'studio'>, u: UnlistedSets): Set<string> {
  const out = new Set<string>()
  for (const t of s.tags ?? []) if (u.tags.includes(t.id)) out.add(`tag:${t.id}`)
  for (const p of s.performers ?? []) if (u.performers.includes(p.id)) out.add(`performer:${p.id}`)
  for (const id of [s.studio?.id, s.studio?.parent_studio?.id]) if (id != null && u.studios.includes(id)) out.add(`studio:${id}`)
  return out
}

// May a scene with these reasons show beside (related to) one with `allowed`? Only if every reason
// it is Unlisted is also true of that one.
export const withinReasons = (reasons: Set<string>, allowed: Set<string>) => [...reasons].every((r) => allowed.has(r))

const weight = (s: Scene) => (s.play_count ?? 0) + 2 * (s.o_counter ?? 0) + (s.rating100 ? (s.rating100 / 20 - 3) * 1.5 : 0)

// Every play, one entry per video per day (`tz`: the browser's getTimezoneOffset(), minutes), newest
// first, a page at a time. _Until 2026-11-09_ every play was its own row, the newest 300 only.
export async function history(page: number, perPage: number, tz: number, blocked?: Exclusions): Promise<{ items: HistoryEntry[]; total: number }> {
  const scenes = (await activityScenes()).filter((s) => !blocked || !isBlocked(s, blocked))
  return groupHistory(scenes.map((s) => ({ card: toSceneCard(s), times: s.play_history ?? [] })), tz, page, perPage)
}

export function groupHistory(scenes: { card: SceneCard; times: string[] }[], tz: number, page: number, perPage: number): { items: HistoryEntry[]; total: number } {
  const all: HistoryEntry[] = []
  for (const { card, times } of scenes) {
    const days = new Map<string, string[]>()
    for (const t of times) {
      const ms = Date.parse(t)
      if (Number.isNaN(ms)) continue
      const day = new Date(ms - tz * 60_000).toISOString().slice(0, 10)
      days.set(day, [...(days.get(day) ?? []), t])
    }
    for (const [day, ts] of days) {
      ts.sort((a, b) => Date.parse(b) - Date.parse(a))
      all.push({ playedAt: ts[0], day, times: ts, scene: card })
    }
  }
  all.sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt))
  return { items: all.slice((page - 1) * perPage, page * perPage), total: all.length }
}

// The last video played, for "Because you watched": the touched scenes come newest play first,
// so this is the first played one that is not blocked (_until 2026-11-09 every Home build turned
// every play event of every touched video into a card and sorted them to find it_).
export async function lastPlayed(blocked?: Exclusions): Promise<{ id: string; title: string } | null> {
  const s = (await activityScenes()).find((s) => s.last_played_at && (!blocked || !isBlocked(s, blocked)))
  return s ? { id: s.id, title: toSceneCard(s).title } : null
}

// History's remove and its Undo: exactly these plays out of (or back into) Stash's play history;
// the play count follows, the resume point and play time stay. Like a play, it drops the scene's
// own queries and the activity ones and leaves the lists stale (_until 2026-11-09 it reset the
// play count and resume point and dropped every 'scene' query_).
export async function deletePlays(id: string, times: string[]) {
  await mutate(`mutation($id: ID!, $t: [Timestamp!]) { sceneDeletePlay(id: $id, times: $t) { count } }`, { id, t: times }, [`scene:${id}`, 'activity:play'], ['scene'])
}
export async function addPlays(id: string, times: string[]) {
  await mutate(`mutation($id: ID!, $t: [Timestamp!]) { sceneAddPlay(id: $id, times: $t) { count } }`, { id, t: times }, [`scene:${id}`, 'activity:play'], ['scene'])
}

export async function stats(blocked?: Exclusions): Promise<Stats> {
  const scenes = (await activityScenes()).filter((s) => !blocked || !isBlocked(s, blocked))
  const tally = () => new Map<string, { ref: Ref; plays: number }>()
  const perf = tally()
  const studios = tally()
  const tags = tally()
  const add = (m: ReturnType<typeof tally>, ref: Ref, n: number) => {
    const e = m.get(ref.id) ?? { ref, plays: 0 }
    e.plays += n
    m.set(ref.id, e)
  }
  const days = new Map<string, number>()
  const since = Date.now() - 30 * 86_400_000
  let plays = 0
  let seconds = 0
  let o = 0
  let watched = 0
  for (const s of scenes) {
    const n = s.play_count ?? 0
    plays += n
    seconds += s.play_duration ?? 0
    o += s.o_counter ?? 0
    if (n) watched++
    if (!n) continue
    s.performers.forEach((p) => add(perf, ref(p), n))
    if (s.studio) add(studios, ref(s.studio), n)
    s.tags.forEach((t) => add(tags, { id: t.id, name: t.name }, n))
    for (const t of s.play_history ?? []) {
      const at = new Date(t)
      if (at.getTime() < since) continue
      const day = at.toISOString().slice(0, 10)
      days.set(day, (days.get(day) ?? 0) + 1)
    }
  }
  const top = (m: ReturnType<typeof tally>, n: number) => [...m.values()].sort((a, b) => b.plays - a.plays).slice(0, n)
  const perDay = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10)
    return { date, plays: days.get(date) ?? 0 }
  })
  return {
    plays,
    hours: Math.round((seconds / 3600) * 10) / 10,
    scenesWatched: watched,
    oCount: o,
    topPerformers: top(perf, 10),
    topStudios: top(studios, 5),
    topTags: top(tags, 15),
    perDay,
  }
}

// Affinity from what you watched, rated and O'd; tags are weighted by rarity so that
// near-universal tags do not drown out distinctive ones.
export interface Affinities {
  performers: Map<string, { ref: Ref; w: number; gender: string | null }>
  studios: Map<string, number>
  tags: Map<string, number>
}

// How much each performer, studio and tag figures in what you watched, rated and O'd.
// How many scenes carry each tag, all tags in one query (0.14 s for ~1,100 tags). Only weights
// "For you" and Featured, so it may lag a tag edit until Stash next reports a change.
async function tagSceneCounts(): Promise<Map<string, number>> {
  const d = await query<Pick<Query, 'findTags'>>(`{ findTags(filter: { per_page: -1 }) { tags { id scene_count } } }`, {}, ['library'])
  return new Map(d.findTags.tags.map((t) => [t.id, t.scene_count ?? 0]))
}

// `skip`: Unlisted scenes teach nothing about taste here (wiki features/vault).
export async function affinities(skip: UnlistedSets | null = null): Promise<Affinities | null> {
  const [all, tagCounts] = await Promise.all([activityScenes(), tagSceneCounts()])
  const scenes = skip ? all.filter((s) => !unlistedReasons(s, skip).size) : all
  if (!scenes.length) return null
  const totalRaw = await query<Pick<Query, 'findScenes'>>(`{ findScenes(filter: { per_page: 0 }) { count } }`, {}, ['scene'])
  const total = totalRaw.findScenes.count
  const pAff: Affinities['performers'] = new Map()
  const sAff = new Map<string, number>()
  const tAff = new Map<string, number>()
  for (const s of scenes) {
    const w = weight(s)
    if (w <= 0) continue
    s.performers.forEach((p) => {
      const e = pAff.get(p.id) ?? { ref: ref(p), w: 0, gender: p.gender ?? null }
      e.w += w
      pAff.set(p.id, e)
    })
    if (s.studio) sAff.set(s.studio.id, (sAff.get(s.studio.id) ?? 0) + w)
    s.tags.forEach((t) => tAff.set(t.id, (tAff.get(t.id) ?? 0) + w * Math.log(1 + total / Math.max(1, tagCounts.get(t.id) ?? 1))))
  }
  return { performers: pAff, studios: sAff, tags: tAff }
}

export async function recommendations(blocked: Exclusions) {
  const aff = await affinities(blocked.holdUnlisted ? (blocked.unlisted ?? null) : null)
  if (!aff) return null
  const { performers: pAff, studios: sAff, tags: tAff } = aff
  const topIds = <T,>(m: Map<string, T>, val: (v: T) => number, n: number) =>
    [...m.entries()].sort((a, b) => val(b[1]) - val(a[1])).slice(0, n).map(([k]) => k)
  const topPerf = topIds(pAff, (v) => v.w, 8)
  const topStudios = topIds(sAff, (v) => v, 3)
  const topTags = topIds(tAff, (v) => v, 6)

  const fields = `${SCENE_CARD} tags { id }`
  const run = (f: SceneFilterType) =>
    query<Pick<Query, 'findScenes'>>(
      `query($s: SceneFilterType) { findScenes(scene_filter: $s, filter: { per_page: 60, sort: "random_${daySeed()}" }) { scenes { ${fields} } } }`,
      { s: withExclusions({ ...f, play_count: { value: 0, modifier: 'EQUALS' } }, { ...blocked }) },
      ['scene', 'activity:play'],
    )
  const results = await Promise.all([
    topPerf.length ? run({ performers: { value: topPerf, modifier: 'INCLUDES' } }) : null,
    topStudios.length ? run({ studios: { value: topStudios, modifier: 'INCLUDES', depth: 0 } }) : null,
    topTags.length ? run({ tags: { value: topTags, modifier: 'INCLUDES', depth: 0 } }) : null,
  ])
  const cands = new Map<string, Scene>()
  for (const r of results) for (const s of r?.findScenes.scenes ?? []) cands.set(s.id, s)
  const score = (s: Scene) =>
    s.performers.reduce((a, p) => a + (pAff.get(p.id)?.w ?? 0), 0) +
    (s.studio ? (sAff.get(s.studio.id) ?? 0) * 0.5 : 0) +
    s.tags.reduce((a, t) => a + (tAff.get(t.id) ?? 0) * 0.1, 0)
  const forYou = [...cands.values()].sort((a, b) => score(b) - score(a)).slice(0, 24).map(toSceneCard)

  // "More with …" for the two performers you return to most.
  const favPerformers = topPerf
    .map((id) => pAff.get(id)!)
    .filter((p) => !blocked.performers.includes(p.ref.id) && !(blocked.holdUnlisted && blocked.unlisted?.performers.includes(p.ref.id)))
    .slice(0, 2)
    .map((p) => p.ref)
  return { forYou, favPerformers }
}

// --- featured -------------------------------------------------------------------------

// Everything the Featured engine scores: the whole library (minus exclusions) with the card
// fields plus what the signals read. One query, cached like the rest but kept out of the
// saved cache (it is the biggest result flix holds and is cheap to refetch).
// Only what the Featured scoring reads, for the whole library: with the card fields (files,
// paths, names) it took 2.3 s and ~7 MB on the N5105, without them 0.8 s and 2.3 MB
// (2026-10-31); the 24 that win get their cards from findScenesByIds.
//
// Tagged POOL rather than 'scene' / 'activity:play': a play or an edit marks it stale instead
// of dropping it (see mutate), so Home after watching something answers from the old pool at
// once while it refreshes, instead of waiting for a whole-library query. Not VOLATILE: at
// 2.3 MB it goes into the snapshot, so a restart (every deploy) starts with it.
export const POOL = 'featured-pool'
export async function featuredPool(blocked: Exclusions): Promise<Scene[]> {
  const d = await query<Pick<Query, 'findScenes'>>(
    `query($s: SceneFilterType) { findScenes(scene_filter: $s, filter: { per_page: -1, sort: "created_at", direction: DESC }) {
      scenes { id created_at last_played_at play_count o_counter rating100 tags { id favorite } scene_markers { id } performers { id favorite } studio { id favorite } }
    } }`,
    { s: withExclusions({}, { ...blocked }) },
    [POOL],
  )
  return d.findScenes.scenes
}

// --- tag tiles ------------------------------------------------------------------------

// One representative screenshot per tag, from one query over the library: the best-rated,
// most-played scene carrying the tag that no bigger tag already used. The tiles (21 KB gz) are
// cached and snapshotted like the facets; the whole-library dump behind them is PINNED in memory (_capped at 3,000 scenes until 2026-11-09_).
export async function tagTiles(blocked: Exclusions): Promise<TagTile[]> {
  return computed(['tiles', blocked], ['scene', 'tag'], () => buildTiles(blocked))
}

async function buildTiles(blocked: Exclusions): Promise<TagTile[]> {
  const [scenesRaw, tagsRaw] = await Promise.all([
    query<Pick<Query, 'findScenes'>>(
      `query($s: SceneFilterType) { findScenes(scene_filter: $s, filter: { per_page: -1, sort: "rating", direction: DESC }) { scenes { id rating100 play_count paths { screenshot } ${BLOCK_FIELDS} } } }`,
      { s: withExclusions({}, { ...blocked }) },
      ['scene', PINNED],
    ),
    findTags({ per_page: 2000, sort: 'scenes_count', direction: 'DESC' }, blocked),
  ])
  const scenes = scenesRaw.findScenes.scenes
  const byTag = new Map<string, Scene[]>()
  for (const s of scenes) for (const t of s.tags) (byTag.get(t.id) ?? byTag.set(t.id, []).get(t.id)!).push(s)
  const rank = (s: Scene) => (s.rating100 ?? 50) + Math.min(s.play_count ?? 0, 10) * 3
  const used = new Set<string>()
  // A category's picture comes from a video that is Unlisted for no reason the category does not
  // share: an Unlisted category shows its own videos, any other avoids Unlisted ones.
  const u = blocked.unlisted
  const fits = (s: Scene, t: string) => !u || withinReasons(unlistedReasons(s, u), new Set(u.tags.includes(t) ? [`tag:${t}`] : []))
  return tagsRaw.items.map((t: TagCard) => {
    const pool = (byTag.get(t.id) ?? []).filter((s) => fits(s, t.id)).sort((a, b) => rank(b) - rank(a))
    const pick = pool.find((s) => !used.has(s.id)) ?? pool[0]
    if (pick) used.add(pick.id)
    return { id: t.id, name: t.name, sceneCount: t.sceneCount, favorite: t.favorite, image: pick ? mediaUrl(pick.paths.screenshot) : null }
  })
}

// --- artwork ----------------------------------------------------------------------------

// Every generated image and clip the app shows, as /media/stash URLs (the nightly warm).
export async function allArtwork(): Promise<string[]> {
  const all = '{ per_page: -1 }'
  const r = await gql<Pick<Query, 'findScenes' | 'findPerformers' | 'findStudios'>>(`{
    findScenes(filter: ${all}) { scenes { paths { screenshot preview vtt } } }
    findPerformers(filter: ${all}) { performers { image_path } }
    findStudios(filter: ${all}) { studios { image_path } }
  }`)
  return [
    ...r.findScenes.scenes.flatMap((s) => [s.paths.screenshot, s.paths.preview, s.paths.vtt]),
    ...r.findPerformers.performers.map((p) => p.image_path),
    ...r.findStudios.studios.map((s) => s.image_path),
  ]
    .map(mediaUrl)
    .filter((u): u is string => !!u)
}

// --- Whisparr bridge ----------------------------------------------------------------------

// A performer's or studio's StashDB ids (several when StashDB merged duplicates): the key
// Whisparr files its scenes under.
export async function stashIdsOf(kind: 'performer' | 'studio', id: string): Promise<string[]> {
  if (kind === 'performer') {
    const d = await query<Pick<Query, 'findPerformer'>>(`query($id: ID!) { findPerformer(id: $id) { stash_ids { stash_id } } }`, { id }, ['performer', `performer:${id}`])
    return d.findPerformer?.stash_ids.map((s) => s.stash_id) ?? []
  }
  const d = await query<Pick<Query, 'findStudio'>>(`query($id: ID!) { findStudio(id: $id) { stash_ids { stash_id } } }`, { id }, ['studio', `studio:${id}`])
  return d.findStudio?.stash_ids.map((s) => s.stash_id) ?? []
}

// The favourite performers' StashDB ids, for "new from your favourites" that is not downloaded.
export async function favoritePerformerStashIds(): Promise<string[]> {
  const d = await query<Pick<Query, 'findPerformers'>>(
    `{ findPerformers(filter: { per_page: -1 }, performer_filter: { filter_favorites: true }) { performers { stash_ids { stash_id } } } }`,
    {},
    ['performer'],
  )
  return d.findPerformers.performers.flatMap((p) => p.stash_ids.map((s) => s.stash_id))
}

// The favourite performers with their StashDB ids, for the follow sync (sync.ts). Uncached, so
// it throws when Stash is down: the sync then skips its run rather than read "no favourites".
export async function favoritePerformers(): Promise<{ id: string; name: string; stashIds: string[] }[]> {
  const d = await gql<Pick<Query, 'findPerformers'>>(
    `{ findPerformers(filter: { per_page: -1 }, performer_filter: { filter_favorites: true }) { performers { id name stash_ids { stash_id } } } }`,
  )
  return d.findPerformers.performers.map((p) => ({ id: p.id, name: p.name, stashIds: p.stash_ids.map((s) => s.stash_id) }))
}

// The favourite studios with their StashDB ids, for the follow sync; uncached like the above.
export async function favoriteStudios(): Promise<{ id: string; name: string; stashIds: string[] }[]> {
  const d = await gql<Pick<Query, 'findStudios'>>(
    `{ findStudios(filter: { per_page: -1 }, studio_filter: { favorite: true }) { studios { id name stash_ids { stash_id } } } }`,
  )
  return d.findStudios.studios.map((s) => ({ id: s.id, name: s.name, stashIds: s.stash_ids.map((x) => x.stash_id) }))
}

// The library's performer, studio or tag carrying this StashDB id (Discover's "in your library"
// link), or null. Cached like any read; a new link shows after the next change check.
export async function libraryIdForStashId(kind: 'performer' | 'studio' | 'tag', stashId: string): Promise<string | null> {
  const crit = { stash_id: stashId, modifier: 'EQUALS' }
  if (kind === 'performer') {
    const d = await query<Pick<Query, 'findPerformers'>>(`query($c: StashIDCriterionInput) { findPerformers(filter: { per_page: 1 }, performer_filter: { stash_id_endpoint: $c }) { performers { id } } }`, { c: crit }, ['performer'])
    return d.findPerformers.performers[0]?.id ?? null
  }
  if (kind === 'studio') {
    const d = await query<Pick<Query, 'findStudios'>>(`query($c: StashIDCriterionInput) { findStudios(filter: { per_page: 1 }, studio_filter: { stash_id_endpoint: $c }) { studios { id } } }`, { c: crit }, ['studio'])
    return d.findStudios.studios[0]?.id ?? null
  }
  const d = await query<Pick<Query, 'findTags'>>(`query($c: StashIDCriterionInput) { findTags(filter: { per_page: 1 }, tag_filter: { stash_id_endpoint: $c }) { tags { id } } }`, { c: crit }, ['tag'])
  return d.findTags.tags[0]?.id ?? null
}

// --- Cast categories (cast.ts) ----------------------------------------------------------

// Every scene's performer genders and category ids, uncached: the Cast sync must see the library
// as it is now. Gender null: not set on the performer.
export async function castInputs(): Promise<{ id: string; tagIds: string[]; genders: (string | null)[] }[]> {
  const d = await gql<Pick<Query, 'findScenes'>>(`{ findScenes(filter: { per_page: -1 }) { scenes { id tags { id } performers { gender } } } }`)
  return d.findScenes.scenes.map((s) => ({ id: s.id, tagIds: s.tags.map((t) => t.id), genders: s.performers.map((p) => p.gender ?? null) }))
}

// The ids of these categories, creating any that are missing under `parent` (created too).
export async function ensureTags(names: string[], parent: string): Promise<Map<string, string>> {
  const find = async (ns: string[]) => {
    const d = await gql<Pick<Query, 'findTags'>>(`{ findTags(filter: { per_page: -1 }) { tags { id name } } }`)
    const wanted = new Set(ns)
    return new Map(d.findTags.tags.filter((t) => wanted.has(t.name)).map((t) => [t.name, t.id]))
  }
  const have = await find([parent, ...names])
  const create = async (name: string, parentIds: string[] = []) => {
    const c = await mutate<Pick<Mutation, 'tagCreate'>>(`mutation($i: TagCreateInput!) { tagCreate(input: $i) { id } }`, { i: { name, parent_ids: parentIds } }, ['tag'])
    return c.tagCreate!.id
  }
  const parentId = have.get(parent) ?? (await create(parent))
  const out = new Map<string, string>()
  for (const n of names) out.set(n, have.get(n) ?? (await create(n, [parentId])))
  return out
}

// Adds or removes one category on many scenes, in chunks. Lists go stale like any tag edit
// (served once more while they refresh) rather than being dropped: the Cast sync runs right after
// a scan, and dropping every scene query then threw away the warm it had just been given.
export async function bulkTag(sceneIds: string[], tagId: string, mode: 'ADD' | 'REMOVE') {
  for (let i = 0; i < sceneIds.length; i += 500) {
    await mutate(`mutation($i: BulkSceneUpdateInput!) { bulkSceneUpdate(input: $i) { id } }`, { i: { ids: sceneIds.slice(i, i + 500), tag_ids: { ids: [tagId], mode } } }, [], ['scene', 'tag'])
  }
}

// Scene counts of these categories (the Settings Cast list).
export async function tagCounts(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map()
  const d = await query<Pick<Query, 'findTags'>>(`query($ids: [ID!]) { findTags(ids: $ids, filter: { per_page: -1 }) { tags { id scene_count } } }`, { ids }, ['scene', 'tag'])
  return new Map(d.findTags.tags.map((t) => [t.id, t.scene_count ?? 0]))
}

// Library categories by their StashDB id (`sid:<uuid>`) and by lower-case name and alias
// (`name:<name>`): Discover's category pills link to the library's own. One query, cached until a
// category changes.
export async function tagLookup(): Promise<Map<string, string>> {
  const d = await query<Pick<Query, 'findTags'>>(`{ findTags(filter: { per_page: -1 }) { tags { id name aliases stash_ids { stash_id } } } }`, {}, ['tag'])
  return tagLookupOf(d)
}
const tagLookupOf = memoBy((d: Pick<Query, 'findTags'>) => {
  const m = new Map<string, string>()
  for (const t of d.findTags.tags) {
    for (const s of t.stash_ids ?? []) m.set(`sid:${s.stash_id}`, t.id)
    for (const n of [t.name, ...(t.aliases ?? [])]) if (!m.has(`name:${n.toLowerCase()}`)) m.set(`name:${n.toLowerCase()}`, t.id)
  }
  return m
})

// Stash's stash-box endpoints with their keys: StashDB's catalogue is queried with Stash's own
// credentials unless flix has its own (config.stashdb). Uncached and never logged.
export const stashBoxes = async () => (await gql<Pick<Query, 'configuration'>>('{ configuration { general { stashBoxes { name endpoint api_key } } } }')).configuration.general.stashBoxes

// Every library scene's StashDB id → Stash scene id, to tell "already here" from "missing"
// when StashDB lists a performer's or studio's scenes. PINNED: every shelf page reads it.
// Tagged `library`, not `scene`: a play or a rating does not move a StashDB id, and as `scene`
// every progress save made the next Discover page (or the Waiting tab's 10 s poll) refetch the
// whole library (_until 2026-11-09_). A scan or Identify expires it through change detection; a
// delete drops it. The Map is built once per fetched answer, not on every call.
export async function sceneStashIdMap(): Promise<Map<string, string>> {
  const d = await query<Pick<Query, 'findScenes'>>('{ findScenes(filter: { per_page: -1 }) { scenes { id stash_ids { stash_id } } } }', {}, ['library', PINNED])
  return stashIdMapOf(d)
}
const stashIdMapOf = memoBy((d: Pick<Query, 'findScenes'>) => {
  const map = new Map<string, string>()
  for (const s of d.findScenes.scenes) for (const x of s.stash_ids) map.set(x.stash_id, s.id)
  return map
})
