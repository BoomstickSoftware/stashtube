// StashDB as the catalogue behind the shelf, against fakes of StashDB, Whisparr and Stash: the
// mapping, the merge of "already here / in Whisparr / only on StashDB", and the second write,
// which adds exactly one scene to Whisparr and never touches a studio or performer.
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import type { SdbScene } from './stashdb.ts'
import type { Movie } from './whisparr.ts'

// flix's own StashDB credentials, set before the modules read their config
process.env.STASHDB_URL = 'https://stashdb.test/graphql'
process.env.STASHDB_API_KEY = 'sdb-test'
const { dataCache } = await import('./stash.ts')
const { remoteImageUrl } = await import('./remote.ts')
const stashdb = await import('./stashdb.ts')
const { getRemote, mergeRemote, wanted, activityOf } = await import('./whisparr.ts')

const S1 = '11111111-1111-4111-8111-111111111111' // only on StashDB
const S2 = '22222222-2222-4222-8222-222222222222' // in Whisparr, no file
const S3 = '33333333-3333-4333-8333-333333333333' // already in Stash
const PERF = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const sdbScene = (id: string, date: string, title = `Scene ${id.slice(0, 2)}`): SdbScene => ({
  id,
  title,
  release_date: date,
  duration: 1500,
  studio: { id: 'st', name: 'Studio A' },
  performers: [
    { performer: { id: PERF, name: 'Ann' }, as: null },
    { performer: { id: 'b', name: 'Bob' }, as: 'Robert' },
  ],
  images: [
    { url: 'https://stashdb.org/images/small', width: 320, height: 180 },
    { url: 'https://stashdb.org/images/big', width: 1280, height: 720 },
  ],
})
const catalogue = [sdbScene(S1, '2026-06-01'), sdbScene(S2, '2026-05-01'), sdbScene(S3, '2026-04-01')]

const movie = (over: Partial<Movie> & { id: number }): Movie => ({
  title: `W${over.id}`,
  path: `/x/${over.id}`,
  hasFile: false,
  monitored: false,
  itemType: 'scene',
  releaseDate: '2026-05-01T00:00:00Z',
  studioTitle: 'Studio A',
  studioForeignId: 'st',
  performerNames: ['Ann'],
  performerForeignIds: [PERF],
  qualityProfileId: 7,
  rootFolderPath: '/data/adult',
  ...over,
})
const library: Movie[] = [movie({ id: 2, stashId: S2 })]

const sent: { host: string; method: string; path: string; body?: unknown }[] = []
let lookupHit: Partial<Movie> = { id: 0, stashId: S1, itemType: 'scene', studioForeignId: 'st', title: 'New one' }
const fake: typeof fetch = async (url, init) => {
  const u = new URL(String(url))
  const method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  sent.push({ host: u.host, method, path: u.pathname + u.search, body })
  const json = (v: unknown) => Response.json(v)
  if (u.host === 'stashdb.test') {
    assert.equal(init?.headers && (init.headers as Record<string, string>).ApiKey, 'sdb-test')
    const input = body.variables.input
    assert.deepEqual(Object.keys(input).sort(), ['direction', 'page', 'per_page', 'performers', 'sort'])
    assert.deepEqual(input.performers, { value: [PERF], modifier: 'INCLUDES' })
    return json({ data: { queryScenes: { count: 30, scenes: input.page === 1 ? catalogue : [sdbScene('44444444-4444-4444-8444-444444444444', '2026-01-01')] } } })
  }
  if (u.host === 'stash.test') {
    if (/findScenes/.test(body.query)) return json({ data: { findScenes: { scenes: [{ id: '77', stash_ids: [{ stash_id: S3 }] }] } } })
    return new Response('', { status: 404 })
  }
  // Whisparr
  const path = u.pathname.replace('/api/v3', '')
  if (path === '/movie' && method === 'GET') return json(library)
  if (path === '/movie' && method === 'POST') return json({ ...body, id: 99 })
  if (path === '/movie/lookup') return json([lookupHit])
  if (path === '/movie/2') return json(method === 'PUT' ? { ...library[0], monitored: true } : library[0])
  if (path.startsWith('/queue')) return json({ records: [] })
  if (path.startsWith('/history')) return json({ records: [] })
  if (path === '/command') return json({ id: 1 })
  if (path === '/qualityprofile') return json([{ id: 3 }])
  if (path === '/rootfolder') return json([{ path: '/root' }])
  return new Response('', { status: 404 })
}

const realFetch = globalThis.fetch
before(() => {
  globalThis.fetch = fake
})
after(() => {
  globalThis.fetch = realFetch
})
beforeEach(() => {
  sent.length = 0
  dataCache.invalidate('whisparr', 'stashdb', 'scene')
  lookupHit = { id: 0, stashId: S1, itemType: 'scene', studioForeignId: 'st', title: 'New one' }
})

