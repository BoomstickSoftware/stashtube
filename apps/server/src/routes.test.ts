// The API's input validation and error mapping, through the real routes and the real error
// handler with app.request(): no server, no Postgres. Stash and Whisparr are a fake fetch that
// counts what reaches it; a request that must be refused has to be refused before anything does.
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Hono } from 'hono'
import { api } from './api.ts'
import { errorHandler } from './errors.ts'

const app = new Hono().route('/api', api).onError(errorHandler)

let upstream: (url: string) => Response | Promise<Response> = () => Response.json({ data: {} })
const reached: string[] = []
const realFetch = globalThis.fetch
const realError = console.error
before(() => {
  globalThis.fetch = (async (url: string | URL | Request) => {
    reached.push(String(url))
    return upstream(String(url))
  }) as typeof fetch
  console.error = () => {} // the handler logs each upstream failure
})
after(() => {
  globalThis.fetch = realFetch
  console.error = realError
})
beforeEach(() => {
  reached.length = 0
  upstream = () => Response.json({ data: {} })
})

const send = (method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, { method, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' } }) })

// Every route that hands a path id to Stash, with a body that would otherwise be accepted.
const STASH_ID_ROUTES: [string, string, unknown?][] = [
  ['GET', '/scenes/ID'],
  ['GET', '/scenes/ID/related'],
  ['PUT', '/scenes/ID/rating', { rating: 4 }],
  ['POST', '/scenes/ID/play'],
  ['POST', '/scenes/ID/watched'],
  ['POST', '/scenes/ID/activity', { resumeTime: 1, playDuration: 1 }],
  ['POST', '/scenes/ID/o'],
  ['PATCH', '/scenes/ID', { title: 'x' }],
  ['PUT', '/scenes/ID/unlisted'],
  ['DELETE', '/scenes/ID/unlisted'],
  ['DELETE', '/scenes/ID/hidden'],
  ['POST', '/scenes/ID/markers', { seconds: 1 }],
  ['PUT', '/scenes/ID/markers/2', { title: 'x' }],
  ['PUT', '/scenes/1/markers/ID', { title: 'x' }],
  ['DELETE', '/scenes/1/markers/ID'],
  ['POST', '/scenes/ID/identify'],
  ['PUT', '/scenes/ID/cast', { F: 1, M: 1, X: 0 }],
  ['GET', '/jobs/ID'],
  ['GET', '/performers/ID'],
  ['PUT', '/performers/ID/favorite', { favorite: true }],
  ['PUT', '/performers/ID/rating', { rating: 4 }],
  ['GET', '/studios/ID'],
  ['PUT', '/studios/ID/favorite', { favorite: true }],
  ['PUT', '/studios/ID/intro', { seconds: 5 }],
  ['PUT', '/studios/ID/categories', { tagIds: [] }],
  ['GET', '/tags/ID'],
  ['PUT', '/tags/ID/favorite', { favorite: true }],
  ['PUT', '/blocklist/performer/ID'],
  ['PUT', '/unlisted/studio/ID'],
  ['GET', '/whisparr/performer/ID'],
  ['GET', '/whisparr/studio/ID'],
  ['GET', '/whisparr/watch/performer/ID'],
  ['GET', '/discover/from/performer/ID'],
]

describe('ids in the path', () => {
  for (const bad of ['abc', '1%20OR%201', '12abc', '-1']) {
    it(`refuses ${JSON.stringify(decodeURIComponent(bad))} with 400 on every route that sends an id to Stash, before anything is sent`, async () => {
      for (const [method, path, body] of STASH_ID_ROUTES) {
        const res = await send(method, path.replace('ID', bad), body)
        assert.equal(res.status, 400, `${method} ${path}`)
        assert.equal(typeof ((await res.json()) as { error: string }).error, 'string')
      }
      assert.deepEqual(reached, [])
    })
  }
  it('refuses a playlist, pinned row or station id that is not a positive integer', async () => {
    for (const [method, path, body] of [
      ['GET', '/playlists/abc'],
      ['DELETE', '/playlists/0'],
      ['PUT', '/playlists/1/order', { sceneIds: ['x'] }],
      ['DELETE', '/playlists/1/items/abc'],
      ['PUT', '/favorites/abc'],
      ['DELETE', '/rows/abc'],
      ['DELETE', '/stations/1.5'],
    ] as [string, string, unknown?][])
      assert.equal((await send(method, path, body)).status, 400, `${method} ${path}`)
  })
  it('still answers a literal path that sits beside an :id route', async () => {
    upstream = () => Response.json({ data: { findTags: { tags: [] } } })
    assert.equal((await send('GET', '/scenes/hidden')).status, 200)
  })
})

describe('bodies', () => {
  const WRITES = ['PUT /scenes/1/rating', 'POST /scenes/1/activity', 'PATCH /scenes/1', 'POST /scenes/1/markers', 'POST /scenes/tags', 'POST /history/remove', 'POST /continue/clear', 'PUT /performers/1/favorite', 'PUT /settings', 'POST /playlists', 'POST /rows', 'POST /stations', 'PUT /stations/resume', 'POST /featured/preview', 'POST /whisparr/get-many']
  it('answers 400, not 500, to a body that is not JSON', async () => {
    for (const w of WRITES) {
      const [method, path] = w.split(' ')
      const res = await send(method, path, '{"rating": 4')
      assert.equal(res.status, 400, w)
      assert.match(((await res.json()) as { error: string }).error, /not valid JSON/)
    }
    assert.deepEqual(reached, [])
  })
  it('answers 400 to a body of the wrong shape', async () => {
    assert.equal((await send('PUT', '/scenes/1/rating', { rating: 9 })).status, 400)
    assert.equal((await send('PATCH', '/scenes/1', { addTagIds: ['x'] })).status, 400)
    assert.equal((await send('POST', '/scenes/tags', { sceneIds: ['1'], add: ['2'], remove: ['2'] })).status, 400)
    assert.equal((await send('POST', '/scenes/delete', { sceneIds: ['1', 'two'] })).status, 400)
    assert.equal((await send('POST', '/whisparr/get-many', { stashdbIds: ['not-a-uuid'] })).status, 400)
    assert.equal((await send('POST', '/whisparr/get/abc')).status, 400)
    assert.equal((await send('POST', '/whisparr/get-remote/abc')).status, 400)
    assert.deepEqual(reached, [])
  })
  it('takes a film to restore only from under the film root, without ..', async () => {
    for (const path of ['/etc/passwd', '/volume1/Media/adult/movies/../../../etc', '/volume1/Media/adult/moviesX/a']) assert.equal((await send('POST', '/whisparr/restore-film', { tmdbId: 1, path })).status, 400, path)
    assert.deepEqual(reached, [])
  })
})

describe('upstream failures', () => {
  it('answers 502 with the reason when Stash refuses', async () => {
    upstream = () => Response.json({ errors: [{ message: 'scene is on fire' }] })
    const res = await send('PUT', '/scenes/1/rating', { rating: 4 })
    assert.equal(res.status, 502)
    assert.deepEqual(await res.json(), { error: 'Stash: scene is on fire' })
  })
  it('answers 502 when Stash cannot be reached', async () => {
    upstream = () => {
      throw new TypeError('fetch failed')
    }
    const res = await send('POST', '/scenes/1/o')
    assert.equal(res.status, 502)
    assert.match(((await res.json()) as { error: string }).error, /^Stash: no connection/)
  })
  it('answers 502, not a bare 500, when Whisparr fails', async () => {
    upstream = () => new Response('', { status: 503 })
    const res = await send('POST', '/whisparr/get/5')
    assert.equal(res.status, 502)
    assert.deepEqual(await res.json(), { error: 'Whisparr HTTP 503 on GET /movie/5' })
  })
  it('answers 400 when Whisparr\'s answer is refused by flix\'s own rule', async () => {
    upstream = () => Response.json({ id: 5, itemType: 'movie', title: 'a film', path: '/x' })
    assert.equal((await send('POST', '/whisparr/get/5')).status, 400)
  })
  it('keeps a bug a 500 with no detail', async () => {
    const broken = new Hono().get('/x', () => {
      throw new Error('secret detail')
    }).onError(errorHandler)
    const res = await broken.request('/x')
    assert.equal(res.status, 500)
    assert.deepEqual(await res.json(), { error: 'internal error' })
  })
})
