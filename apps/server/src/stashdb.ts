import type { WantedScene } from '@flix/shared'
import { config } from './config.ts'
import { remoteImageUrl } from './remote.ts'
import { dataCache } from './cache/data.ts'
import { UpstreamError } from './errors.ts'
import { stashBoxes } from './stash.ts'

// StashDB (stash-box) is the catalogue: every scene a performer or studio has, whether or not
// Whisparr lists it. flix reads it with Stash's own stash-box credentials (Stash already holds a
// key for identifying scenes) unless STASHDB_URL / STASHDB_API_KEY say otherwise. Reads only;
// fetching a scene goes through Whisparr (whisparr.ts), one scene at a time.

interface Box {
  endpoint: string
  apiKey: string
}

export interface SdbScene {
  id: string
  title: string | null
  release_date: string | null
  duration: number | null
  studio: { id: string; name: string } | null
  performers: { performer: { id: string; name: string }; as: string | null }[]
  images: { url: string; width: number; height: number }[]
}

const TIMEOUT = 30_000 // ms
const PAGE = 24
const TTL = 10 * 60_000 // StashDB changes slowly, and the shelf is re-read on every page view
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let box: Promise<Box | null> | undefined

// Where StashDB is and how to speak to it. Resolved once; a Stash without a StashDB entry (or
// with an empty key) leaves the shelf on Whisparr's list alone.
export function stashBox(): Promise<Box | null> {
  box ??= (async () => {
    if (config.stashdb.url && config.stashdb.apiKey) return { endpoint: config.stashdb.url, apiKey: config.stashdb.apiKey }
    try {
      const boxes = await stashBoxes()
      const hit = boxes.find((b) => /stashdb\.org/.test(b.endpoint)) ?? boxes[0]
      if (!hit?.api_key) return null
      return { endpoint: config.stashdb.url ?? hit.endpoint, apiKey: hit.api_key }
    } catch (e) {
      console.error('stashdb: could not read the stash-box settings from Stash:', (e as Error).message)
      return null
    }
  })()
  return box
}

// For tests: forget the resolved endpoint.
export const resetStashBox = () => {
  box = undefined
}

export const available = async () => !!(await stashBox())

// StashDB's website, for links that open a scene there: the GraphQL endpoint's origin.
export async function webUrl(): Promise<string | null> {
  const b = await stashBox().catch(() => null)
  if (!b) return null
  try {
    return new URL(b.endpoint).origin
  } catch {
    return null
  }
}

// Every StashDB request goes through this one queue: one at a time, at least MIN_GAP apart,
// backing off on 429/503 (Retry-After when given), and pausing all calls after repeated
// failures. StashDB is a community service; flix must never be the reason it is slow.
const MIN_GAP = 1_100 // ms between request starts
const BACKOFF = [5_000, 15_000, 60_000] // ms, when StashDB asks to slow down and gives no Retry-After
const TRIP_AFTER = 5 // consecutive failures
const PAUSE = 5 * 60_000 // ms
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const limiter = { requests: 0, throttled: 0, failures: 0, consecutive: 0, pausedUntil: 0, lastError: null as string | null, since: new Date().toISOString() }
let lane: Promise<unknown> = Promise.resolve()
let lastStart = 0

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = lane.then(async () => {
    if (Date.now() < limiter.pausedUntil) throw new UpstreamError('stashdb', `StashDB calls paused until ${new Date(limiter.pausedUntil).toISOString()} after repeated failures`)
    const wait = lastStart + MIN_GAP - Date.now()
    if (wait > 0) await sleep(wait)
    lastStart = Date.now()
    return job()
  })
  lane = run.catch(() => {})
  return run
}

async function send(b: Box, body: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    limiter.requests++
    const res = await fetch(b.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ApiKey: b.apiKey, 'User-Agent': 'flix (single-user library front end; rate-limited)' },
      body,
      signal: AbortSignal.timeout(TIMEOUT),
    }).catch((e: Error) => {
      throw new UpstreamError('stashdb', e.name === 'TimeoutError' ? `StashDB: no answer in ${TIMEOUT / 1000} s` : `StashDB: ${e.message}`)
    })
    if ((res.status !== 429 && res.status !== 503) || attempt >= BACKOFF.length) return res
    limiter.throttled++
    const after = Number(res.headers.get('retry-after'))
    await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 120_000) : BACKOFF[attempt])
    lastStart = Date.now()
  }
}