describe('StashDB catalogue', () => {
  it('maps a StashDB scene to a remote card with the widest cover and aliases', () => {
    const w = stashdb.toRemote(catalogue[0]!)
    assert.deepEqual(w, {
      whisparrId: null,
      stashdbId: S1,
      title: 'Scene 11',
      date: '2026-06-01',
      studio: 'Studio A',
      performers: ['Ann', 'Robert'],
      image: remoteImageUrl('https://stashdb.org/images/big'), // the widest, through the proxy
      runtime: 25,
      state: 'remote',
    })
    assert.ok(w.image!.startsWith('/media/remote/'))
  })

  it('merges: drops what Stash has, keeps Whisparr state, marks the rest remote', () => {
    const byStashId = new Map(library.map((m) => [m.stashId!, m]))
    const inStash = new Map([[S3, '77']])
    const out = mergeRemote(catalogue, byStashId, activityOf([], []), inStash)
    assert.deepEqual(out.map((w) => [w.stashdbId, w.whisparrId, w.state]), [
      [S1, null, 'remote'],
      [S2, 2, 'available'],
    ])
  })

  it('pages the catalogue, newest first, and says where it came from', async () => {
    const p1 = await wanted({ performers: [PERF, 'not-a-uuid'] }, 1)
    assert.equal(p1.source, 'stashdb')
    assert.equal(p1.hasMore, true) // 30 on StashDB, 24 a page
    assert.deepEqual(p1.items.map((w) => w.state), ['remote', 'available'])
    const p2 = await wanted({ performers: [PERF] }, 2)
    assert.equal(p2.page, 2)
    assert.equal(p2.hasMore, false)
    assert.equal(p2.items.length, 1)
  })
})

describe('getRemote', () => {
  it('adds exactly one scene, monitored and searched, placed like its studio siblings', async () => {
    const w = await getRemote(S1)
    const whisparr = sent.filter((s) => s.host === 'whisparr.test')
    assert.deepEqual(whisparr.filter((s) => s.method !== 'GET').map((s) => [s.method, s.path]), [['POST', '/api/v3/movie']])
    assert.equal(whisparr.filter((s) => s.path.startsWith('/api/v3/movie/lookup')).length, 1)
    assert.equal(whisparr.find((s) => s.path.startsWith('/api/v3/movie/lookup'))!.path, `/api/v3/movie/lookup?term=stash%3A${S1}`)
    const post = whisparr.find((s) => s.method === 'POST')!.body as Record<string, unknown>
    assert.equal(post.monitored, true)
    assert.equal(post.qualityProfileId, 7)
    assert.equal(post.rootFolderPath, '/data/adult')
    assert.deepEqual(post.addOptions, { searchForMovie: true, monitor: 'movieOnly' })
    assert.equal(post.stashId, S1)
    assert.equal(w.state, 'grabbed')
    assert.equal(w.whisparrId, 99)
  })

  it('falls back to Whisparr\'s first profile and root folder when no sibling exists', async () => {
    lookupHit = { ...lookupHit, studioForeignId: 'other' }
    library.length = 0
    try {
      await getRemote(S1)
      const post = sent.find((s) => s.method === 'POST' && s.path === '/api/v3/movie')!.body as Record<string, unknown>
      assert.equal(post.qualityProfileId, 3)
      assert.equal(post.rootFolderPath, '/root')
    } finally {
      library.push(movie({ id: 2, stashId: S2 }))
    }
  })

  it('hands a scene Whisparr already has to the single-id path (no second add)', async () => {
    lookupHit = { id: 2, stashId: S2, itemType: 'scene', monitored: false }
    await getRemote(S2)
    const writes = sent.filter((s) => s.host === 'whisparr.test' && s.method !== 'GET').map((s) => [s.method, s.path])
    assert.deepEqual(writes, [
      ['PUT', '/api/v3/movie/2'],
      ['POST', '/api/v3/command'],
    ])
    assert.deepEqual(sent.find((s) => s.path === '/api/v3/command')!.body, { name: 'MoviesSearch', movieIds: [2] })
  })

  it('refuses anything but one StashDB uuid, and refuses films', async () => {
    for (const bad of [undefined, 42, 'stash:abc', `${S1},${S2}`, [S1]]) await assert.rejects(getRemote(bad), RangeError)
    lookupHit = { ...lookupHit, itemType: 'movie' }
    await assert.rejects(getRemote(S1), /only scenes/)
    assert.equal(sent.filter((s) => s.method === 'POST').length, 0)
  })
})
