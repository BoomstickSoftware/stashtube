import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GRACE, itemsOf, MAX_TURN_ON, planSync, refusal, type Entity, type Kind } from './sync.ts'

const TAG = 7
const NOW = Date.parse('2026-11-02T12:00:00Z')
const DAY = 86_400_000
const ent = (kind: Kind, id: number, foreignId: string, o: Partial<Entity> = {}): Entity => ({ kind, id, name: `${kind}${id}`, foreignId, monitored: false, whisparrMonitorNewItems: false, tags: [], ...o })
const watched = { monitored: true, whisparrMonitorNewItems: true }
const fav = (name: string, ...stashIds: string[]) => ({ name, stashIds })
const scene = (id: number, o: { monitored?: boolean; hasFile?: boolean; released?: number; performers?: string[]; studio?: string; stashId?: string } = {}) => ({
  id,
  title: `scene${id}`,
  stashId: o.stashId ?? null,
  monitored: o.monitored ?? true,
  hasFile: o.hasFile ?? false,
  releaseDate: o.released === undefined ? null : new Date(o.released).toISOString().slice(0, 10),
  performerForeignIds: o.performers ?? [],
  studioForeignId: o.studio ?? null,
})
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
    now: NOW,
    ...o,
  })

test('followed performers and studios not watched yet are turned on and their start recorded', () => {
  const p = plan({ favourites: { performer: [fav('A', 'a')], studio: [fav('S', 's')] }, entities: [ent('performer', 1, 'a'), ent('studio', 2, 's')] })
  assert.deepEqual(p.on.map((e) => [e.kind, e.id]), [['performer', 1], ['studio', 2]])
  assert.deepEqual(p.watchStart, [{ kind: 'performer', foreignId: 'a' }, { kind: 'studio', foreignId: 's' }])
  assert.equal(p.watched, 2)
})

test('one flag alone is not watching; both are needed', () => {
  const p = plan({ favourites: { performer: [fav('A', 'a')], studio: [] }, entities: [ent('performer', 1, 'a', { monitored: true, tags: [TAG] })] })
  assert.deepEqual(p.on.map((e) => e.id), [1])
})

test('a followed one already watched without the tag is only tagged', () => {
  const p = plan({ favourites: { performer: [fav('A', 'a')], studio: [] }, entities: [ent('performer', 1, 'a', watched)] })
  assert.deepEqual(p.adopt.map((e) => e.id), [1])
  assert.equal(p.on.length, 0)
})

test('any StashDB id of a favourite matches', () => {
  const p = plan({ favourites: { performer: [fav('A', 'old', 'new')], studio: [] }, entities: [ent('performer', 1, 'new')] })
  assert.deepEqual(p.on.map((e) => e.id), [1])
})

test('everything not followed is turned off, tagged or not, with the reason', () => {
  const p = plan({
    blocked: { performer: new Set(['b']), studio: new Set() },
    entities: [ent('performer', 1, 'a', { ...watched, tags: [TAG] }), ent('performer', 2, 'b', { whisparrMonitorNewItems: true }), ent('studio', 3, 's', { whisparrMonitorNewItems: true }), ent('studio', 4, 't')],
  })
  assert.deepEqual(p.off.map(({ e, reason }) => [e.id, reason]), [
    [1, 'no longer followed'],
    [2, 'blocked in flix'],
    [3, 'not followed in flix'],
  ])
})

test('blocked beats followed', () => {
  const p = plan({ favourites: { performer: [], studio: [fav('S', 's')] }, blocked: { performer: new Set(), studio: new Set(['s']) }, entities: [ent('studio', 1, 's', { ...watched, tags: [TAG] })] })
  assert.equal(p.on.length, 0)
  assert.deepEqual(p.off.map(({ reason }) => reason), ['blocked in flix'])
})

test('a followed one Whisparr does not know is reported missing', () => {
  const p = plan({ favourites: { performer: [], studio: [fav('S', 's')] } })
  assert.deepEqual(p.missing.map((f) => [f.kind, f.name]), [['studio', 'S']])
})

test('scenes: new releases of a watched one stay, older ones and strangers are unmonitored', () => {
  const since = new Map([['studio:s', NOW - 30 * DAY]])
  const p = plan({
    favourites: { performer: [], studio: [fav('S', 's')] },
    entities: [ent('studio', 1, 's', { ...watched, tags: [TAG] })],
    since,
    movies: [
      scene(10, { studio: 's', released: NOW - 2 * DAY }), // new release: stays
      scene(11, { studio: 's', released: NOW - 30 * DAY - GRACE + DAY }), // inside the grace: stays
      scene(12, { studio: 's', released: NOW - 400 * DAY }), // back catalogue: off
      scene(13, { studio: 'x', released: NOW - DAY }), // nobody followed: off
      scene(14, { studio: 's' }), // no date: off
      scene(15, { studio: 'x', monitored: false }), // already off
    ],
  })
  assert.deepEqual(p.scenes, [12, 13, 14])
  assert.deepEqual(p.sceneReasons, { 'released before the watch started': 2, 'not from a followed performer or studio': 1 })
})

