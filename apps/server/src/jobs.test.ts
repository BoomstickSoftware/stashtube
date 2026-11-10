// The job registry (jobs.ts) with a fake clock, timer and store: nothing waits, nothing is read.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRegistry, type JobStore } from './jobs.ts'

const HOUR = 3_600_000
const DAY = 24 * HOUR

// A registry whose timers fire only when the test says so.
function harness(saved: Record<string, number> = {}) {
  let now = 1_000_000_000_000
  const timers: { at: number; fn: () => void }[] = []
  const store: JobStore = {
    get: async (name) => saved[name] ?? null,
    set: async (name, at) => void (saved[name] = at),
  }
  const registry = createRegistry(store, { now: () => now, timer: (fn, ms) => timers.push({ at: now + ms, fn }) })
  const settle = () => new Promise((r) => setTimeout(r, 0))
  // Move the clock, firing each timer that comes due (and the ones those arm), in order.
  const advance = async (ms: number) => {
    const until = now + ms
    for (;;) {
      timers.sort((a, b) => a.at - b.at)
      if (!timers[0] || timers[0].at > until) break
      const t = timers.shift()!
      now = t.at
      t.fn()
      await settle()
    }
    now = until
  }
  return { registry, advance, settle, saved, start: () => registry.start(), now: () => now }
}

describe('job registry', () => {
  it('runs first after `firstAfter`, then every `every`, and reports it', async () => {
    const h = harness()
    let runs = 0
    const job = h.registry.register({ name: 'tick', every: HOUR, firstAfter: 60_000, run: async () => void runs++ })
    await h.start()
    assert.equal(job.status().nextRun, new Date(h.now() + 60_000).toISOString())
    await h.advance(59_000)
    assert.equal(runs, 0)
    await h.advance(1_000)
    assert.equal(runs, 1)
    await h.advance(3 * HOUR)
    assert.equal(runs, 4)
    const s = job.status()
    assert.deepEqual([s.name, s.everyMs, s.running, s.runs, s.lastError, s.skipped], ['tick', HOUR, false, 4, null, 0])
    assert.ok(s.lastRun && s.nextRun)
  })

  it('never runs a job twice at once: a trigger or a tick during a run joins it', async () => {
    const h = harness()
    let started = 0
    let finish = () => {}
    const job = h.registry.register({ name: 'slow', every: HOUR, firstAfter: 0, run: () => new Promise<void>((r) => (started++, (finish = r))) })
    await h.start()
    await h.advance(0)
    assert.equal(started, 1)
    assert.equal(job.status().running, true)
    const a = job.trigger()
    const b = job.trigger()
    assert.equal(a, b)
    await h.advance(2 * HOUR) // two more ticks while it still runs
    assert.equal(started, 1)
    finish()
    await a
    assert.equal(job.status().running, false)
    const again = job.trigger() // a new run once the first is over
    assert.equal(started, 2)
    finish()
    await again
  })

  it('records a failure and carries on; trigger() never rejects', async () => {
    const h = harness()
    let fail = true
    const job = h.registry.register({ name: 'flaky', every: HOUR, firstAfter: 0, persist: true, run: async () => {
      if (fail) throw new Error('upstream down')
    } })
    await h.start()
    await h.advance(0)
    assert.equal(job.status().lastError, 'upstream down')
    assert.equal(h.saved.flaky, undefined) // a failed run is not recorded as the last run
    fail = false
    await job.trigger()
    assert.equal(job.status().lastError, null)
    assert.equal(typeof h.saved.flaky, 'number')
  })

  it('persists the last run: after a restart a daily job waits out the rest of its day', async () => {
    const first = harness()
    let runs = 0
    first.registry.register({ name: 'daily', every: DAY, firstAfter: 5 * 60_000, persist: true, run: async () => void runs++ })
    await first.start()
    await first.advance(5 * 60_000)
    assert.equal(runs, 1)
    const ranAt = first.saved.daily
    assert.equal(ranAt, first.now())

    // "a deploy" three hours later: a new registry over the same store
    const second = harness({ daily: ranAt })
    const now = second.now()
    second.saved.daily = now - 3 * HOUR
    const job = second.registry.register({ name: 'daily', every: DAY, firstAfter: 5 * 60_000, persist: true, run: async () => void runs++ })
    await second.start()
    assert.equal(job.status().nextRun, new Date(now + 21 * HOUR).toISOString())
    await second.advance(20 * HOUR)
    assert.equal(runs, 1)
    await second.advance(HOUR)
    assert.equal(runs, 2)
  })

  it('runs an overdue persisted job after `firstAfter`, and a job without persist after every start', async () => {
    const h = harness({ old: 1 })
    let runs = 0
    h.registry.register({ name: 'old', every: DAY, firstAfter: 60_000, persist: true, run: async () => void runs++ })
    h.registry.register({ name: 'fresh', every: DAY, firstAfter: 60_000, run: async () => void runs++ })
    await h.start()
    await h.advance(60_000)
    assert.equal(runs, 2)
  })

  it('asks the gate on each tick: false skips the run, the check itself still happens; a trigger is not gated', async () => {
    const h = harness()
    let open = false
    let asked = 0
    let runs = 0
    const job = h.registry.register({ name: 'gated', every: HOUR, firstAfter: 0, gate: () => (asked++, open), run: async () => void runs++ })
    await h.start()
    await h.advance(2 * HOUR)
    assert.deepEqual([asked, runs, job.status().skipped], [3, 0, 3])
    open = true
    await h.advance(HOUR)
    assert.deepEqual([asked, runs], [4, 1])
    open = false
    await job.trigger()
    assert.equal(runs, 2)
  })

  it('hands the gate the last run, and runs when the gate itself fails', async () => {
    const h = harness()
    const seen: (number | null)[] = []
    let runs = 0
    h.registry.register({ name: 'g', every: HOUR, firstAfter: 0, gate: ({ lastRun }) => {
      seen.push(lastRun)
      if (seen.length === 2) throw new Error('no answer')
      return true
    }, run: async () => void runs++ })
    await h.start()
    const t0 = h.now()
    await h.advance(HOUR)
    assert.deepEqual(seen, [null, t0])
    assert.equal(runs, 2)
  })

  it('schedules nothing before start, runs a job without `firstAfter` only on trigger, and refuses a duplicate name', async () => {
    const h = harness()
    let runs = 0
    const manual = h.registry.register({ name: 'manual', run: async () => void runs++ })
    h.registry.register({ name: 'timed', every: HOUR, firstAfter: 0, run: async () => void runs++ })
    await h.advance(DAY)
    assert.equal(runs, 0)
    await h.start()
    await h.advance(0)
    assert.equal(runs, 1)
    assert.equal(manual.status().nextRun, null)
    await manual.trigger()
    assert.equal(runs, 2)
    assert.throws(() => h.registry.register({ name: 'manual', run: async () => {} }), /registered twice/)
    assert.deepEqual(h.registry.status().map((s) => s.name), ['manual', 'timed'])
  })
})
