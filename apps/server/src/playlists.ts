import type { Playlist, PlaylistDetail } from '@flix/shared'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from './db/index.ts'
import { playlistItems, playlists } from './db/schema.ts'
import { findScenesByIds } from './stash.ts'

const touch = (id: number) => db.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, id))

export async function listPlaylists(): Promise<Playlist[]> {
  await favoritesPlaylist() // always listed, even before the first heart
  const rows = await db
    .select({
      id: playlists.id,
      name: playlists.name,
      description: playlists.description,
      kind: playlists.kind,
      updatedAt: playlists.updatedAt,
      itemCount: sql<number>`count(${playlistItems.sceneId})::int`,
      firstScene: sql<string | null>`(array_agg(${playlistItems.sceneId} order by ${playlistItems.position}))[1]`,
    })
    .from(playlists)
    .leftJoin(playlistItems, eq(playlistItems.playlistId, playlists.id))
    .groupBy(playlists.id)
    .orderBy(sql`${playlists.kind} is null`, desc(playlists.updatedAt)) // Favorites first
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    favorites: r.kind === 'favorites',
    description: r.description,
    itemCount: r.itemCount,
    cover: r.firstScene ? `/media/stash/scene/${r.firstScene}/screenshot` : null,
    updatedAt: r.updatedAt.toISOString(),
  }))
}

export async function getPlaylist(id: number): Promise<PlaylistDetail | null> {
  const [p] = await db.select().from(playlists).where(eq(playlists.id, id))
  if (!p) return null
  const items = await db
    .select({ sceneId: playlistItems.sceneId })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, id))
    .orderBy(asc(playlistItems.position))
  const scenes = await findScenesByIds(items.map((i) => i.sceneId))
  return {
    id: p.id,
    name: p.name,
    favorites: p.kind === 'favorites',
    description: p.description,
    itemCount: scenes.length,
    cover: scenes[0]?.screenshot ?? null,
    updatedAt: p.updatedAt.toISOString(),
    items: scenes,
  }
}

export async function createPlaylist(name: string, description: string | null) {
  const [p] = await db.insert(playlists).values({ name, description }).returning({ id: playlists.id })
  return p.id
}

export async function updatePlaylist(id: number, name: string, description: string | null) {
  await db.update(playlists).set({ name, description, updatedAt: new Date() }).where(eq(playlists.id, id))
}

export async function deletePlaylist(id: number) {
  await db.delete(playlists).where(and(eq(playlists.id, id), sql`${playlists.kind} is null`)) // Favorites stays
}

// --- favorites: the built-in playlist behind the heart on videos -----------------

let favoritesId: number | null = null

export async function favoritesPlaylist(): Promise<number> {
  if (favoritesId) return favoritesId
  await db.insert(playlists).values({ name: 'Favorites', kind: 'favorites' }).onConflictDoNothing()
  const [p] = await db.select({ id: playlists.id }).from(playlists).where(eq(playlists.kind, 'favorites'))
  favoritesId = p.id
  return p.id
}

export async function favoriteIds(): Promise<string[]> {
  const id = await favoritesPlaylist()
  const rows = await db.select({ sceneId: playlistItems.sceneId }).from(playlistItems).where(eq(playlistItems.playlistId, id))
  return rows.map((r) => r.sceneId)
}

export async function addToPlaylist(id: number, sceneId: string) {
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${playlistItems.position}), -1)::int + 1` })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, id))
  await db.insert(playlistItems).values({ playlistId: id, sceneId, position: next }).onConflictDoNothing()
  await touch(id)
}

export async function removeFromPlaylist(id: number, sceneId: string) {
  await db.delete(playlistItems).where(and(eq(playlistItems.playlistId, id), eq(playlistItems.sceneId, sceneId)))
  await touch(id)
}

// Full order from the client; ids not in the playlist are ignored.
export async function reorderPlaylist(id: number, sceneIds: string[]) {
  await db.transaction(async (tx) => {
    for (const [position, sceneId] of sceneIds.entries()) {
      await tx
        .update(playlistItems)
        .set({ position })
        .where(and(eq(playlistItems.playlistId, id), eq(playlistItems.sceneId, sceneId)))
    }
  })
  await touch(id)
}

export async function playlistsContaining(sceneId: string) {
  return db
    .select({ id: playlists.id, name: playlists.name })
    .from(playlistItems)
    .innerJoin(playlists, eq(playlists.id, playlistItems.playlistId))
    .where(eq(playlistItems.sceneId, sceneId))
}
