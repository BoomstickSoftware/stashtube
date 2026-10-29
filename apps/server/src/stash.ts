// Stash GraphQL client and the mapping from Stash shapes to the flix API contract.
// Everything Stash-specific stays in this file.
import type {
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
  TagTile,
} from '@flix/shared'
import { MemoryCache } from './cache/memory.ts'
import { config } from './config.ts'
import { signScene } from './signing.ts'

export class StashError extends Error {}

// Every request flix makes to Stash, by kind, since start: the load the caches did not absorb.
export const upstream = { queries: 0, mutations: 0, assets: 0, streams: 0, changeChecks: 0 }

export const dataCache = new MemoryCache({
  maxEntries: config.cache.dataMaxEntries,
  staleFor: config.cache.dataStaleFor,
})

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
    if (!res.ok) throw new StashError(`Stash HTTP ${res.status}`)
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] }
    if (!body.errors?.length) return body.data as T
    const message = body.errors.map((e) => e.message).join('; ')
    if (!/database is locked/.test(message) || attempt >= LOCK_RETRIES.length) throw new StashError(message)
    await new Promise((r) => setTimeout(r, LOCK_RETRIES[attempt]))
  }
}

const LOCK_RETRIES = [250, 500, 1000, 2000] // ms between attempts

// Cached read. Tags name what a write must drop: 'scene' for anything showing scene data,
// 'scene:<id>' for one scene; same for performer, studio, tag. 'activity:play' and
// 'activity:resume' mark results that depend on play counts or resume points.
function query<T>(q: string, variables: Record<string, unknown>, tags: string[], ttl = config.cache.dataTtl): Promise<T> {
  return dataCache.get(JSON.stringify([q, variables]), ttl, tags, () => gql<T>(q, variables))
}

