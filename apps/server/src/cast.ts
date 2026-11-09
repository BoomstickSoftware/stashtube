import type { CastCount, CastOverride, CastStatus, SceneCast } from '@flix/shared'
import { eq } from 'drizzle-orm'
import { block } from './blocklist.ts'
import { db } from './db/index.ts'
import { castOverrides } from './db/schema.ts'
import { getSettings, setSetting } from './settings.ts'
import * as stash from './stash.ts'

// Cast categories (wiki features/cast): flix sorts each scene's performers into F (woman), M (man)
// and X (anyone else: trans, non-binary, intersex) by their gender in Stash, and keeps two
// families of Stash categories under the parent "Cast":
//   Mix: exactly one per scene, the letters present ("Cast: F+M"), or "Cast: Unknown" when the
//        scene has no performers or one without a gender. Blocking or unlisting one hides a mix.
//   Counts: cumulative thresholds ("Cast: Women 2+" means two or more), so "at least / at most /
//        exactly" questions become plain includes and excludes in Browse.
// flix owns these categories: a hand edit to one is put back on the next sync. When Stash's
// performers are incomplete (one missing from StashDB), set the video's cast by hand instead: an
// override (Postgres) the sync files it by in place of the genders.

export const PARENT = 'Cast'
export const MIXES = ['F', 'M', 'X', 'F+M', 'F+X', 'M+X', 'F+M+X'] as const
export const UNKNOWN = 'Cast: Unknown'
const LETTERS = { F: 'Women', M: 'Men', X: 'Other' } as const
const CAPS = { F: 3, M: 3, X: 2 } as const // the highest threshold per letter (3+ means three or more)

export const mixTag = (mix: string) => `Cast: ${mix}`
export const countTag = (letter: keyof typeof LETTERS, n: number) => `Cast: ${LETTERS[letter]} ${n}+`
export const COUNT_TAGS = (Object.keys(CAPS) as (keyof typeof CAPS)[]).flatMap((l) => Array.from({ length: CAPS[l] }, (_, i) => countTag(l, i + 1)))
export const ALL_TAGS = [...MIXES.map(mixTag), UNKNOWN, ...COUNT_TAGS]

const letterOf = (g: string | null): 'F' | 'M' | 'X' | null => (g === 'FEMALE' ? 'F' : g === 'MALE' ? 'M' : g ? 'X' : null)

// The counts by letter, or null when a performer has no gender or there are none.
export function countOf(genders: (string | null)[]): CastCount | null {
  const letters = genders.map(letterOf)
  if (!letters.length || letters.includes(null)) return null
  const n = { F: 0, M: 0, X: 0 }
  for (const l of letters) n[l!]++
  return n
}

// The Cast categories one scene should carry, from its performers' genders.
export const castOf = (genders: (string | null)[]): string[] => castFrom(countOf(genders))

export function castFrom(n: CastCount | null): string[] {
  if (!n || !(n.F + n.M + n.X)) return [UNKNOWN]
  const mix = (['F', 'M', 'X'] as const).filter((l) => n[l]).join('+')
  const counts = (['F', 'M', 'X'] as const).flatMap((l) => Array.from({ length: Math.min(n[l], CAPS[l]) }, (_, i) => countTag(l, i + 1)))
  return [mixTag(mix), ...counts]
}

let status: CastStatus['lastSync'] = null
let running: Promise<void> | null = null

// Puts every scene's Cast categories right: one read, then one bulk add or remove per category
// that differs. Runs at start, after Stash reports changes, and from Settings.
export function syncCast(): Promise<void> {
  running ??= run().finally(() => (running = null))
  return running
}

async function run() {
  const started = Date.now()
  try {
    const ids = await stash.ensureTags(ALL_TAGS, PARENT)
    const [scenes, overrides] = await Promise.all([stash.castInputs(), overrideMap()])
    const want = new Map(scenes.map((s) => [s.id, new Set(overrides.has(s.id) ? castFrom(overrides.get(s.id)!) : castOf(s.genders))]))
    let added = 0
    let removed = 0
    for (const name of ALL_TAGS) {
      const tagId = ids.get(name)!
      const add: string[] = []
      const remove: string[] = []
      for (const s of scenes) {
        const on = want.get(s.id)!.has(name)
        const has = s.tagIds.includes(tagId)
        if (on && !has) add.push(s.id)
        else if (!on && has) remove.push(s.id)
      }
      if (add.length) await stash.bulkTag(add, tagId, 'ADD')
      if (remove.length) await stash.bulkTag(remove, tagId, 'REMOVE')
      added += add.length
      removed += remove.length
    }
    // once: all-male casts blocked, as the user chose (2026-11-09); changeable in Settings
    if (!(await getSettings()).castSetup) {
      await block('tag', ids.get(mixTag('M'))!, mixTag('M'))
      await setSetting('castSetup', true)
    }
    if (added || removed) await stash.acceptOwnChanges()
    status = { at: new Date().toISOString(), scenes: scenes.length, added, removed, ms: Date.now() - started, error: null }
  } catch (e) {
    status = { at: new Date().toISOString(), scenes: 0, added: 0, removed: 0, ms: Date.now() - started, error: (e as Error).message }
    console.error('cast sync:', (e as Error).message)
  }
}

export async function castStatus(): Promise<CastStatus> {
  const ids = await stash.ensureTags(ALL_TAGS, PARENT)
  const counts = await stash.tagCounts([...ids.values()])
  const row = (name: string) => ({ name, id: ids.get(name)!, scenes: counts.get(ids.get(name)!) ?? 0 })
  return { mixes: [...MIXES.map(mixTag), UNKNOWN].map(row), counts: COUNT_TAGS.map(row), lastSync: status, overrides: await listOverrides() }
}

// --- overrides ---------------------------------------------------------------------------

async function listOverrides(): Promise<CastOverride[]> {
  const rows = await db.select().from(castOverrides).orderBy(castOverrides.title)
  return rows.map((r) => ({ sceneId: r.sceneId, title: r.title, F: r.women, M: r.men, X: r.other }))
}

const overrideMap = async () => new Map((await listOverrides()).map((o) => [o.sceneId, { F: o.F, M: o.M, X: o.X }]))

// One video's cast for its page.
export async function sceneCast(sceneId: string, genders: (string | null)[]): Promise<SceneCast> {
  const [o] = await db.select().from(castOverrides).where(eq(castOverrides.sceneId, sceneId))
  const performers = countOf(genders)
  return o ? { counts: { F: o.women, M: o.men, X: o.other }, override: true, performers } : { counts: performers, override: false, performers }
}

// Set (or with null, clear) a video's cast by hand, then sync so its categories follow at once
// (a sync with little to change takes about 3 s).
export async function setOverride(sceneId: string, n: CastCount | null, title = '') {
  if (n) {
    const v = { women: n.F, men: n.M, other: n.X, title }
    await db.insert(castOverrides).values({ sceneId, ...v }).onConflictDoUpdate({ target: castOverrides.sceneId, set: v })
  } else await db.delete(castOverrides).where(eq(castOverrides.sceneId, sceneId))
  await syncCast()
}

