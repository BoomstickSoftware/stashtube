// The Stash GraphQL client: one uncached request (gql), cached reads (query, computed) and writes
// that drop what they change (mutate). Everything Stash-specific stays under stash/.
import { dataCache, POOL } from '../cache/data.ts'
import { RAW } from '../cache/memory.ts'
import { config } from '../config.ts'
import { UpstreamError } from '../errors.ts'
import type { Query } from '../stash.schema.ts'

// Stash did not answer, or refused: the API answers 502 with the message (errors.ts).
export class StashError extends UpstreamError {
  constructor(message: string) {
    super('stash', message)
  }
}

// Every request flix makes to Stash, by kind, since start: the load the caches did not absorb.
export const upstream = { queries: 0, mutations: 0, assets: 0, streams: 0, changeChecks: 0 }

const TIMEOUT = 60_000 // ms; a hung Stash request must not hold a page (or a shared in-flight read) forever

// Uncached; use query() for reads and mutate() for writes.
export async function gql<T>(
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
      // unreachable or timed out: an upstream failure (502), not a bug in flix (500)
      throw new StashError(e.name === 'TimeoutError' ? `no answer in ${TIMEOUT / 1000} s` : `no connection (${e.message})`)
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

// Cached read. Tags name what a write must drop: 'scene' for anything showing scene data,
// 'scene:<id>' for one scene; same for performer, studio, tag. 'activity:play' and
// 'activity:resume' mark results that depend on play counts or resume points.
export function query<T>(q: string, variables: Record<string, unknown>, tags: string[], ttl = config.cache.dataTtl): Promise<T> {
  return dataCache.get(JSON.stringify([q, variables]), ttl, [...tags, RAW], () => gql<T>(q, variables))
}

// A computed answer (facets, tiles) cached over cached reads: its loader's reads wait for
// their refresh instead of being served stale (memory.ts `freshInputs`). Not VOLATILE: the
// answers are small and go into the snapshot, so a restart answers them without Stash.
export function computed<T>(key: unknown[], tags: string[], load: () => Promise<T>, ttl = config.cache.dataTtl): Promise<T> {
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
export async function mutate<T = unknown>(q: string, variables: Record<string, unknown>, invalidates: string[], expires: string[] = []) {
  const d = await gql<T>(q, variables)
  if (invalidates.length) dataCache.invalidate(...invalidates) // none given must not mean "everything"

  if (expires.length) dataCache.expire(...expires)
  // anything that can move a Featured score leaves the pool stale, served while it refreshes
  if ([...invalidates, ...expires].some((t) => t.startsWith('scene') || t.startsWith('activity'))) dataCache.expire(POOL)
  return d
}

// Which activity tags a scene query needs, from the fields its filter or sort reads.
export function activityTags(...parts: unknown[]): string[] {
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
