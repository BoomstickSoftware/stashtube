import assert from 'node:assert/strict'
import { describe, it, test } from 'node:test'
import { itemsOf, planSync, refusal, timedRunDue, type Entity, type Kind, stillUnwanted } from './sync.ts'
import { changedSince } from './categorySync.ts'

const TAG = 7
const ent = (kind: Kind, id: number, foreignId: string, o: Partial<Entity> = {}): Entity => ({ kind, id, name: `${kind}${id}`, foreignId, monitored: false, whisparrMonitorNewItems: false, tags: [], ...o })
const fav = (name: string, ...stashIds: string[]) => ({ name, stashIds })
const scene = (id: number, o: { monitored?: boolean; hasFile?: boolean } = {}) => ({ id, monitored: o.monitored ?? true, hasFile: o.hasFile ?? false })
type In = Parameters<typeof planSync>[0]
const plan = (o: Partial<In> = {}) =>
  planSync({
    favourites: { performer: [], studio: [] },
    blocked: { performer: new Set(), studio: new Set() },
    entities: [],
    movies: [],
    busy: new Set(),
    gets: new Set(),
    since: new Map(),
    tagId: TAG,
    ...o,
  })

test('every performer and studio with a flag on, or the old tag, is turned off; followed ones too', () => {
  const p = plan({
    favourites: { performer: [fav('A', 'a')], studio: [] },
    entities: [
      ent('performer', 1, 'a', { monitored: true, whisparrMonitorNewItems: true }), // followed: still off, flix discovers
      ent('performer', 2, 'b', { whisparrMonitorNewItems: true }), // Whisparr's default on add
      ent('studio', 3, 's', { tags: [TAG] }), // the old tag only
      ent('studio', 4, 't'), // already off
    ],
  })
  assert.deepEqual(p.off.map((e) => e.id), [1, 2, 3])
  assert.deepEqual(itemsOf(p).map((i) => [i.name, i.action]), [
    ['performer1', 'unmonitor'],
    ['performer2', 'unmonitor'],
    ['studio3', 'unmonitor'],
  ])
})

test('only scenes flix fetched, or downloading, stay monitored', () => {
  const p = plan({
    movies: [scene(10), scene(11), scene(12), scene(13, { monitored: false }), scene(14, { hasFile: true })],
    gets: new Set([10]),
    busy: new Set([11]),
  })
  assert.deepEqual(p.scenes, [12, 14])
})

test('a fetched scene whose file arrived is cleaned from the Get list', () => {
  const p = plan({ movies: [scene(20, { hasFile: true }), scene(21)], gets: new Set([20, 21]) })
  assert.deepEqual(p.getsDone, [20])
  assert.deepEqual(p.scenes, [])
})

test('follow starts of performers and studios no longer followed (or now blocked) are forgotten', () => {
  const p = plan({
    favourites: { performer: [fav('A', 'a'), fav('B', 'b')], studio: [fav('S', 's')] },
    blocked: { performer: new Set(['b']), studio: new Set() },
    since: new Map([
      ['performer:a', 1],
      ['performer:b', 1],
      ['performer:gone', 1],
      ['studio:s', 1],
    ]),
  })
  assert.deepEqual(p.watchEnd, [
    { kind: 'performer', foreignId: 'b' },
    { kind: 'performer', foreignId: 'gone' },
  ])
  assert.equal(p.followed, 2)
})

test('far fewer follows than recorded is refused unless forced', () => {
  const since = new Map(Array.from({ length: 6 }, (_, i) => [`performer:x${i}`, 1] as [string, number]))
  const p = plan({ favourites: { performer: [fav('P', 'x0')], studio: [] }, since })
  assert.match(refusal(p, 6) ?? '', /1 followed against 6 recorded/)
  assert.equal(refusal(p, 6, true), null)
  const fine = plan({ favourites: { performer: Array.from({ length: 5 }, (_, i) => fav(`P${i}`, `x${i}`)), studio: [] }, since })
  assert.equal(refusal(fine, 6), null)
})

test('the timed run: never while off, every tick while flix is in use, hourly when idle', () => {
  const min = 60_000
  assert.equal(timedRunDue({ enabled: false, active: true, sinceLast: Infinity }), false)
  assert.equal(timedRunDue({ enabled: true, active: true, sinceLast: 15 * min }), true)
  assert.equal(timedRunDue({ enabled: true, active: false, sinceLast: 45 * min }), false)
  assert.equal(timedRunDue({ enabled: true, active: false, sinceLast: 60 * min }), true)
  assert.equal(timedRunDue({ enabled: true, active: false, sinceLast: Infinity }), true, 'the first run after start')
})

describe('the write, after the lists were read', () => {
  const HOUR = 3_600_000
  it('leaves alone a scene fetched since the plan was made', () => {
    assert.deepEqual(stillUnwanted([1, 2, 3], new Set([2]), new Map()), [1, 3])
  })
  it('leaves alone a scene requested within the hour, and unmonitors one requested longer ago', () => {
    const now = 10 * HOUR
    assert.deepEqual(stillUnwanted([1, 2, 3], new Set(), new Map([[1, now - 5_000], [3, now - 2 * HOUR]]), now), [2, 3])
  })
  it('unmonitors the whole plan when nothing was fetched meanwhile', () => {
    assert.deepEqual(stillUnwanted([1, 2], new Set([9]), new Map([[8, Date.now()]])), [1, 2])
  })
})

describe('the hourly category check', () => {
  it('syncs when nothing has synced yet, when the fingerprint is unknown and when it moved', () => {
    assert.equal(changedSince(null, 'a'), true)
    assert.equal(changedSince('a', null), true)
    assert.equal(changedSince('a', 'b'), true)
  })
  it('skips the whole-library reads when the library is as the last sync left it', () => {
    assert.equal(changedSince('a', 'a'), false)
  })
})
