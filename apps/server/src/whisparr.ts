import { config } from './config.ts'

// Whisparr v3 (Radarr-based): just enough to delete a scene's file and keep it from coming back.

interface Movie {
  id: number
  title: string
  path: string
  movieFile?: { relativePath: string }
}

const TIMEOUT = 60_000 // ms

async function call<T>(method: 'GET' | 'DELETE', path: string): Promise<T> {
  const w = config.whisparr
  if (!w) throw new Error('Whisparr is not configured')
  const res = await fetch(`${w.url}/api/v3${path}`, {
    method,
    headers: { 'X-Api-Key': w.apiKey },
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch((e: Error) => {
    throw new Error(e.name === 'TimeoutError' ? `Whisparr: no answer in ${TIMEOUT / 1000} s` : `Whisparr: ${e.message}`)
  })
  if (!res.ok) throw new Error(`Whisparr HTTP ${res.status} on ${method} ${path.split('?')[0]}`)
  return (method === 'GET' ? await res.json() : undefined) as T
}

function toWhisparrPath(stashPath: string): string {
  for (const [from, to] of config.whisparr?.pathMap ?? []) {
    if (stashPath.startsWith(`${from}/`)) return to + stashPath.slice(from.length)
  }
  return stashPath
}

const fileOf = (m: Movie) => (m.movieFile ? `${m.path.replace(/\/$/, '')}/${m.movieFile.relativePath}` : null)

const UUID = /\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi

// The full movie list is ~25 MB; keep it briefly so a bulk delete fetches it once.
let everything: { at: number; movies: Movie[] } | null = null

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
  if (!everything || Date.now() - everything.at > 60_000) everything = { at: Date.now(), movies: await call<Movie[]>('GET', '/movie') }
  return everything.movies.find((m) => fileOf(m) === want) ?? null
}

// Deletes the entry with its folder and files, and adds an import exclusion so no search
// grabs it again.
export async function deleteMovie(id: number) {
  await call('DELETE', `/movie/${id}?deleteFiles=true&addImportExclusion=true`)
  everything = null
}