test('scenes: a just-followed one counts from now, so its catalogue is trimmed at once', () => {
  const p = plan({
    favourites: { performer: [fav('A', 'a')], studio: [] },
    entities: [ent('performer', 1, 'a')],
    movies: [scene(20, { performers: ['a'], released: NOW - 3 * DAY }), scene(21, { performers: ['a'], released: NOW - 300 * DAY })],
  })
  assert.deepEqual(p.scenes, [21])
})

test('scenes: a Get or a download in progress is never unmonitored; a finished Get is cleaned up', () => {
  const p = plan({
    movies: [scene(30, { released: NOW - 999 * DAY }), scene(31, { released: NOW - 999 * DAY }), scene(32, { hasFile: true, monitored: false })],
    gets: new Set([30, 32]),
    busy: new Set([31]),
  })
  assert.deepEqual(p.scenes, [])
  assert.deepEqual(p.getsDone, [32])
})

test('a watch start for one no longer followed is forgotten', () => {
  const p = plan({ since: new Map([['performer:gone', NOW - DAY]]) })
  assert.deepEqual(p.watchEnd, [{ kind: 'performer', foreignId: 'gone' }])
})

test('the timer will not turn on more than the limit at once; a person running the script may', () => {
  const entities = Array.from({ length: MAX_TURN_ON + 1 }, (_, i) => ent('performer', i + 1, `x${i}`))
  const p = plan({ favourites: { performer: entities.map((e) => fav(e.name, e.foreignId)), studio: [] }, entities })
  assert.match(refusal(p, 0, false) ?? '', /to start watching at once/)
  assert.equal(refusal(p, 0, true), null)
})

test('watching far fewer than before is refused unless forced (Stash may have answered wrong)', () => {
  const entities = Array.from({ length: 6 }, (_, i) => ent('performer', i + 1, `x${i}`, { ...watched, tags: [TAG] }))
  const p = plan({ favourites: { performer: [fav('P', 'x0')], studio: [] }, entities })
  assert.match(refusal(p, 6, true) ?? '', /would watch 1 instead of 6/)
  assert.equal(refusal(p, 6, true, true), null)
})

test('items say what each change is and why', () => {
  const p = plan({ favourites: { performer: [fav('A', 'a'), fav('Gone', 'g')], studio: [] }, entities: [ent('performer', 1, 'a'), ent('studio', 2, 's', { monitored: true })] })
  assert.deepEqual(
    itemsOf(p).map((i) => [i.name, i.action]),
    [
      ['performer1', 'monitor'],
      ['studio2', 'unmonitor'],
      ['Gone', 'missing'],
    ],
  )
})

test('fetch: an unmonitored new release of a watched one is fetched, newest first', () => {
  const p = plan({
    favourites: { performer: [fav('A', 'a')], studio: [fav('S', 's')] },
    entities: [ent('performer', 1, 'a', { ...watched, tags: [TAG] }), ent('studio', 2, 's', { ...watched, tags: [TAG] })],
    since: new Map([['performer:a', NOW - 10 * DAY], ['studio:s', NOW - 10 * DAY]]),
    movies: [
      scene(40, { monitored: false, performers: ['a'], released: NOW - 3 * DAY }), // fetch
      scene(41, { monitored: false, studio: 's', released: NOW - DAY }), // fetch, newer
      scene(42, { monitored: false, studio: 's', released: NOW - 400 * DAY }), // old: no
      scene(43, { monitored: false, studio: 'x', released: NOW - DAY }), // not followed: no
      scene(44, { monitored: false, studio: 's', released: NOW - DAY, hasFile: true }), // has the file: no
      scene(45, { monitored: false, studio: 's', released: NOW - DAY, stashId: 'in-stash' }), // already in Stash: no
      scene(46, { monitored: true, studio: 's', released: NOW - DAY }), // already monitored: no
    ],
    owned: new Set(['in-stash']),
  })
  assert.deepEqual(p.fetch.map((m) => m.id), [41, 40])
  assert.deepEqual(p.scenes, []) // the monitored new release stays
})

test('fetch: nothing that is downloading, already a Get, or blocked', () => {
  const p = plan({
    favourites: { performer: [fav('A', 'a'), fav('B', 'b')], studio: [] },
    blocked: { performer: new Set(['b']), studio: new Set() },
    entities: [ent('performer', 1, 'a', { ...watched, tags: [TAG] }), ent('performer', 2, 'b')],
    movies: [
      scene(50, { monitored: false, performers: ['a'], released: NOW - DAY }),
      scene(51, { monitored: false, performers: ['a'], released: NOW - DAY }),
      scene(52, { monitored: false, performers: ['b'], released: NOW - DAY }),
    ],
    busy: new Set([50]),
    gets: new Set([51]),
  })
  assert.deepEqual(p.fetch, [])
})