// StashDB answered, and said no. `counts`: whether it counts toward the pause. Only StashDB not
// answering (a transport error or timeout, thrown by send), HTTP 5xx and 429 do. A query its
// schema rejects (HTTP 4xx such as 422, or GraphQL validation errors) is flix's own mistake: the
// reason is surfaced and recorded, and the next call goes out as usual (_until 2026-11-10 five
// rejections paused every StashDB call for five minutes_).
class StashDbRefusal extends UpstreamError {
  counts: boolean
  constructor(message: string, counts: boolean) {
    super('stashdb', message)
    this.counts = counts
  }
}
type GqlError = { message: string; extensions?: { code?: string } }
// Exported for tests.
export const countsTowardPause = (e: unknown) => !(e instanceof StashDbRefusal) || e.counts
const isValidation = (e: GqlError) => e.extensions?.code === 'GRAPHQL_VALIDATION_FAILED' || e.extensions?.code === 'GRAPHQL_PARSE_FAILED'

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const b = await stashBox()
  if (!b) throw new Error('StashDB is not configured')
  return enqueue(async () => {
    try {
      const res = await send(b, JSON.stringify({ query, variables }))
      // A query StashDB's schema rejects comes back 422 with the reason in the body; keep it.
      const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: GqlError[] }
      if (!res.ok) throw new StashDbRefusal(`StashDB HTTP ${res.status}${body.errors?.length ? `: ${body.errors[0].message}` : ''}`, res.status >= 500 || res.status === 429)
      if (body.errors?.length) throw new StashDbRefusal(`StashDB: ${body.errors.map((e) => e.message).join('; ')}`, !body.errors.every(isValidation))
      limiter.consecutive = 0
      return body.data as T
    } catch (e) {
      limiter.failures++
      limiter.lastError = (e as Error).message
      if (countsTowardPause(e) && ++limiter.consecutive >= TRIP_AFTER) {
        limiter.pausedUntil = Date.now() + PAUSE
        limiter.consecutive = 0
      }
      throw e
    }
  })
}

// For maintenance: what a StashDB type accepts or returns (an introspection query, read-only).
export async function describeType(name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new RangeError('a GraphQL type name is required')
  const d = await gql<{ __type: unknown }>(
    `query($n: String!) { __type(name: $n) { name kind fields { name args { name type { name kind ofType { name kind } } } type { name kind ofType { name kind ofType { name kind } } } } inputFields { name type { name kind ofType { name kind ofType { name } } } } enumValues { name } } }`,
    { n: name },
  )
  return d.__type
}

// A page is ~8 KB, so it goes into the snapshot like any query; as VOLATILE (_until
// 2026-10-31_) the pages competed with the facets and tiles for the volatile cap.
const cached = <T>(key: string, load: () => Promise<T>) => dataCache.get(`stashdb:${key}`, TTL, ['stashdb'], load)

export interface ScenePage {
  scenes: SdbScene[]
  count: number
  page: number
  hasMore: boolean
}

const SCENE = `id title release_date duration studio { id name } performers { performer { id name } as } images { url width height }`

// A performer's or studio's scenes, newest first, one page at a time. Several ids on one side
// are OR'd (StashDB merged duplicates, Stash kept both ids).
export async function scenesOf(by: { performers?: string[]; studios?: string[] }, page = 1): Promise<ScenePage> {
  const perf = (by.performers ?? []).filter((id) => UUID.test(id))
  const stud = (by.studios ?? []).filter((id) => UUID.test(id))
  if (!perf.length && !stud.length) return { scenes: [], count: 0, page, hasMore: false }
  const input: Record<string, unknown> = { page, per_page: PAGE, sort: 'DATE', direction: 'DESC' }
  if (perf.length) input.performers = { value: perf, modifier: 'INCLUDES' }
  if (stud.length) input.studios = { value: stud, modifier: 'INCLUDES' }
  return cached(JSON.stringify(input), async () => {
    const d = await gql<{ queryScenes: { count: number; scenes: SdbScene[] } }>(
      `query($input: SceneQueryInput!) { queryScenes(input: $input) { count scenes { ${SCENE} } } }`,
      { input },
    )
    const { count, scenes } = d.queryScenes
    return { scenes, count, page, hasMore: page * PAGE < count }
  })
}

