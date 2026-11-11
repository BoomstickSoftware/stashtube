import type { Compatibility } from './compat.ts'

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
  size: number // bytes of the primary file (deletes show what they free)
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
  compat: Compatibility // where the file plays without a transcode (compat.ts)
  why?: string // Featured only: the signals that put it there, in words ("A performer you follow · not seen in 7 months")
}

// The Featured engine's dials: how much each signal counts, -1 (avoid) to 1 (prefer).
// `surprise` is the weight of a per-visit random term; 0 makes the order fully deterministic.
export interface FeaturedWeights {
  dormant: number // long since last played (never played: since added)
  shelfAge: number // long since added
  fresh: number // newly added
  performer: number // favourite performers and the ones you watch
  tag: number // favourite tags and the ones you watch
  studio: number // favourite studios and the ones you watch
  watched: number // play count (negative: rarely watched)
  marked: number // marker count
  rated: number // rating
  oCount: number // O-counter
  surprise: number
}

// Used by both: the web's dials and the server's ranker (the runtime image ships this package).
// Widths the media proxy makes smaller copies of images at (`?w=`, WebP, cached). Cards ask
// for these instead of Stash's full-size screenshots.
export const IMAGE_WIDTHS = [320, 480, 640, 960] as const // 480 since 2026-10-31 (decision: desktop 4-column grids)

// The proxy paths that resize: Stash's assets and remote (StashDB) covers.
const RESIZABLE = /^\/media\/(stash|remote)\//

