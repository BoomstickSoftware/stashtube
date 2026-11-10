// The category syncs flix keeps in Stash: Cast (cast.ts), then studio defaults
// (studioCategories.ts). Run when Stash reports a change, once after start, and checked every
// hour, used or not: change detection polls only while flix is in use, so an import that lands
// while nobody is looking would otherwise wait for the next visit (the user's decision,
// 2026-11-10: the hourly check stays).
// The hourly check is one small fingerprint query; the three whole-library reads behind the two
// syncs run only when the fingerprint differs from the one at the last successful sync
// (_every hour regardless until 2026-11-10_). A hand edit in Settings (a cast override, a
// studio's defaults) calls its own sync directly and is not gated.
import { castSyncOk, syncCast } from './cast.ts'
import { register } from './jobs.ts'
import { libraryFingerprint } from './stash.ts'
import { studioCategoriesSyncOk, syncStudioCategories } from './studioCategories.ts'

let synced: string | null = null // the library's fingerprint when both syncs last succeeded

export async function syncCategories(): Promise<void> {
  await syncCast()
  await syncStudioCategories()
  // taken after the syncs: their own tag writes move it. Unknown (Stash did not answer, or a
  // sync failed) reads as changed, so the next check syncs again.
  synced = castSyncOk() && studioCategoriesSyncOk() ? await libraryFingerprint().catch(() => null) : null
}

// Pure, for tests: is a sync due? Yes when none succeeded yet or the fingerprint is unknown.
export const changedSince = (baseline: string | null, current: string | null) => baseline === null || current === null || current !== baseline

export const categoryJob = register({
  name: 'category-sync',
  every: 60 * 60_000,
  firstAfter: 90_000, // checked once after start
  gate: async () => changedSince(synced, await libraryFingerprint().catch(() => null)),
  run: syncCategories,
})
