import type { WantedScene } from '@flix/shared'
import { VOLATILE } from './cache/memory.ts'
import { config } from './config.ts'
import { dataCache, stashBoxes } from './stash.ts'

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

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const b = await stashBox()
  if (!b) throw new Error('StashDB is not configured')
  const res = await fetch(b.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ApiKey: b.apiKey },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch((e: Error) => {
    throw new Error(e.name === 'TimeoutError' ? `StashDB: no answer in ${TIMEOUT / 1000} s` : `StashDB: ${e.message}`)
  })
  if (!res.ok) throw new Error(`StashDB HTTP ${res.status}`)
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (body.errors?.length) throw new Error(`StashDB: ${body.errors.map((e) => e.message).join('; ')}`)
  return body.data as T
}

const cached = <T>(key: string, load: () => Promise<T>) => dataCache.get(`stashdb:${key}`, TTL, ['stashdb', VOLATILE], load)

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

// The widest cover StashDB has; the shelf hotlinks it.
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
    image: cover(s.images),
    runtime: s.duration ? Math.round(s.duration / 60) : null,
    state: 'remote',
  }
}

export const isStashDbId = (id: unknown): id is string => typeof id === 'string' && UUID.test(id)
