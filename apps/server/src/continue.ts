// Continue expiry (decisions/continue-clears-and-expires): a resume point untouched for
// `settings.continueDays` days (30 by default; 0 keeps them) is cleared, so Continue does not
// grow forever. Runs a few minutes after start, then daily, and when the setting changes.
// Clears only resume points: plays and History stay.
import { getSettings } from './settings.ts'
import { clearResume, continueAges } from './stash.ts'

const DAY = 86_400_000

// Exported for tests: the ids whose last touch is older than `days` days at `now`.
export function expired(rows: { id: string; touched: string }[], days: number, now = Date.now()): string[] {
  if (!days) return []
  const before = now - days * DAY
  return rows.filter((r) => Date.parse(r.touched) < before).map((r) => r.id)
}

let running: Promise<number> | null = null
export function expireContinue(): Promise<number> {
  running ??= (async () => {
    const days = (await getSettings()).continueDays
    if (!days) return 0
    const ids = expired(await continueAges(), days)
    if (ids.length) {
      await clearResume(ids)
      console.log(`continue expiry: cleared ${ids.length} resume points untouched for ${days} days`)
    }
    return ids.length
  })().finally(() => (running = null))
  return running
}

export function startContinueExpiry() {
  const run = () => void expireContinue().catch((e) => console.error('continue expiry:', e.message))
  setTimeout(run, 5 * 60_000).unref()
  setInterval(run, DAY).unref()
}