// The widest cover StashDB has; the proxy resizes it (remote.ts), so the shelf never hotlinks.
const cover = (images: SdbScene['images']) => images.reduce<SdbScene['images'][number] | null>((best, i) => (!best || i.width > best.width ? i : best), null)?.url ?? null

// A StashDB scene as a shelf card that nothing has fetched yet.
export function toRemote(s: SdbScene): WantedScene {
  return {
    whisparrId: null,
    stashdbId: s.id,
    title: s.title || 'Untitled',
    date: s.release_date ? s.release_date.slice(0, 10) : null,
    studio: s.studio?.name ?? null,
    performers: s.performers.map((p) => p.as || p.performer.name),
    image: remoteImageUrl(cover(s.images)),
    runtime: s.duration ? Math.round(s.duration / 60) : null,
    state: 'remote',
  }
}

export const isStashDbId = (id: unknown): id is string => typeof id === 'string' && UUID.test(id)

// --- the mirror's reads (catalog.ts) ---------------------------------------------------------
// Everything below goes through the same rate-limited queue; catalog.ts decides when to ask.

export interface SdbSceneFull extends Omit<SdbScene, 'performers'> {
  code: string | null
  details: string | null
  created: string | null
  updated: string | null
  performers: { performer: { id: string; name: string; disambiguation: string | null }; as: string | null }[]
  tags: { id: string; name: string }[]
}
const SCENE_FULL = `id title release_date duration code details created updated studio { id name } performers { performer { id name disambiguation } as } tags { id name } images { url width height }`

export type SceneSort = 'DATE' | 'CREATED_AT' | 'UPDATED_AT' | 'TRENDING' | 'POPULARITY' | 'TITLE'
export interface SceneQuery {
  text?: string
  performers?: string[] // all of them (INCLUDES_ALL)
  studios?: string[] // any of them (INCLUDES)
  tags?: string[] // all of them (INCLUDES_ALL)
  sort: SceneSort
  page: number
  perPage: number
}

export function sceneInput(q: SceneQuery): Record<string, unknown> {
  const input: Record<string, unknown> = { page: q.page, per_page: q.perPage, sort: q.sort, direction: q.sort === 'TITLE' ? 'ASC' : 'DESC' }
  if (q.text?.trim()) input.text = q.text.trim()
  const ids = (xs?: string[]) => (xs ?? []).filter((id) => UUID.test(id))
  if (ids(q.performers).length) input.performers = { value: ids(q.performers), modifier: 'INCLUDES_ALL' }
  if (ids(q.studios).length) input.studios = { value: ids(q.studios), modifier: 'INCLUDES' }
  if (ids(q.tags).length) input.tags = { value: ids(q.tags), modifier: 'INCLUDES_ALL' }
  return input
}

export async function queryScenes(q: SceneQuery): Promise<{ count: number; scenes: SdbSceneFull[] }> {
  const d = await gql<{ queryScenes: { count: number; scenes: SdbSceneFull[] } }>(
    `query($input: SceneQueryInput!) { queryScenes(input: $input) { count scenes { ${SCENE_FULL} } } }`,
    { input: sceneInput(q) },
  )
  return d.queryScenes
}

export interface SdbEntity {
  kind: 'performer' | 'studio' | 'tag'
  id: string
  name: string
  disambiguation: string | null
  image: string | null
  parentId: string | null
  parentName: string | null
  sceneCount: number | null
}
type Img = { url: string; width: number; height: number }[]
const widest = (images?: Img | null) => (images ?? []).reduce<Img[number] | null>((b, i) => (!b || i.width > b.width ? i : b), null)?.url ?? null

