import assert from 'node:assert/strict'
import { test } from 'node:test'
import { itemsOf, MAX_FLAG_WRITES, planSync, refusal } from './sync.ts'
import type { WPerformer, WStudio } from './whisparr.ts'

const TAG = 7
const perf = (id: number, foreignId: string, o: Partial<WPerformer> = {}): WPerformer => ({ id, fullName: `P${id}`, foreignId, monitored: false, whisparrMonitorNewItems: false, tags: [], ...o })
const studio = (id: number, foreignId: string, o: Partial<WStudio> = {}): WStudio => ({ id, title: `S${id}`, foreignId, monitored: false, whisparrMonitorNewItems: false, tags: [], ...o })
const fav = (name: string, ...stashIds: string[]) => ({ name, stashIds })
const base = { favourites: [], blockedPerformers: new Set<string>(), blockedStudios: new Set<string>(), performers: [], studios: [], tagId: TAG }

test('a followed performer Whisparr does not watch is monitored', () => {
  const p = planSync({ ...base, favourites: [fav('A', 'a')], performers: [perf(1, 'a')] })
  assert.deepEqual(p.monitor.map((x) => x.id), [1])
  assert.equal(p.managedAfter, 1)
})

test('one with only one of the two flags on is monitored (both are needed for new releases)', () => {
  const p = planSync({ ...base, favourites: [fav('A', 'a')], performers: [perf(1, 'a', { monitored: true, tags: [TAG] })] })
  assert.deepEqual(p.monitor.map((x) => x.id), [1])
})

test('a followed performer already watched by hand is adopted (tagged), not rewritten', () => {
  const p = planSync({ ...base, favourites: [fav('A', 'a')], performers: [perf(1, 'a', { monitored: true, whisparrMonitorNewItems: true })] })
  assert.deepEqual(p.adopt.map((x) => x.id), [1])
  assert.equal(p.monitor.length, 0)
})

test('nothing to do when a followed performer is watched and tagged', () => {
  const p = planSync({ ...base, favourites: [fav('A', 'a')], performers: [perf(1, 'a', { monitored: true, whisparrMonitorNewItems: true, tags: [TAG] })] })
  assert.equal(p.monitor.length + p.adopt.length + p.unmonitor.length, 0)
})

test('any of a performer\'s StashDB ids matches (duplicates merged on StashDB)', () => {
  const p = planSync({ ...base, favourites: [fav('A', 'old', 'new')], performers: [perf(1, 'new')] })
  assert.deepEqual(p.monitor.map((x) => x.id), [1])
})

test('a tagged performer no longer followed is unmonitored', () => {
  const p = planSync({ ...base, performers: [perf(1, 'a', { monitored: true, whisparrMonitorNewItems: true, tags: [TAG, 3] })] })
  assert.deepEqual(p.unmonitor.map((u) => [u.p.id, u.reason]), [[1, 'no longer followed']])
})

test('a performer monitored by hand without the tag is reported, never changed', () => {
  const p = planSync({ ...base, performers: [perf(1, 'a', { monitored: true, whisparrMonitorNewItems: true })] })
  assert.equal(p.unmonitor.length, 0)
  assert.deepEqual(p.unmanaged.map((x) => x.id), [1])
})

test('blocked wins over followed, and a blocked performer is unmonitored even when set by hand', () => {
  const p = planSync({
    ...base,
    favourites: [fav('A', 'a')],
    blockedPerformers: new Set(['a', 'b']),
    performers: [perf(1, 'a', { monitored: true, whisparrMonitorNewItems: true, tags: [TAG] }), perf(2, 'b', { whisparrMonitorNewItems: true })],
  })
  assert.equal(p.monitor.length, 0)
  assert.deepEqual(p.unmonitor.map((u) => [u.p.id, u.reason]), [
    [1, 'blocked in flix'],
    [2, 'blocked in flix (was set in Whisparr by hand)'],
  ])
})

test('a blocked studio Whisparr monitors is unmonitored; an unblocked one is left alone', () => {
  const p = planSync({ ...base, blockedStudios: new Set(['s']), studios: [studio(1, 's', { whisparrMonitorNewItems: true }), studio(2, 't', { monitored: true })] })
  assert.deepEqual(p.studios.map((s) => s.id), [1])
})

test('a followed performer Whisparr does not know is reported as missing', () => {
  const p = planSync({ ...base, favourites: [fav('A', 'a')] })
  assert.deepEqual(p.missing.map((f) => f.name), ['A'])
})

test('without the flix tag nothing counts as managed, so nothing is unmonitored for being unfollowed', () => {
  const p = planSync({ ...base, tagId: null, performers: [perf(1, 'a', { monitored: true, whisparrMonitorNewItems: true, tags: [TAG] })] })
  assert.equal(p.unmonitor.length, 0)
  assert.deepEqual(p.unmanaged.map((x) => x.id), [1])
})

test('too many monitoring changes at once are refused', () => {
  const performers = Array.from({ length: MAX_FLAG_WRITES + 1 }, (_, i) => perf(i + 1, `x${i}`))
  const p = planSync({ ...base, favourites: performers.map((x) => fav(x.fullName, x.foreignId)), performers })
  assert.match(refusal(p, 0) ?? '', /monitoring changes at once/)
})

test('adopting many is not a monitoring change and is allowed', () => {
  const performers = Array.from({ length: 30 }, (_, i) => perf(i + 1, `x${i}`, { monitored: true, whisparrMonitorNewItems: true }))
  const p = planSync({ ...base, favourites: performers.map((x) => fav(x.fullName, x.foreignId)), performers })
  assert.equal(p.adopt.length, 30)
  assert.equal(refusal(p, 0), null)
})

test('dropping most watched performers at once is refused (Stash may have answered wrong)', () => {
  const performers = Array.from({ length: 6 }, (_, i) => perf(i + 1, `x${i}`, { monitored: true, whisparrMonitorNewItems: true, tags: [TAG] }))
  const p = planSync({ ...base, favourites: [fav('P1', 'x0')], performers })
  assert.match(refusal(p, 6) ?? '', /would stop watching 5 of 6/)
  const one = planSync({ ...base, favourites: performers.slice(1).map((x) => fav(x.fullName, x.foreignId)), performers })
  assert.equal(refusal(one, 6), null)
})

test('items say what each change is and why', () => {
  const p = planSync({ ...base, favourites: [fav('A', 'a'), fav('Gone', 'g')], performers: [perf(1, 'a')] })
  assert.deepEqual(
    itemsOf(p).map((i) => [i.name, i.action]),
    [
      ['P1', 'monitor'],
      ['Gone', 'missing'],
    ],
  )
})