// Write, then drop the cached results it changes. `expires` names results that it changes
// only slightly (a progress bar on a card): they stay, served once more while they refresh.
async function mutate(q: string, variables: Record<string, unknown>, invalidates: string[], expires: string[] = []) {
  const d = await gql<Raw>(q, variables)
  dataCache.invalidate(...invalidates)
  if (expires.length) dataCache.expire(...expires)
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
export const stashVersion = () => gql<Raw>('{ version { version } }')

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

async function checkForChanges() {
  lastCheck = Date.now()
  const d = await gql<Raw>(`{
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
  if (lastFingerprint !== null && fp !== lastFingerprint) {
    console.log('stash data changed; refreshing cached queries')
    dataCache.expire()
    for (const fn of changeListeners) fn()
  }
  lastFingerprint = fp
}

const changeListeners: (() => void)[] = []
// Runs after a change in Stash marked the cache stale (e.g. to re-warm the home feed).
export function onStashChange(fn: () => void) {
  changeListeners.push(fn)
}

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

const SCENE_CARD = `
  id title date created_at rating100 play_count o_counter resume_time last_played_at
  files { path duration width height }
  paths { screenshot preview vtt }
  studio { id name image_path }
  performers { id name image_path }
`

const SCENE_DETAIL = `
  ${SCENE_CARD}
  details code director urls
  tags { id name }
  files { size format video_codec audio_codec bit_rate frame_rate }
  scene_markers { id seconds end_seconds title primary_tag { name } }
`

const PERFORMER_CARD = `id name image_path scene_count favorite rating100 gender country`
// depth -1: a network counts its studios' videos
const STUDIO_CARD = `id name image_path scene_count(depth: -1) favorite parent_studio { id name }`
const TAG_CARD = `id name scene_count favorite`

// --- mappers --------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any

const ref = (r: Raw, imageKey = 'image_path'): Ref => ({
  id: r.id,
  name: r.name,
  image: mediaUrl(r[imageKey]),
})

function sceneTitle(s: Raw): string {
  if (s.title) return s.title
  const path: string | undefined = s.files?.[0]?.path
  return path ? path.split('/').pop()!.replace(/\.[^.]+$/, '') : `Scene ${s.id}`
}

export function toSceneCard(s: Raw): SceneCard {
  const f = s.files?.[0] ?? {}
  return {
    id: s.id,
    title: sceneTitle(s),
    date: s.date ?? null,
    durationSec: f.duration ?? 0,
    width: f.width ?? 0,
    height: f.height ?? 0,
    rating: stars(s.rating100),
    playCount: s.play_count ?? 0,
    oCount: s.o_counter ?? 0,
    resumeTime: s.resume_time ?? 0,
    lastPlayedAt: s.last_played_at ?? null,
    createdAt: s.created_at,
    studio: s.studio ? ref(s.studio) : null,
    performers: (s.performers ?? []).map((p: Raw) => ref(p)),
    screenshot: mediaUrl(s.paths?.screenshot)!,
    preview: mediaUrl(s.paths?.preview),
    vtt: mediaUrl(s.paths?.vtt),
  }
}

function toSceneDetail(s: Raw): Omit<SceneDetail, 'playlists'> {
  const markers = (s.scene_markers ?? [])
    .map((m: Raw) => ({ id: m.id, seconds: m.seconds, endSeconds: m.end_seconds ?? null, title: m.title || m.primary_tag?.name || '', tag: m.primary_tag?.name ?? '' }))
    .sort((a: { seconds: number }, b: { seconds: number }) => a.seconds - b.seconds)
  const f = s.files?.[0]
  return {
    ...toSceneCard(s),
    details: s.details || null,
    code: s.code || null,
    director: s.director || null,
    urls: s.urls ?? [],
    tags: (s.tags ?? []).map((t: Raw) => ({ id: t.id, name: t.name })),
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

export const toPerformerCard = (p: Raw): PerformerCard => ({
  id: p.id,
  name: p.name,
  image: mediaUrl(p.image_path),
  sceneCount: p.scene_count ?? 0,
  favorite: !!p.favorite,
  rating: stars(p.rating100),
  gender: p.gender ?? null,
  country: p.country || null,
})

export const toStudioCard = (s: Raw): StudioCard => ({
  id: s.id,
  name: s.name,
  image: mediaUrl(s.image_path),
  sceneCount: s.scene_count ?? 0,
  favorite: !!s.favorite,
  parent: s.parent_studio ? { id: s.parent_studio.id, name: s.parent_studio.name } : null,
})

export const toTagCard = (t: Raw): TagCard => ({
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
}

// Performer attributes a scene must have: one performer of `gender` (the Settings gender)
// matching the age at filming and any of the ethnicities. `firstYear` is the earliest scene date.
export interface People {
  gender: Raw | null
  firstYear: number
  minAge?: number
  maxAge?: number
  ethnicities?: string[]
}

// Joins filters with OR (Stash nests them: a OR (b OR (c …))).
function anyOf(filters: Raw[]): Raw | null {
  if (!filters.length) return null
  return filters.reduceRight((rest: Raw | null, f) => (rest ? { ...f, OR: rest } : f), null)
}

// The scene-level criterion for `People`, or null. Stash has no "age at filming" per performer,
// so scenes are matched in release-date buckets: a scene released around date D has a performer
// aged A..B if they were born between D-(B+1)y and D-Ay, with D the middle of the bucket. One
// bucket per year (right to about six months), wider if the library spans more than
// MAX_BUCKETS years: SQLite's parser overflows on long OR chains (36 failed, 18 worked).
// Contains OR, so it goes last in an AND chain.
const MAX_BUCKETS = 16
function peopleCriterion(p: People | undefined): Raw | null {
  if (!p || (!p.minAge && !p.maxAge && !p.ethnicities?.length)) return null
  const base: Raw = p.gender ? { gender: p.gender } : {}
  const who = p.ethnicities?.length ? p.ethnicities.map((e) => ({ ...base, ethnicity: { value: e, modifier: 'EQUALS' } })) : [base]
  if (!p.minAge && !p.maxAge) return { performers_filter: anyOf(who) }
  const last = new Date().getFullYear()
  const step = Math.max(1, Math.ceil((last - p.firstYear + 1) / MAX_BUCKETS))
  const buckets: Raw[] = []
  for (let y = p.firstYear; y <= last; y += step) {
    const end = y + step - 1
    const mid = (y + end + 1) / 2 // in years; .5 is July 1
    const at = (years: number) => `${Math.floor(years)}-${years % 1 ? '07' : '01'}-01`
    const born: Raw =
      p.minAge && p.maxAge
        ? { value: at(mid - p.maxAge - 1), value2: at(mid - p.minAge), modifier: 'BETWEEN' }
        : p.maxAge
          ? { value: at(mid - p.maxAge - 1), modifier: 'GREATER_THAN' }
          : { value: at(mid - p.minAge!), modifier: 'LESS_THAN' }
    buckets.push({
      date: { value: `${y}-01-01`, value2: `${end}-12-31`, modifier: 'BETWEEN' },
      performers_filter: anyOf(who.map((w) => ({ ...w, birthdate: born }))),
    })
  }
  return anyOf(buckets)
}

const ids = (csv?: string) => (csv ? csv.split(',').filter(Boolean) : [])

const minResolution: Record<number, string> = {
  720: 'WEB_HD',
  1080: 'STANDARD_HD',
  2160: 'QUAD_HD',
}

// Stash allows one criterion per field per level, so each exclusion (and each extra criterion
// that may repeat a field) nests one AND deeper.
function withExclusions(filter: Raw, ex: Exclusions, extra: Raw[] = []): Raw {
  const parts: Raw[] = [...extra]
  const people = peopleCriterion(ex.people)
  if (ex.tags.length) parts.push({ tags: { value: ex.tags, modifier: 'EXCLUDES', depth: -1 } })
  if (ex.performers.length) parts.push({ performers: { value: ex.performers, modifier: 'EXCLUDES' } })
  if (ex.studios.length) parts.push({ studios: { value: ex.studios, modifier: 'EXCLUDES', depth: -1 } })
  // last: it may hold an OR, and Stash allows no AND beside an OR
  if (people) parts.push(people)
  let node = filter
  for (const p of parts) {
    node.AND = p
    node = p
  }
  return filter
}

export function sceneFilter(q: SceneQuery, blocked: Exclusions): Raw {
  const f: Raw = {}
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
  const extra: Raw[] = []
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

  const ex: Exclusions = q.unblocked ? { tags: [], performers: [], studios: [] } : { ...blocked }
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
  return withExclusions(f, ex, extra)
}

export function findFilter(q: {
  q?: string
  sort?: string
  dir?: 'asc' | 'desc'
  page?: number
  perPage?: number
  seed?: number
}) {
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
  const d = await query<Raw>(
    `query { findScenes(filter: { per_page: 1, sort: "date", direction: ASC }, scene_filter: { date: { value: "1900-01-01", modifier: GREATER_THAN } }) { scenes { date } } }`,
    {},
    ['scene'],
  )
  const y = Number(d.findScenes.scenes[0]?.date?.slice(0, 4))
  return Number.isFinite(y) && y > 1900 ? y : 1970
}

export async function findScenes(filter: Raw, sceneFilter: Raw = {}) {
  const d = await query<Raw>(
    `query($f: FindFilterType, $s: SceneFilterType) {
      findScenes(filter: $f, scene_filter: $s) { count scenes { ${SCENE_CARD} } }
    }`,
    { f: filter, s: sceneFilter },
    ['scene', ...activityTags(filter, sceneFilter)],
  )
  return { total: d.findScenes.count as number, items: d.findScenes.scenes.map(toSceneCard) }
}

export async function findScenesByIds(sceneIds: string[]): Promise<SceneCard[]> {
  if (!sceneIds.length) return []
  const d = await query<Raw>(
    `query($ids: [ID!]) { findScenes(ids: $ids) { scenes { ${SCENE_CARD} } } }`,
    { ids: sceneIds },
    ['scene'],
  )
  const byId = new Map<string, SceneCard>(d.findScenes.scenes.map((s: Raw) => [s.id, toSceneCard(s)]))
  return sceneIds.map((id) => byId.get(id)).filter((s): s is SceneCard => !!s)
}

export async function getScene(id: string) {
  const d = await query<Raw>(`query($id: ID!) { findScene(id: $id) { ${SCENE_DETAIL} } }`, { id }, ['scene', `scene:${id}`])
  if (!d.findScene) return null
  return {
    scene: toSceneDetail(d.findScene),
    performerIds: d.findScene.performers.map((p: Raw) => p.id) as string[],
    studioId: (d.findScene.studio?.id ?? null) as string | null,
    tagIds: d.findScene.tags.map((t: Raw) => t.id) as string[],
  }
}

// Stash path of a scene's primary file, for direct play from the NFS mount.
export async function sceneFilePath(id: string): Promise<string | null> {
  const d = await query<Raw>(`query($id: ID!) { findScene(id: $id) { files { path } } }`, { id }, [`scene:${id}`])
  return d.findScene?.files?.[0]?.path ?? null
}

// Candidates share a performer or the studio; score favours performers, then studio,
// then tag overlap, then rating.
export async function relatedScenes(
  id: string,
  performerIds: string[],
  studioId: string | null,
  tagIds: string[],
  blocked: Exclusions,
): Promise<SceneCard[]> {
  const fields = `${SCENE_CARD} tags { id }`
  const queries: Promise<Raw>[] = []
  const notSelf = (f: Raw) => withExclusions({ ...f, id: { value: Number(id), modifier: 'NOT_EQUALS' } }, { ...blocked })
  const run = (f: Raw) =>
    query<Raw>(`query($s: SceneFilterType) { findScenes(scene_filter: $s, filter: { per_page: 40, sort: "random_7" }) { scenes { ${fields} } } }`, {
      s: notSelf(f),
    }, ['scene'])
  if (performerIds.length) queries.push(run({ performers: { value: performerIds, modifier: 'INCLUDES' } }))
  if (studioId) queries.push(run({ studios: { value: [studioId], modifier: 'INCLUDES', depth: 0 } }))
  if (tagIds.length) queries.push(run({ tags: { value: tagIds.slice(0, 20), modifier: 'INCLUDES', depth: 0 } }))
  const results = await Promise.all(queries)
  const seen = new Map<string, Raw>()
  for (const r of results) for (const s of r.findScenes.scenes) seen.set(s.id, s)
  const tagSet = new Set(tagIds)
  const perfSet = new Set(performerIds)
  const score = (s: Raw) =>
    s.performers.filter((p: Raw) => perfSet.has(p.id)).length * 10 +
    (studioId && s.studio?.id === studioId ? 4 : 0) +
    s.tags.filter((t: Raw) => tagSet.has(t.id)).length * 0.25 +
    (s.rating100 ?? 50) / 100
  return [...seen.values()]
    .sort((a, b) => score(b) - score(a))
    .slice(0, 24)
    .map(toSceneCard)
}

export async function updateSceneRating(id: string, stars: number | null) {
  await mutate(`mutation($id: ID!, $r: Int) { sceneUpdate(input: { id: $id, rating100: $r }) { id } }`, {
    id,
    r: rating100(stars),
  }, ['scene'])
}

// Plays and progress saves (every 15 s while watching) must not empty the cache: they drop
// this scene and the lists that filter or sort by activity, and only mark the rest stale.
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

export async function addSceneO(id: string) {
  const d = await mutate(`mutation($id: ID!) { sceneAddO(id: $id) { count } }`, { id }, ['scene'])
  return d.sceneAddO.count as number
}

export async function findPerformers(filter: Raw, blocked: Exclusions, extra: Raw = {}, gender: Raw = null) {
  const pf: Raw = { ...extra }
  if (blocked.performers.length) pf.id = { value: blocked.performers.map(Number), modifier: 'EXCLUDES' }
  if (gender) pf.gender = gender

  const d = await query<Raw>(
    `query($f: FindFilterType, $p: PerformerFilterType) {
      findPerformers(filter: $f, performer_filter: $p) { count performers { ${PERFORMER_CARD} } }
    }`,
    { f: filter, p: pf },
    ['performer'],
  )
  return { total: d.findPerformers.count as number, items: d.findPerformers.performers.map(toPerformerCard) }
}

export async function getPerformer(id: string): Promise<PerformerDetail | null> {
  const d = await query<Raw>(
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
    tags: (p.tags ?? []).map((t: Raw) => ({ id: t.id, name: t.name })),
  }
}

export async function setPerformerFavorite(id: string, favorite: boolean) {
  await mutate(`mutation($id: ID!, $f: Boolean) { performerUpdate(input: { id: $id, favorite: $f }) { id } }`, {
    id,
    f: favorite,
  }, ['performer', 'scene'])
}

export async function setPerformerRating(id: string, stars: number | null) {
  await mutate(`mutation($id: ID!, $r: Int) { performerUpdate(input: { id: $id, rating100: $r }) { id } }`, {
    id,
    r: rating100(stars),
  }, ['performer'])
}

export async function findStudios(filter: Raw, blocked: Exclusions) {
  const sf: Raw = {}
  if (blocked.studios.length) sf.id = { value: blocked.studios.map(Number), modifier: 'EXCLUDES' }
  const d = await query<Raw>(
    `query($f: FindFilterType, $s: StudioFilterType) {
      findStudios(filter: $f, studio_filter: $s) { count studios { ${STUDIO_CARD} } }
    }`,
    { f: filter, s: sf },
    ['studio'],
  )
  return { total: d.findStudios.count as number, items: d.findStudios.studios.map(toStudioCard) }
}

export async function getStudio(id: string): Promise<StudioDetail | null> {
  const d = await query<Raw>(
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
    children: (s.child_studios ?? []).map((c: Raw) => ref(c)),
  }
}

export async function setStudioFavorite(id: string, favorite: boolean) {
  await mutate(`mutation($id: ID!, $f: Boolean) { studioUpdate(input: { id: $id, favorite: $f }) { id } }`, {
    id,
    f: favorite,
  }, ['studio'])
}

export async function findTags(filter: Raw, blocked: Exclusions, onlyUsed = true) {
  const tf: Raw = {}
  if (onlyUsed) tf.scene_count = { value: 0, modifier: 'GREATER_THAN' }
  if (blocked.tags.length) tf.id = { value: blocked.tags.map(Number), modifier: 'EXCLUDES' }
  const d = await query<Raw>(
    `query($f: FindFilterType, $t: TagFilterType) {
      findTags(filter: $f, tag_filter: $t) { count tags { ${TAG_CARD} } }
    }`,
    { f: filter, t: tf },
    ['tag'],
  )
  return { total: d.findTags.count as number, items: d.findTags.tags.map(toTagCard) }
}

export async function getTag(id: string): Promise<TagDetail | null> {
  const d = await query<Raw>(
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
    parents: t.parents.map((p: Raw) => ({ id: p.id, name: p.name })),
    children: t.children.map((c: Raw) => ({ id: c.id, name: c.name })),
  }
}

export async function namesFor(kind: 'tag' | 'performer' | 'studio', id: string): Promise<string | null> {
  const q = {
    tag: `query($id: ID!) { x: findTag(id: $id) { name } }`,
    performer: `query($id: ID!) { x: findPerformer(id: $id) { name } }`,
    studio: `query($id: ID!) { x: findStudio(id: $id) { name } }`,
  }[kind]
  const d = await query<Raw>(q, { id }, [kind, `${kind}:${id}`])
  return d.x?.name ?? null
}

// --- edits ------------------------------------------------------------------------

export async function updateScene(id: string, patch: { title?: string; tagIds?: string[] }) {
  const input: Raw = { id }
  if (patch.title !== undefined) input.title = patch.title
  if (patch.tagIds !== undefined) input.tag_ids = patch.tagIds
  await mutate(`mutation($i: SceneUpdateInput!) { sceneUpdate(input: $i) { id } }`, { i: input }, ['scene', 'tag'])
}

// What deleting a scene needs: its files and StashDB links. Uncached, so it sees the scene as it is now.
export async function sceneForDeletion(id: string): Promise<{ title: string; paths: string[]; stashIds: string[] } | null> {
  const d = await gql<Raw>(`query($id: ID!) { findScene(id: $id) { id title files { path } stash_ids { stash_id } } }`, { id })
  const s = d.findScene
  if (!s) return null
  return { title: sceneTitle(s), paths: s.files.map((f: Raw) => f.path), stashIds: s.stash_ids.map((x: Raw) => x.stash_id) }
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
        ['scene', 'performer', 'studio', 'tag'],
      )
      return
    } catch (e) {
      if (!/database is locked/.test((e as Error).message) || Date.now() > until) throw e
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

// Markers need a primary tag; flix's own go under "Highlight", created on first use.
async function highlightTag(): Promise<string> {
  const d = await gql<Raw>(`{ findTags(tag_filter: { name: { value: "Highlight", modifier: EQUALS } }) { tags { id } } }`)
  if (d.findTags.tags[0]) return d.findTags.tags[0].id
  const c = await mutate(`mutation { tagCreate(input: { name: "Highlight" }) { id } }`, {}, ['tag'])
  return c.tagCreate.id
}

export async function createMarker(sceneId: string, seconds: number, title: string) {
  const tag = await highlightTag()
  await mutate(
    `mutation($i: SceneMarkerCreateInput!) { sceneMarkerCreate(input: $i) { id } }`,
    { i: { scene_id: sceneId, seconds, title, primary_tag_id: tag } },
    [`scene:${sceneId}`],
  )
}

export async function updateMarker(sceneId: string, id: string, title: string) {
  await mutate(`mutation($i: SceneMarkerUpdateInput!) { sceneMarkerUpdate(input: $i) { id } }`, { i: { id, title } }, [`scene:${sceneId}`])
}

export async function deleteMarker(sceneId: string, id: string) {
  await mutate(`mutation($id: ID!) { sceneMarkerDestroy(id: $id) }`, { id }, [`scene:${sceneId}`])
}

// Look one scene up on StashDB with the merge rules the NAS docs record for Identify
// (merge title, date, details, studio, performers, tags; create missing; skip ambiguous).
export async function identifyScene(id: string): Promise<string> {
  const field = (f: string, createMissing = false) => ({ field: f, strategy: 'MERGE', createMissing })
  const d = await mutate(
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

export async function jobStatus(id: string): Promise<JobStatus | null> {
  const d = await gql<Raw>(`query($id: ID!) { findJob(input: { id: $id }) { id status progress error } }`, { id })
  const j = d.findJob
  if (!j) return null
  if (j.status === 'FINISHED') dataCache.invalidate('scene', 'performer', 'studio', 'tag')
  return { id: j.id, status: j.status, progress: j.progress ?? null, error: j.error ?? null }
}

// --- activity: history, stats, recommendations ---------------------------------------

// Every scene you have touched: played, rated or O'd. One cached query feeds history,
// stats and "For you".
async function activityScenes(): Promise<Raw[]> {
  const d = await query<Raw>(
    `query { findScenes(
      filter: { per_page: -1, sort: "last_played_at", direction: DESC },
      scene_filter: {
        play_count: { value: 0, modifier: GREATER_THAN },
        OR: { rating100: { value: 0, modifier: GREATER_THAN }, OR: { o_counter: { value: 0, modifier: GREATER_THAN } } }
      }
    ) { scenes { ${SCENE_CARD} play_duration play_history performers { gender } tags { id name scene_count } } } }`,
    {},
    ['scene', 'activity:play'],
  )
  return d.findScenes.scenes
}

const weight = (s: Raw) => (s.play_count ?? 0) + 2 * (s.o_counter ?? 0) + (s.rating100 ? (s.rating100 / 20 - 3) * 1.5 : 0)

export async function history(limit = 300): Promise<HistoryEntry[]> {
  const scenes = await activityScenes()
  const out: HistoryEntry[] = []
  for (const s of scenes) {
    const card = toSceneCard(s)
    for (const t of s.play_history ?? []) out.push({ playedAt: t, scene: card })
  }
  return out.sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, limit)
}

export async function removeFromHistory(id: string) {
  await mutate(`mutation($id: ID!) { sceneResetPlayCount(id: $id) }`, { id }, ['scene'])
  await mutate(`mutation($id: ID!) { sceneResetActivity(id: $id, reset_resume: true, reset_duration: true) }`, { id }, ['scene'])
}

export async function stats(showGender: (g: string | null) => boolean): Promise<Stats> {
  const scenes = await activityScenes()
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
    s.performers.forEach((p: Raw) => showGender(p.gender) && add(perf, ref(p), n))
    if (s.studio) add(studios, ref(s.studio), n)
    s.tags.forEach((t: Raw) => add(tags, { id: t.id, name: t.name }, n))
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
export async function recommendations(blocked: Exclusions, showGender: (g: string | null) => boolean) {
  const scenes = await activityScenes()
  if (!scenes.length) return null
  const totalRaw = await query<Raw>(`{ findScenes(filter: { per_page: 0 }) { count } }`, {}, ['scene'])
  const total = totalRaw.findScenes.count as number
  const pAff = new Map<string, { ref: Ref; w: number; gender: string | null }>()
  const sAff = new Map<string, number>()
  const tAff = new Map<string, number>()
  for (const s of scenes) {
    const w = weight(s)
    if (w <= 0) continue
    s.performers.forEach((p: Raw) => {
      const e = pAff.get(p.id) ?? { ref: ref(p), w: 0, gender: p.gender ?? null }
      e.w += w
      pAff.set(p.id, e)
    })
    if (s.studio) sAff.set(s.studio.id, (sAff.get(s.studio.id) ?? 0) + w)
    s.tags.forEach((t: Raw) => tAff.set(t.id, (tAff.get(t.id) ?? 0) + w * Math.log(1 + total / Math.max(1, t.scene_count))))
  }
  const topIds = <T,>(m: Map<string, T>, val: (v: T) => number, n: number) =>
    [...m.entries()].sort((a, b) => val(b[1]) - val(a[1])).slice(0, n).map(([k]) => k)
  const topPerf = topIds(pAff, (v) => v.w, 8)
  const topStudios = topIds(sAff, (v) => v, 3)
  const topTags = topIds(tAff, (v) => v, 6)

  const fields = `${SCENE_CARD} tags { id }`
  const run = (f: Raw) =>
    query<Raw>(
      `query($s: SceneFilterType) { findScenes(scene_filter: $s, filter: { per_page: 60, sort: "random_11" }) { scenes { ${fields} } } }`,
      { s: withExclusions({ ...f, play_count: { value: 0, modifier: 'EQUALS' } }, { ...blocked }) },
      ['scene', 'activity:play'],
    )
  const results = await Promise.all([
    topPerf.length ? run({ performers: { value: topPerf, modifier: 'INCLUDES' } }) : null,
    topStudios.length ? run({ studios: { value: topStudios, modifier: 'INCLUDES', depth: 0 } }) : null,
    topTags.length ? run({ tags: { value: topTags, modifier: 'INCLUDES', depth: 0 } }) : null,
  ])
  const cands = new Map<string, Raw>()
  for (const r of results) for (const s of r?.findScenes.scenes ?? []) cands.set(s.id, s)
  const score = (s: Raw) =>
    s.performers.reduce((a: number, p: Raw) => a + (pAff.get(p.id)?.w ?? 0), 0) +
    (s.studio ? (sAff.get(s.studio.id) ?? 0) * 0.5 : 0) +
    s.tags.reduce((a: number, t: Raw) => a + (tAff.get(t.id) ?? 0) * 0.1, 0)
  const forYou = [...cands.values()].sort((a, b) => score(b) - score(a)).slice(0, 24).map(toSceneCard)

  // "More with …" for the two performers you return to most (gender switch applies).
  const favPerformers = topPerf
    .map((id) => pAff.get(id)!)
    .filter((p) => showGender(p.gender) && !blocked.performers.includes(p.ref.id))
    .slice(0, 2)
    .map((p) => p.ref)
  return { forYou, favPerformers }
}

// --- tag tiles ------------------------------------------------------------------------

// One representative screenshot per tag, from one query over the library: the best-rated,
// most-played scene carrying the tag that no bigger tag already used.
export async function tagTiles(blocked: Exclusions): Promise<TagTile[]> {
  const [scenesRaw, tagsRaw] = await Promise.all([
    query<Raw>(
      `query($s: SceneFilterType) { findScenes(scene_filter: $s, filter: { per_page: 3000, sort: "rating", direction: DESC }) { scenes { id rating100 play_count paths { screenshot } tags { id } } } }`,
      { s: withExclusions({}, { ...blocked }) },
      ['scene'],
    ),
    findTags({ per_page: 2000, sort: 'scenes_count', direction: 'DESC' }, blocked),
  ])
  const scenes = scenesRaw.findScenes.scenes as Raw[]
  const byTag = new Map<string, Raw[]>()
  for (const s of scenes) for (const t of s.tags) (byTag.get(t.id) ?? byTag.set(t.id, []).get(t.id)!).push(s)
  const rank = (s: Raw) => (s.rating100 ?? 50) + Math.min(s.play_count ?? 0, 10) * 3
  const used = new Set<string>()
  return tagsRaw.items.map((t: TagCard) => {
    const pool = (byTag.get(t.id) ?? []).sort((a, b) => rank(b) - rank(a))
    const pick = pool.find((s) => !used.has(s.id)) ?? pool[0]
    if (pick) used.add(pick.id)
    return { id: t.id, name: t.name, sceneCount: t.sceneCount, image: pick ? mediaUrl(pick.paths.screenshot) : null }
  })
}

// --- artwork ----------------------------------------------------------------------------

// Every generated image and clip the app shows, as /media/stash URLs (the nightly warm).
export async function allArtwork(): Promise<string[]> {
  const all = '{ per_page: -1 }'
  const r = await gql<Raw>(`{
    findScenes(filter: ${all}) { scenes { paths { screenshot preview vtt } } }
    findPerformers(filter: ${all}) { performers { image_path } }
    findStudios(filter: ${all}) { studios { image_path } }
  }`)
  return [
    ...r.findScenes.scenes.flatMap((s: Raw) => [s.paths.screenshot, s.paths.preview, s.paths.vtt]),
    ...r.findPerformers.performers.map((p: Raw) => p.image_path),
    ...r.findStudios.studios.map((s: Raw) => s.image_path),
  ]
    .map(mediaUrl)
    .filter((u): u is string => !!u)
}
