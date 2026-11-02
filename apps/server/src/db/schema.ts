import { integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

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
