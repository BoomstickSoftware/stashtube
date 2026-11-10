// The job registry: every background runner flix has, registered by name with its interval.
// One place gives each of them what they used to hand-roll (_eight timers with their own
// `running` flags until 2026-11-10_):
// - an overlap guard: a tick or a trigger() while the job runs joins that run, never a second;
// - status: last run, last error, last duration, the next run (GET /api/admin/cache `jobs`);
// - `gate`: asked on each tick; false skips the tick (a trigger() runs regardless);
// - `persist`: the last successful run is kept in Postgres, so after a restart the first run
//   waits until `every` has passed since it. A "daily" job runs daily, not "five minutes after
//   every deploy".
// Modules register at import; nothing is scheduled until start() (index.ts), so a test that
// imports a module starts no timer. A job without `firstAfter` runs only when triggered.
import { eq } from 'drizzle-orm'
import { db } from './db/index.ts'
import { settings } from './db/schema.ts'

export interface JobSpec {
  name: string
  every?: number // ms between runs; none: only the first run and triggers
  firstAfter?: number // ms after start() for the first run; none: never on a timer
  run: () => Promise<unknown>
  gate?: (job: { lastRun: number | null }) => boolean | Promise<boolean>
  persist?: boolean
}

export interface JobState {
  name: string
  everyMs: number | null
  running: boolean
  lastRun: string | null // when the last run started
  lastDurationMs: number | null
  lastError: string | null // of the last run; null when it succeeded
  runs: number
  skipped: number // ticks the gate turned down
  nextRun: string | null
}

export interface Job {
  name: string
  trigger(): Promise<void> // run now (or join the run in progress); never rejects
  status(): JobState
}

// Where `persist` keeps the last successful run (ms since the epoch).
export interface JobStore {
  get(name: string): Promise<number | null>
  set(name: string, at: number): Promise<void>
}

type Timer = (fn: () => void, ms: number) => unknown
const unrefTimer: Timer = (fn, ms) => setTimeout(fn, ms).unref()

export function createRegistry(store: JobStore, opts: { timer?: Timer; now?: () => number } = {}) {
  const timer = opts.timer ?? unrefTimer
  const now = opts.now ?? Date.now
  const jobs = new Map<string, { job: Job; schedule: () => Promise<void> }>()
  let started = false

  function register(spec: JobSpec): Job {
    if (jobs.has(spec.name)) throw new Error(`job ${spec.name} is registered twice`)
    let running: Promise<void> | null = null
    let lastRun: number | null = null
    let lastDurationMs: number | null = null
    let lastError: string | null = null
    let runs = 0
    let skipped = 0
    let nextAt: number | null = null

    const trigger = (): Promise<void> => {
      running ??= (async () => {
        const at = now()
        lastRun = at
        runs++
        try {
          await spec.run()
          lastError = null
          if (spec.persist) await store.set(spec.name, at).catch((e: Error) => console.error(`job ${spec.name}: could not record its run: ${e.message}`))
        } catch (e) {
          lastError = (e as Error).message
          console.error(`job ${spec.name}:`, lastError)
        } finally {
          lastDurationMs = now() - at
          running = null
        }
      })()
      return running
    }

    const arm = (ms: number) => {
      nextAt = now() + ms
      timer(() => void tick(), ms)
    }
    const tick = async () => {
      nextAt = null
      if (spec.every) arm(spec.every) // from the tick, not the end of the run: the period holds
      let due = true
      try {
        if (spec.gate) due = await spec.gate({ lastRun })
      } catch (e) {
        console.error(`job ${spec.name}: gate:`, (e as Error).message) // an unanswered gate does not hold the job back
      }
      if (due) await trigger()
      else skipped++
    }
    const schedule = async () => {
      if (spec.firstAfter === undefined) return
      let wait = spec.firstAfter
      if (spec.persist) {
        lastRun = await store.get(spec.name).catch(() => null)
        if (lastRun !== null && spec.every) wait = Math.max(wait, lastRun + spec.every - now())
      }
      arm(wait)
    }

    const job: Job = {
      name: spec.name,
      trigger,
      status: () => ({
        name: spec.name,
        everyMs: spec.every ?? null,
        running: !!running,
        lastRun: lastRun === null ? null : new Date(lastRun).toISOString(),
        lastDurationMs,
        lastError,
        runs,
        skipped,
        nextRun: nextAt === null ? null : new Date(nextAt).toISOString(),
      }),
    }
    jobs.set(spec.name, { job, schedule })
    if (started) void schedule()
    return job
  }

  // Schedule every registered job's first run; one registered later is scheduled at once.
  async function start() {
    if (started) return
    started = true
    await Promise.all([...jobs.values()].map((j) => j.schedule()))
  }

  const status = (): JobState[] => [...jobs.values()].map((j) => j.job.status())

  return { register, start, status }
}

// The `settings` table is the key/value store flix already has: one row per persisted job,
// `job:<name>` → { lastRun } (settings.ts leaves these rows out of the settings it serves).
const settingsStore: JobStore = {
  async get(name) {
    const [row] = await db.select().from(settings).where(eq(settings.key, `job:${name}`))
    const at = Date.parse((row?.value as { lastRun?: string } | undefined)?.lastRun ?? '')
    return Number.isNaN(at) ? null : at
  },
  async set(name, at) {
    const value = { lastRun: new Date(at).toISOString() }
    await db.insert(settings).values({ key: `job:${name}`, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
  },
}

const registry = createRegistry(settingsStore)
export const register = registry.register
export const startJobs = registry.start
export const jobsStatus = registry.status
