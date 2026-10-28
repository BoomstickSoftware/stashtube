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
