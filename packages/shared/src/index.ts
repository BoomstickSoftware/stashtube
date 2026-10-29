// API contract between the flix BFF and the web app. The web app never sees Stash's
// schema; every shape here is ours, so the backend behind the BFF can change.

export interface Ref {
  id: string
  name: string
  image?: string | null
}

export interface SceneCard {
  id: string
  title: string
  date: string | null
  durationSec: number
  width: number
  height: number
  rating: number | null // 0-5 stars, half steps allowed
  playCount: number
  oCount: number
  resumeTime: number
  lastPlayedAt: string | null
  createdAt: string
  studio: Ref | null
  performers: Ref[]
  screenshot: string
  preview: string | null
  vtt: string | null
}

export interface SceneFile {
  path: string
  size: number
  container: string
  videoCodec: string
  audioCodec: string
  bitrate: number
  framerate: number
}

export interface Playback {
  direct: string // original file, byte ranges
  hls: string // hardware transcode via Stash, use when the browser cannot play `direct`
  container: string
  videoCodec: string
  audioCodec: string
}

export interface Marker {
  id: string
  seconds: number
  endSeconds: number | null
  title: string
  tag: string // primary tag name
}

export interface SceneDetail extends SceneCard {
  details: string | null
  code: string | null
  director: string | null
  urls: string[]
  tags: Ref[]
  file: SceneFile | null
  playback: Playback
  playlists: { id: number; name: string }[]
  markers: Marker[]
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  perPage: number
}

export interface PerformerCard {
  id: string
  name: string
  image: string | null
  sceneCount: number
  favorite: boolean
  rating: number | null
  gender: string | null
  country: string | null
}

export interface PerformerDetail extends PerformerCard {
  disambiguation: string | null
  aliases: string[]
  birthdate: string | null
  ethnicity: string | null
  hairColor: string | null
  eyeColor: string | null
  heightCm: number | null
  measurements: string | null
  fakeTits: string | null
  careerStart: string | null
  careerEnd: string | null
  tattoos: string | null
  piercings: string | null
  details: string | null
  urls: string[]
  tags: Ref[]
}

export interface StudioCard {
  id: string
  name: string
  image: string | null
  sceneCount: number
  favorite: boolean
  parent: Ref | null
}

export interface StudioDetail extends StudioCard {
  details: string | null
  urls: string[]
  children: Ref[]
}

export interface TagCard {
  id: string
  name: string
  sceneCount: number
  favorite: boolean
}

export interface TagDetail extends TagCard {
  description: string | null
  aliases: string[]
  parents: Ref[]
  children: Ref[]
}

export interface SearchResult {
  scenes: SceneCard[]
  performers: PerformerCard[]
  studios: StudioCard[]
  tags: TagCard[]
}

export interface HomeRow {
  key: string
  title: string
  savedId?: number // a pinned filter (can be renamed, reordered, unpinned)
  browse: SceneQuery // /browse filters that show the whole row
  items: SceneCard[]
}

export interface Playlist {
  id: number
  name: string
  favorites: boolean // the built-in list behind the heart; cannot be deleted
  description: string | null
  itemCount: number
  cover: string | null
  updatedAt: string
}

export interface PlaylistDetail extends Playlist {
  items: SceneCard[]
}

export interface Blocklist {
  tags: Ref[]
  performers: Ref[]
  studios: Ref[]
}

export type BlockKind = 'tag' | 'performer' | 'studio'

export const sceneSorts = {
  date: 'Release date',
  created_at: 'Recently added',
  rating: 'Rating',
  play_count: 'Most played',
  last_played_at: 'Recently watched',
  o_counter: 'O count',
  duration: 'Duration',
  title: 'Title',
  random: 'Random',
} as const
export type SceneSort = keyof typeof sceneSorts

// Query string for /api/scenes. Lists are comma-separated ids.
export interface SceneQuery {
  q?: string
  sort?: SceneSort
  dir?: 'asc' | 'desc'
  page?: number
  perPage?: number
  seed?: number // random sort seed, so paging a shuffled list is stable
  tags?: string // must have all
  xtags?: string // must have none (added to the blocklist for this query)
  performers?: string // must have all
  studios?: string // any of, sub-studios included
  minRating?: number // stars
  minHeight?: number // 720, 1080, 2160
  minDuration?: number // minutes
  maxDuration?: number // minutes
  unwatched?: boolean
  inProgress?: boolean // started, not finished (has a resume point)
  favorites?: boolean // only scenes with a favourite performer
  unblocked?: boolean // ignore the blocklist
  // Cleanup filters
  maxHeight?: number // below this: 720, 1080, 2160
  maxRating?: number // rated, at most this many stars
  unmatched?: boolean // no StashDB link
  olderDays?: number // added to the library more than this many days ago
  duplicates?: boolean // looks like another scene (perceptual hash)
  // Performer attributes: one performer of the Settings gender must match them all
  minAge?: number // age at filming (to the year)
  maxAge?: number
  ethnicities?: string // any of, comma-separated
}

