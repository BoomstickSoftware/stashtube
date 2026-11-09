import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

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

// Hidden everywhere unless a query asks for unblocked results.
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

// The categories that make up the Edu section (edu.ts): their videos stay out of Home, Featured,
// For you, related videos and stations, and are listed on /edu.
export const eduTags = pgTable('edu_tags', {
  stashId: text('stash_id').primaryKey(), // Stash tag id
  name: text('name').notNull(), // display name when added, so Settings renders without Stash
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Small UI preferences, kept next to the page they affect (e.g. the performer gender switch).
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
// (`id:<n>` saved, `q:<filters>` ad hoc, `from:<scene>` drifting); the newest 50 are kept.
export const stationResume = pgTable('station_resume', {
  key: text('key').primaryKey(),
  sceneId: text('scene_id').notNull(),
  seconds: integer('seconds').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Whisparr scenes fetched with Get (one scene per click). The follow sync (sync.ts) never
// unmonitors these, so a scene waiting for a release keeps waiting; the row goes once Whisparr
// has the file.
export const whisparrGets = pgTable('whisparr_gets', {
  movieId: integer('movie_id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  searchedAt: timestamp('searched_at', { withTimezone: true }), // the last search flix started for it (re-search of waiting scenes)
})

// When the follow sync started watching a performer or studio (StashDB id). Whisparr's "new
// items" also monitors OLD scenes it learns about later, so the sync unmonitors any of their
// scenes released before this date (less a short grace), keeping only real new releases.
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
