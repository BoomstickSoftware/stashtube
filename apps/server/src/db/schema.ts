import { boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

// Only what Stash cannot hold. Ratings, play counts, resume points and favourites
// live in Stash so its own UI stays consistent.

export const playlists = pgTable(
  'playlists',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    // 'favorites' marks the built-in list behind the heart on videos (Stash scenes have no
    // favourite flag); null for ordinary playlists.
    kind: text('kind'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('playlists_kind_unique').on(t.kind)],
)

export const playlistItems = pgTable(
  'playlist_items',
  {
    playlistId: integer('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id').notNull(), // Stash scene id
    position: integer('position').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playlistId, t.sceneId] })],
)

// The blocklist: what flix must not download. It applies to Discover, the not-downloaded shelf
// and the automatic Gets, never to library lists (decisions/hide-means-delete-block-or-unlist;
// _until 2026-11-09 a block also hid the entry's videos everywhere_).
export const blocks = pgTable(
  'blocks',
  {
    kind: text('kind', { enum: ['tag', 'performer', 'studio'] }).notNull(),
    stashId: text('stash_id').notNull(),
    name: text('name').notNull(), // display name at block time, so the list renders without Stash
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.stashId] })],
)

// A video's cast set by hand (wiki features/cast): the counts of women, men and others when
// Stash's performers are incomplete (a performer missing from StashDB). The Cast sync files the
// video by these instead of the performers' genders.
export const castOverrides = pgTable('cast_overrides', {
  sceneId: text('scene_id').primaryKey(),
  women: integer('women').notNull(),
  men: integer('men').notNull(),
  other: integer('other').notNull(),
  title: text('title').notNull(), // when set, so Settings renders without Stash
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Unlisted categories, performers and studios (unlisted.ts): their videos stay out of what flix
// picks for you and are listed in the Vault. Independent of `blocks`: one entity may be in both.
export const unlisted = pgTable(
  'unlisted',
  {
    kind: text('kind', { enum: ['tag', 'performer', 'studio'] }).notNull(),
    stashId: text('stash_id').notNull(),
    name: text('name').notNull(), // display name when unlisted, so Settings renders without Stash
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.stashId] })],
)