const PERFORMER = `id name disambiguation scene_count images { url width height }`
const STUDIO = `id name parent { id name } images { url width height }`
const TAG = `id name`
type RawPerformer = { id: string; name: string; disambiguation: string | null; scene_count: number | null; images: Img }
type RawStudio = { id: string; name: string; parent: { id: string; name: string } | null; images: Img }
type RawTag = { id: string; name: string }
const fromPerformer = (p: RawPerformer): SdbEntity => ({ kind: 'performer', id: p.id, name: p.name, disambiguation: p.disambiguation, image: widest(p.images), parentId: null, parentName: null, sceneCount: p.scene_count })
const fromStudio = (s: RawStudio): SdbEntity => ({ kind: 'studio', id: s.id, name: s.name, disambiguation: null, image: widest(s.images), parentId: s.parent?.id ?? null, parentName: s.parent?.name ?? null, sceneCount: null })
const fromTag = (t: RawTag): SdbEntity => ({ kind: 'tag', id: t.id, name: t.name, disambiguation: null, image: null, parentId: null, parentName: null, sceneCount: null })

// Name search for the filter pickers (a few per term; the caller caches by term).
export async function searchEntities(kind: SdbEntity['kind'], term: string, limit = 12): Promise<SdbEntity[]> {
  const t = term.trim().slice(0, 100)
  if (!t) return []
  // searchPerformers returns { count performers facets } since StashDB's 2026-11 schema (was a bare list).
  if (kind === 'performer') return (await gql<{ searchPerformers: { performers: RawPerformer[] } }>(`query($t: String!, $l: Int) { searchPerformers(term: $t, limit: $l) { performers { ${PERFORMER} } } }`, { t, l: limit })).searchPerformers.performers.map(fromPerformer)
  if (kind === 'studio') return (await gql<{ searchStudio: RawStudio[] }>(`query($t: String!, $l: Int) { searchStudio(term: $t, limit: $l) { ${STUDIO} } }`, { t, l: limit })).searchStudio.map(fromStudio)
  return (await gql<{ searchTag: RawTag[] }>(`query($t: String!, $l: Int) { searchTag(term: $t, limit: $l) { ${TAG} } }`, { t, l: limit })).searchTag.map(fromTag)
}

// The one entity a term names exactly, for the pickers: a category by name or alias, a studio by
// name. Performers have no lookup by name (their search ranks exact names well enough).
export async function findByName(kind: SdbEntity['kind'], name: string): Promise<SdbEntity | null> {
  const n = name.trim().slice(0, 100)
  if (!n || kind === 'performer') return null
  if (kind === 'studio') {
    const s = (await gql<{ findStudio: RawStudio | null }>(`query($n: String!) { findStudio(name: $n) { ${STUDIO} } }`, { n })).findStudio
    return s ? fromStudio(s) : null
  }
  const t = (await gql<{ findTagOrAlias: RawTag | null }>(`query($n: String!) { findTagOrAlias(name: $n) { ${TAG} } }`, { n })).findTagOrAlias
  return t ? fromTag(t) : null
}

// One scene's description (Discover's About), for a mirror row stored before descriptions were.
export async function sceneDetails(id: string): Promise<string | null> {
  if (!UUID.test(id)) return null
  const d = await gql<{ findScene: { details: string | null } | null }>(`query($id: ID!) { findScene(id: $id) { details } }`, { id })
  return d.findScene ? (d.findScene.details ?? '') : null
}

export async function findEntity(kind: SdbEntity['kind'], id: string): Promise<SdbEntity | null> {
  if (!UUID.test(id)) return null
  if (kind === 'performer') {
    const p = (await gql<{ findPerformer: RawPerformer | null }>(`query($id: ID!) { findPerformer(id: $id) { ${PERFORMER} } }`, { id })).findPerformer
    return p ? fromPerformer(p) : null
  }
  if (kind === 'studio') {
    const s = (await gql<{ findStudio: RawStudio | null }>(`query($id: ID!) { findStudio(id: $id) { ${STUDIO} } }`, { id })).findStudio
    return s ? fromStudio(s) : null
  }
  const t = (await gql<{ findTag: RawTag | null }>(`query($id: ID!) { findTag(id: $id) { ${TAG} } }`, { id })).findTag
  return t ? fromTag(t) : null
}

export const widestImage = widest
