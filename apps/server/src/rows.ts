import type { SavedRow, SceneQuery } from '@flix/shared'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from './db/index.ts'
import { savedRows } from './db/schema.ts'

export async function listRows(): Promise<SavedRow[]> {
  const rows = await db.select().from(savedRows).orderBy(asc(savedRows.position), asc(savedRows.id))
  return rows.map((r) => ({ id: r.id, title: r.title, query: r.query as SceneQuery }))
}

export async function addRow(title: string, query: SceneQuery) {
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${savedRows.position}), -1)::int + 1` }).from(savedRows)
  const [r] = await db.insert(savedRows).values({ title, query, position: next }).returning({ id: savedRows.id })
  return r.id
}

export async function renameRow(id: number, title: string) {
  await db.update(savedRows).set({ title }).where(eq(savedRows.id, id))
}

export async function deleteRow(id: number) {
  await db.delete(savedRows).where(eq(savedRows.id, id))
}

export async function reorderRows(ids: number[]) {
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) await tx.update(savedRows).set({ position }).where(eq(savedRows.id, id))
  })
}