// Small UI preferences, kept next to the page they affect (e.g. the performer gender switch).
// Also holds the job registry's last run times under `job:<name>` keys (jobs.ts), which
// settings.ts leaves out of the settings it serves.
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Browse filters pinned to the home page as rows.
export const savedRows = pgTable('saved_rows', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  query: jsonb('query').notNull(),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Named stations: a filter set (or a starting scene to drift from) and how to play it.
export const stations = pgTable('stations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  query: jsonb('query').notNull(),
  fromScene: text('from_scene'),
  mode: text('mode').notNull().default('full'), // full | moments
  window: integer('window').notNull().default(60), // seconds per moment
  position: integer('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Where each station was last left: the scene playing and how far in. Keyed by station
// (`id:<n>` saved, `pl:<n>` a playlist; ad hoc stations are not remembered since 2026-10-31);
// the newest 50 are kept.
export const stationResume = pgTable('station_resume', {
  key: text('key').primaryKey(),
  sceneId: text('scene_id').notNull(),
  seconds: integer('seconds').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Whisparr scenes fetched with Get (one scene per click, or one from the queue). The guard
// (sync.ts) never unmonitors these, so a scene waiting for a release keeps waiting; the row goes once Whisparr
// has the file.
export const whisparrGets = pgTable('whisparr_gets', {
  movieId: integer('movie_id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  searchedAt: timestamp('searched_at', { withTimezone: true }), // the last search flix started for it (re-search of waiting scenes)
})

// When flix started following a performer or studio (StashDB id). Discovery (getqueue.ts)
// fetches only their scenes released after this date, less a short grace, so following someone
// does not pull in their back catalogue. The guard forgets a row once they are no longer followed.
export const whisparrWatch = pgTable(
  'whisparr_watch',
  {
    kind: text('kind').notNull(), // performer | studio
    foreignId: text('foreign_id').notNull(),
    since: timestamp('since', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.foreignId] })],
)

// --- the StashDB mirror (catalog.ts) ---------------------------------------------------------
// What flix has learned from StashDB, so a record is fetched once and re-read only when stale.
// Not a copy of StashDB: what was followed, opened or searched.

export const sdbScenes = pgTable(
  'sdb_scenes',
  {
    id: text('id').primaryKey(), // StashDB uuid
    title: text('title'),
    date: text('date'), // YYYY-MM-DD
    duration: integer('duration'), // seconds
    studioId: text('studio_id'),
    studioName: text('studio_name'),
    performers: jsonb('performers').notNull(), // [{ id, name, as }]
    performerIds: text('performer_ids').array().notNull(),
    tags: jsonb('tags').notNull(), // [{ id, name }]
    tagIds: text('tag_ids').array().notNull(),
    image: text('image'), // StashDB's widest cover URL (served only through the proxy)
    code: text('code'),
    details: text('details'), // StashDB's description; '' when it has none, null until fetched
    created: text('created'), // StashDB's own timestamps
    updated: text('updated'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sdb_scenes_studio').on(t.studioId), index('sdb_scenes_date').on(t.date), index('sdb_scenes_performers').using('gin', t.performerIds), index('sdb_scenes_tags').using('gin', t.tagIds)],
)

// Performers, studios and tags (kind), with what a page header and a filter chip need.
export const sdbEntities = pgTable(
  'sdb_entities',
  {
    kind: text('kind').notNull(), // performer | studio | tag
    id: text('id').notNull(),
    name: text('name').notNull(),
    disambiguation: text('disambiguation'),
    image: text('image'),
    parentId: text('parent_id'),
    parentName: text('parent_name'),
    sceneCount: integer('scene_count'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.id] })],
)

// A performer's or studio's whole catalogue held locally ("complete"), and how far it is known,
// so a refresh asks StashDB only for what changed since.
export const sdbScopes = pgTable('sdb_scopes', {
  key: text('key').primaryKey(), // performer:<id> | studio:<id>
  total: integer('total'),
  complete: boolean('complete').notNull().default(false),
  newestUpdated: text('newest_updated'),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
})

// One StashDB answer (a page of a search), by its exact input, so the same page is not asked twice.
export const sdbQueries = pgTable('sdb_queries', {
  key: text('key').primaryKey(),
  ids: text('ids').array().notNull(),
  count: integer('count').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
})

// Scenes the user asked to Get from a list, fetched one at a time by a paced worker (getqueue.ts),
// so a long selection survives a restart and never becomes a burst of searches.
export const getQueue = pgTable('get_queue', {
  stashdbId: text('stashdb_id').primaryKey(),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
})

// Studio default categories (wiki features/studio-default-categories): flix keeps each on every
// video of the studio itself (sub-studios have their own). Names are kept so Settings renders
// without Stash.
export const studioCategories = pgTable(
  'studio_categories',
  {
    studioId: text('studio_id').notNull(),
    studioName: text('studio_name').notNull(),
    tagId: text('tag_id').notNull(),
    tagName: text('tag_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studioId, t.tagId] })],
)

// Which videos the studio-defaults sync gave a category to (they lacked it). Only these lose it
// when it stops being a default of their studio: a category Stash or StashDB put there stays.
export const studioCategoryAdds = pgTable(
  'studio_category_adds',
  {
    sceneId: text('scene_id').notNull(),
    tagId: text('tag_id').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sceneId, t.tagId] })],
)

// Reels (wiki decisions/reels-edit-by-reference): a reel is an ordered list of ranges of
// library videos. The rows are the design; no video file is touched.
export const reels = pgTable('reels', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  transition: text('transition', { enum: ['cut', 'fade'] }).notNull().default('cut'), // the default between clips
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const reelItems = pgTable(
  'reel_items',
  {
    id: serial('id').primaryKey(),
    reelId: integer('reel_id')
      .notNull()
      .references(() => reels.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id').notNull(), // Stash scene id
    startSec: doublePrecision('start_sec').notNull(),
    endSec: doublePrecision('end_sec').notNull(),
    position: integer('position').notNull(),
    transition: text('transition', { enum: ['cut', 'fade'] }), // into the next clip; null follows the reel
    // the video's length when the clip was marked: another length now means the file changed
    // and the range may show something else
    sourceDurationSec: doublePrecision('source_duration_sec').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('reel_items_reel').on(t.reelId, t.position)],
)

// A reel's render to one file (wiki features/reel-builds). The builder on the NAS claims a
// queued row, renders the `plan` snapshot it carries and reports back; flix decides when a row
// may be claimed. Only the newest row of a reel is kept once a build is done.
export const reelBuilds = pgTable(
  'reel_builds',
  {
    id: serial('id').primaryKey(),
    reelId: integer('reel_id')
      .notNull()
      .references(() => reels.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['queued', 'building', 'done', 'failed'] }).notNull().default('queued'),
    now: boolean('now').notNull().default(false), // "Build now": offered at any hour
    planHash: text('plan_hash').notNull(), // the design it was queued from; another hash now means the reel changed
    plan: jsonb('plan').notNull(), // BuildPlan: what the builder renders
    progress: doublePrecision('progress').notNull().default(0), // 0 to 1
    message: text('message'),
    error: text('error'),
    file: text('file'), // the built file's name inside the reels folder
    durationSec: doublePrecision('duration_sec'),
    sizeBytes: doublePrecision('size_bytes'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('reel_builds_reel').on(t.reelId), index('reel_builds_status').on(t.status)],
)