// An image URL from the API at `w` px wide; anything the proxy does not resize is left alone.
export function sized(url: string, w: (typeof IMAGE_WIDTHS)[number]): string {
  if (!RESIZABLE.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}w=${w}`
}

// `srcset` over every width, for an <img> whose `sizes` says how wide it shows.
export const srcSet = (url: string): string | undefined => (RESIZABLE.test(url) ? IMAGE_WIDTHS.map((w) => `${sized(url, w)} ${w}w`).join(', ') : undefined)

export const FEATURED_DEFAULTS: FeaturedWeights = {
  dormant: 0.4,
  shelfAge: 0.2,
  fresh: 0,
  performer: 0.5,
  tag: 0.3,
  studio: 0,
  watched: -0.2,
  marked: 0,
  rated: 0.3,
  oCount: 0,
  surprise: 0.3,
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
  tagId: string
}

export interface SceneDetail extends SceneCard {
  unlisted: boolean // unlisted by hand (the "Unlisted" tag)
  unlistedVia: Ref[] // the Unlisted categories, performers or studio that keep it off Home
  details: string | null
  code: string | null
  director: string | null
  urls: string[]
  tags: Ref[]
  file: SceneFile | null
  playback: Playback
  markers: Marker[]
  hidden: boolean // still tagged "Not interested" from before it meant delete (2026-11-09); Cleanup lists these
  cast: SceneCast
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
  browse?: SceneQuery // /browse filters that show the whole row
  from?: string // instead: the scene this row is related to ("See all" is a station from it)
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

// Unlisted (wiki features/vault): categories, performers and studios whose videos stay out of
// everything flix picks for you (Home, Featured, related videos, stations) and are listed in the
// Vault; Browse, search and entity pages still show them. A video can also be unlisted by hand
// (`SceneDetail.unlisted`). Mutually exclusive with the blocklist.
export interface Unlisted {
  tags: Ref[]
  performers: Ref[]
  studios: Ref[]
  sceneTag: string | null // the Stash tag that unlists one video by hand ("Unlisted"), once created
}

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
  unblocked?: boolean // ignore the Settings performer defaults (it skipped the blocklist until 2026-11-09, when Block stopped hiding owned videos)
  vault?: boolean // only Unlisted videos (the Vault page)
  noUnlisted?: boolean // hold Unlisted videos out (stations); a named Unlisted entity, or `vault`, lets it in
  // Cleanup filters
  maxHeight?: number // below this: 720, 1080, 2160
  maxRating?: number // rated, at most this many stars
  unmatched?: boolean // no StashDB link
  transcodes?: boolean // not an MP4-family file: transcoded for Apple devices
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
  scenes_count: 'Most videos',
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
  featured: FeaturedWeights // the Featured row's dials
  whisparrSync: boolean // follow -> Whisparr watches the performer's new releases; off: the sync only plans
  hideVr: boolean // Discover leaves VR scenes out (title, category or studio says VR); on by default
  castSetup?: boolean // the Cast sync has applied its one-time defaults (Cast: M blocked)
  continueDays: number // a resume point untouched this many days leaves Continue; 0 keeps it forever
}

// Cast categories (wiki features/cast): flix-maintained Stash categories from performer genders.
export interface CastTag {
  name: string // "Cast: F+M", "Cast: Women 2+"
  id: string // the Stash category
  scenes: number
}
export interface CastStatus {
  mixes: CastTag[] // one per scene: the letters present (F woman, M man, X other), or Unknown
  counts: CastTag[] // cumulative thresholds: Women 1+..3+, Men 1+..3+, Other 1+..2+
  lastSync: SyncRun | null
  overrides: CastOverride[] // videos whose cast was set by hand
}
// Counts of women (F), men (M) and others (X) in one video.
export interface CastCount {
  F: number
  M: number
  X: number
}
export interface CastOverride extends CastCount {
  sceneId: string
  title: string
}
// A video's cast on its page: from its performers (null counts when one has no gender) or by hand.
export interface SceneCast {
  counts: CastCount | null
  override: boolean
  performers: CastCount | null // what the performers alone say
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

// Where a station was left (`key`: `id:<n>` saved, `q:<filters>` ad hoc, `from:<scene>`,
// `pl:<n>` a playlist). `name` is the saved station's or playlist's; null for an ad hoc one.
export interface StationResume {
  key: string
  name: string | null
  scene: SceneCard
  seconds: number
  updatedAt: string
}

// A station card's picture and count: a few of the videos it plays (reshuffled daily) and how
// many there are (null for a drifting station, whose videos are the starting one's relatives).
export interface StationPreview {
  total: number | null
  items: SceneCard[]
}

// Previews for every saved station (by id) and for ad hoc queries (by the JSON the client sent).
export interface StationPreviews {
  stations: Record<number, StationPreview>
  queries: Record<string, StationPreview>
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

// One video's plays on one day (the browser's day: GET /history?tz=), newest first. History is
// paged (Page<HistoryEntry>); removing an entry deletes exactly `times` from Stash.
export interface HistoryEntry {
  playedAt: string // the latest of `times`
  day: string // YYYY-MM-DD in the browser's time zone
  times: string[] // every play that day, newest first, as Stash keeps them
  scene: SceneCard
}
// Plays to take out of History, or to put back (Undo)
export interface HistoryPlays {
  plays: { id: string; times: string[] }[]
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

// Duplicates workbench: scenes Stash's perceptual hashes say are the same video, grouped. Each
// group names the copy to keep and pre-selects the rest; the file facts are what that choice
// is made on (size, width, height and duration are already on the card).
export interface DuplicateScene extends SceneCard {
  file: { path: string; bitrate: number; videoCodec: string; framerate: number }
}
export interface DuplicateGroup {
  scenes: DuplicateScene[]
  keep: string // the best copy's id
  suggested: string[] // every other id, pre-selected for deletion
}
export interface Duplicates {
  distance: number // phash distance: 0 exact
  durationDiff: number // seconds, -1 for any
  groups: DuplicateGroup[]
}

// What this server can do beyond browsing (depends on its configuration).
export interface Features {
  deleteScenes: boolean // Whisparr is configured, so a scene can be deleted with its file
  whisparr: boolean // and scenes it knows but has not downloaded can be listed and fetched one at a time
  stashdb: boolean // StashDB answers too, so the shelf shows a performer's or studio's whole catalogue
  stashdbWeb: string | null // StashDB's site (e.g. https://stashdb.org), for "open on StashDB" links
  reels: boolean // reels are switched on (FLIX_REELS=1): marking clips, the editor and the preview
}

// A scene not in the library (yet). `state` follows the download: remote (only StashDB knows
// it; Get adds it to Whisparr and searches), available (Whisparr lists it, nothing happening),
// requested (Get was pressed in the last while and Whisparr has not grabbed it yet: the search
// may still be running, or found nothing), grabbed (sent to the download client in the last two
// days), downloading (in Whisparr's queue), downloaded (has a file; shown only while the state
// settles).
// owned: in Stash already (Discover shows it, linked); queued: in flix's paced Get queue; waiting: fetched and monitored, no release found yet.
export type WantedState = 'remote' | 'available' | 'requested' | 'queued' | 'waiting' | 'grabbed' | 'downloading' | 'downloaded' | 'owned'
// A StashDB scene's description (Discover's About); '' when StashDB has none.
export interface SdbSceneDetails {
  details: string
}

export interface WantedScene {
  whisparrId: number | null // null for a remote scene
  stashdbId: string | null // StashDB's uuid; Whisparr files scenes under it too
  title: string
  date: string | null // YYYY-MM-DD
  studio: string | null
  performers: string[]
  image: string | null // StashDB's cover through the proxy (/media/remote/<token>, resizable with ?w=)
  runtime: number | null // minutes
  state: WantedState
  sceneId?: string | null // the Stash scene, when owned
  deletedBefore?: boolean // deleted from the library before (Whisparr's import exclusion): discovery skips it, a Get by hand still fetches it
  // StashDB's categories from flix's mirror, for Discover's details (absent on Whisparr-only
  // cards); `libraryId` is the same category in the library, when it has one
  tags?: { name: string; libraryId: string | null }[]
}
// A page of a performer's or studio's missing scenes: StashDB's catalogue when it answers,
// otherwise only what Whisparr lists.
export interface WantedList {
  source: 'stashdb' | 'whisparr'
  items: WantedScene[]
  page: number
  hasMore: boolean
}
// The Whisparr sync (architecture/whisparr-sync). Stash favourites (performers and studios) decide
// everything Whisparr monitors: those are watched for new releases (tagged `flix`), all else is
// unmonitored, and old scenes Whisparr monitored on its own are trimmed. Never a search.
export type SyncAction = 'monitor' | 'adopt' | 'unmonitor' | 'missing' | 'unmanaged' | 'fetch'
export interface SyncItem {
  kind: 'performer' | 'studio' | 'scene'
  name: string
  action: SyncAction // monitor/unmonitor/adopt change Whisparr; missing and unmanaged need a hand
  reason: string
  error?: string // the write failed (applied runs only)
}
export interface SyncStatus {
  available: boolean // Whisparr is configured
  enabled: boolean // Settings: apply; off, each run only plans
  running: boolean
  lastRun: string | null // ISO time of the last finished run
  outcome: 'applied' | 'planned' | 'skipped' | 'failed' | null
  detail: string | null // what was done, or why nothing was
  items: SyncItem[] // the last run's changes (made or planned) and what needs a hand
  managed: number // performers and studios watched in Whisparr after the last run
  scenes: number // monitored scenes the last run unmonitored (or would)
  fetched: number // new scenes of followed ones the last run fetched (Get)
}
// A performer page's "Watching for new scenes" line.
export interface PerformerWatch {
  watching: boolean // Whisparr monitors this performer's new releases
  managed: boolean // because they are followed in flix (tagged `flix`), not set by hand in Whisparr
  downloading: number // their scenes queued or grabbed right now
}

// Discover: StashDB browsed through flix's mirror (architecture/stashdb-mirror).
export type DiscoverSort = 'date' | 'added' | 'trending'
export interface DiscoverQuery {
  q?: string
  performers?: string[] // StashDB ids, all of them
  studios?: string[] // any of them
  tags?: string[] // all of them
  sort?: DiscoverSort
  page?: number
  unblocked?: boolean // blocked and VR scenes too
  fresh?: boolean // only scenes not in motion: not owned, requested, queued, waiting, grabbed or downloading
}
export interface DiscoverEntity {
  kind: 'performer' | 'studio' | 'tag'
  id: string // StashDB uuid
  name: string
  disambiguation: string | null
  image: string | null // through the proxy
  parent: string | null // a studio's network
  sceneCount: number | null
  libraryId: string | null // the same performer/studio/tag in Stash, when the library has it
}
export interface DiscoverPage {
  items: WantedScene[]
  count: number
  page: number
  hasMore: boolean
  source: 'mirror' | 'stashdb' // answered from the local mirror, or StashDB was asked
  selected: DiscoverEntity[] // the filter chips, named
  hidden: number // blocked results left out of this page
  vr: number // VR scenes left out of this page (Settings hideVr)
  inMotion: number // owned or on the way, left out of this page by `fresh`
}
// Scenes fetched and still without a file, and selections still in the paced Get queue.
export interface WaitingScene {
  scene: WantedScene
  since: string // when it was fetched or queued
  searchedAt: string | null // the last search flix started
  error: string | null // the queue's last failure
}

export interface WhisparrActivity {
  downloading: WantedScene[]
  grabbed: WantedScene[]
}

export interface DeleteResult {
  id: string
  title: string | null
  ok: boolean
  error?: string
}

// One run of a flix sync that writes categories into Stash (Cast, studio defaults).
export interface SyncRun {
  at: string
  scenes: number // videos read
  added: number // category additions written
  removed: number // category removals written
  ms: number
  error: string | null
}

// Studio default categories (wiki features/studio-default-categories): flix keeps them on every
// video of that studio (not its sub-studios).
export interface StudioCategories {
  tags: Ref[]
}
export interface StudioCategoriesStatus {
  studios: { id: string; name: string; tags: Ref[] }[]
  lastSync: SyncRun | null
}

export * from './reels.ts'
export * from './compat.ts'
export * from './render.ts'
