// Whisparr against a fake: the mapping to WantedScene, the download state, and above all the
// one write, which must touch exactly one scene (the library policy: nothing monitored, nothing
// searched studio- or performer-wide; a bulk MoviesSearch once held imports up for hours).
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { dataCache } from './stash.ts'
import { activityOf, assertSingleId, getScene, stateOf, toWanted, wanted, wantedInWhisparr, type Movie } from './whisparr.ts'

const movie = (over: Partial<Movie> & { id: number }): Movie => ({
  title: `Scene ${over.id}`,
  path: `/x/${over.id}`,
  hasFile: false,
  monitored: false,
  itemType: 'scene',
  releaseDate: '2026-01-01T00:00:00Z',
  runtime: 30,
  studioTitle: 'Studio A',
  studioForeignId: 'studio-a',
  performerNames: ['Ann'],
  performerForeignIds: ['perf-ann'],
  images: [
    { coverType: 'poster', remoteUrl: 'https://img/poster' },
    { coverType: 'screenshot', remoteUrl: 'https://img/shot' },
  ],
  ...over,
})

const library: Movie[] = [
  movie({ id: 1, releaseDate: '2026-03-01T00:00:00Z' }),
  movie({ id: 2, releaseDate: '2026-04-01T00:00:00Z', hasFile: true }),
  movie({ id: 3, releaseDate: '2026-02-01T00:00:00Z', performerForeignIds: ['perf-bob'], studioForeignId: 'studio-b' }),
  movie({ id: 4, releaseDate: '2026-05-01T00:00:00Z', performerForeignIds: ['perf-bob', 'perf-ann'] }),
]

// Every request flix makes, so a test can assert what was (not) sent.
const sent: { method: string; path: string; body?: unknown }[] = []
const fakeWhisparr: typeof fetch = async (url, init) => {
  const path = String(url).replace('http://whisparr.test/api/v3', '')
  const method = init?.method ?? 'GET'
  sent.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
  const json = (v: unknown) => Response.json(v)
  if (path === '/movie') return json(library)
  if (path.startsWith('/movie/')) {
    const id = Number(path.slice(7))
    const m = library.find((x) => x.id === id)
    return m ? json(method === 'PUT' ? { ...m, monitored: true } : m) : new Response('', { status: 404 })
  }
  if (path.startsWith('/queue')) return json({ records: [{ movieId: 3 }] })
  if (path.startsWith('/history')) return json({ records: [{ movieId: 4, date: new Date().toISOString(), eventType: 'grabbed' }] })
  if (path === '/command') return json({ id: 1, name: 'MoviesSearch' })
  return new Response('', { status: 404 })
}

const realFetch = globalThis.fetch
before(() => {
  globalThis.fetch = fakeWhisparr
})
after(() => {
  globalThis.fetch = realFetch
})
beforeEach(() => {
  sent.length = 0
  dataCache.invalidate('whisparr')
})

describe('wanted scenes', () => {
  it('derive the state from file, queue and recent grabs, in that order', () => {
    const now = Date.parse('2026-06-01T12:00:00Z')
    const a = activityOf([{ movieId: 3 }], [
      { movieId: 4, date: '2026-06-01T10:00:00Z', eventType: 'grabbed' },
      { movieId: 5, date: '2026-05-01T10:00:00Z', eventType: 'grabbed' }, // too old to count
      { movieId: 3, date: '2026-06-01T09:00:00Z', eventType: 'grabbed' },
    ], now)
    assert.equal(stateOf(movie({ id: 2, hasFile: true }), a), 'downloaded')
    assert.equal(stateOf(movie({ id: 3 }), a), 'downloading') // in the queue beats grabbed
    assert.equal(stateOf(movie({ id: 4 }), a), 'grabbed')
    assert.equal(stateOf(movie({ id: 5 }), a), 'available')
    assert.equal(stateOf(movie({ id: 6 }), a), 'available')
  })

  it('map a movie to a card, preferring the screenshot and a plain date', () => {
    const w = toWanted(movie({ id: 1 }), activityOf([], []))
    assert.deepEqual(w, {
      whisparrId: 1,
      stashdbId: null,
      title: 'Scene 1',
      date: '2026-01-01',
      studio: 'Studio A',
      performers: ['Ann'],
      image: 'https://img/shot',
      runtime: 30,
      state: 'available',
    })
    const bare = toWanted(movie({ id: 9, releaseDate: null, images: [], studioTitle: '', runtime: 0, performerNames: undefined }), activityOf([], []))
    assert.deepEqual([bare.date, bare.image, bare.studio, bare.runtime, bare.performers], [null, null, null, null, []])
  })

  it('list a performer\'s or studio\'s scenes without a file, newest first, with their state', async () => {
    const ann = await wantedInWhisparr({ performers: ['perf-ann'] })
    assert.deepEqual(ann.map((w) => [w.whisparrId, w.state]), [[4, 'grabbed'], [1, 'available']]) // 2 has a file
    const b = await wantedInWhisparr({ studios: ['studio-b'] })
    assert.deepEqual(b.map((w) => [w.whisparrId, w.state]), [[3, 'downloading']])
    assert.deepEqual(await wantedInWhisparr({}), [])
    // without StashDB (this fake Stash has no stash-box settings) the shelf is Whisparr's list
    const page = await wanted({ performers: ['perf-ann'] })
    assert.equal(page.source, 'whisparr')
    assert.deepEqual(page.items.map((w) => w.whisparrId), [4, 1])
    assert.equal(page.hasMore, false)
    // the 25 MB list is fetched once for both
    assert.equal(sent.filter((s) => s.path === '/movie').length, 1)
  })
})

describe('getScene, the one write', () => {
  it('monitors the one scene and searches for it alone', async () => {
    const w = await getScene(1)
    const writes = sent.filter((s) => s.method !== 'GET')
    assert.deepEqual(writes.map((s) => [s.method, s.path]), [['PUT', '/movie/1'], ['POST', '/command']])
    assert.equal((writes[0]!.body as Movie).monitored, true)
    assert.equal((writes[0]!.body as Movie).id, 1)
    assert.deepEqual(writes[1]!.body, { name: 'MoviesSearch', movieIds: [1] })
    assert.equal(w.state, 'grabbed')
  })

  it('skips the monitor call when the scene already is', async () => {
    library.push(movie({ id: 7, monitored: true }))
    try {
      await getScene(7)
      assert.deepEqual(sent.filter((s) => s.method !== 'GET').map((s) => s.method), ['POST'])
    } finally {
      library.pop()
    }
  })

  it('refuses anything but one positive integer, before any request', async () => {
    for (const bad of ['1', [1], [1, 2], 0, -3, 1.5, NaN, null, undefined, { id: 1 }]) {
      await assert.rejects(getScene(bad), RangeError)
      assert.throws(() => assertSingleId(bad), RangeError)
    }
    assert.equal(sent.length, 0)
    assert.equal(assertSingleId(12), 12)
  })

  it('refuses a feature film', async () => {
    library.push(movie({ id: 8, itemType: 'movie' }))
    try {
      await assert.rejects(getScene(8), RangeError)
      assert.deepEqual(sent.filter((s) => s.method !== 'GET'), [])
    } finally {
      library.pop()
    }
  })
})