// What a filtered set holds (the filter panel's live counts). `options` counts each quick choice
// as if that group's own pick were not set: watched any|unwatched|inProgress, rating any|3|4|4.5,
// quality any|720|1080|2160, length any|short|mid|long.
export interface SceneFacets {
  total: number
  tags: Record<string, number>
  performers: Record<string, number>
  studios: Record<string, number>
  options: Record<'watched' | 'rating' | 'quality' | 'length', Record<string, number>>
}

// Defaults for every list (Settings); a list's own age or ethnicity filter replaces them.
export interface PeopleFilter {
  minAge?: number
  maxAge?: number
  ethnicities?: string[]
}

// Stash's ethnicity values as StashDB fills them in.
export const ethnicities = ['Caucasian', 'Latin', 'Black', 'Asian', 'Mixed', 'Middle Eastern', 'Indian', 'Other'] as const

export const performerSorts = {
  name: 'Name',
  scenes_count: 'Most scenes',
  rating: 'Rating',
  created_at: 'Recently added',
  random: 'Random',
} as const
export type PerformerSort = keyof typeof performerSorts

export interface CacheStats {
  since: string // server start; counters reset then
  data: {
    entries: number
    hits: number
    staleHits: number
    misses: number
    coalesced: number
    evictions: number
    invalidations: number
    ttlMinutes: number
  }
  assets: {
    files: number
    bytes: number
    maxBytes: number
    hits: number
    misses: number
    revalidated: number
    refetched: number
    staleServed: number
    notFound: number
    evictions: number
    ttlHours: number
  }
  // Requests flix actually sent to Stash
  upstream: { queries: number; mutations: number; assets: number; streams: number; changeChecks: number }
  changePollSeconds: number
  warm: WarmStatus
}

// The artwork pre-fetch (nightly, or from Settings)
export interface WarmStatus {
  running: boolean
  total: number
  done: number
  fetched: number // not cached or out of date, so fetched from Stash
  failed: number
  startedAt: string | null
  finishedAt: string | null
  nextRun: string | null
}

export type CacheScope = 'data' | 'assets' | 'all'

// Performer list: 'women' hides male performers (non-binary stay), 'men' shows only them.
export type PerformerGender = 'women' | 'men' | 'all'

export interface Settings {
  performerGender: PerformerGender
  introSkip: Record<string, number> // studio id -> seconds to skip at the start
  panicUrl: string // where a double Esc goes
  playOnOpen: boolean // opening a video starts it; off: it waits on the play button
  people: PeopleFilter // performer age and ethnicity defaults for every list
}

export type StationMode = 'full' | 'moments'

export interface StationInput {
  name: string
  query: SceneQuery
  from?: string // a scene id: drift through related videos instead of the query
  mode: StationMode
  window: number // seconds per moment
}

export interface SavedStation extends StationInput {
  id: number
  cover: string | null // a screenshot from the station
}

// Where a station was left (`key`: `id:<n>` saved, `q:<filters>` ad hoc, `from:<scene>`).
export interface StationResume {
  key: string
  scene: SceneCard
  seconds: number
  updatedAt: string
}

export interface SavedRow {
  id: number
  title: string
  query: SceneQuery
}

export interface TagTile {
  id: string
  name: string
  sceneCount: number
  image: string | null // screenshot of a representative scene
  favorite: boolean // pinned on the Categories page (Stash's tag favourite)
}

export interface HistoryEntry {
  playedAt: string
  scene: SceneCard
}

export interface Stats {
  plays: number
  hours: number
  scenesWatched: number
  oCount: number
  topPerformers: { ref: Ref; plays: number }[]
  topStudios: { ref: Ref; plays: number }[]
  topTags: { ref: Ref; plays: number }[]
  perDay: { date: string; plays: number }[] // last 30 days, oldest first
}

export interface JobStatus {
  id: string
  status: 'READY' | 'RUNNING' | 'FINISHED' | 'STOPPING' | 'CANCELLED' | 'FAILED'
  progress: number | null
  error: string | null
}

// What this server can do beyond browsing (depends on its configuration).
export interface Features {
  deleteScenes: boolean // Whisparr is configured, so a scene can be deleted with its file
}

export interface DeleteResult {
  id: string
  title: string | null
  ok: boolean
  error?: string
}
