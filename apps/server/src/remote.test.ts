// Remote covers: the allowlist that bounds what the proxy fetches, the proxied URL the API hands
// out, and the fetch that follows redirects only onto allowlisted hosts.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { allowedRemote, fetchRemote, remoteImageUrl, remoteUpstream } from './remote.ts'
import { signRemote } from './signing.ts'

const COVER = 'https://stashdb.org/images/7e9a8bdb-9933-499b-bf47-c768a450cb0c'

describe('remote cover allowlist', () => {
  it('allows https on stashdb.org and its subdomains, nothing else', () => {
    assert.ok(allowedRemote(COVER))
    assert.ok(allowedRemote('https://cdn.stashdb.org/x.jpg'))
    assert.ok(allowedRemote('https://STASHDB.org/images/x'))
    assert.ok(!allowedRemote('http://stashdb.org/images/x')) // plain http
    assert.ok(!allowedRemote('https://stashdb.org.evil.example/x'))
    assert.ok(!allowedRemote('https://evilstashdb.org/x'))
    assert.ok(!allowedRemote('https://user:pw@stashdb.org/x'))
    assert.ok(!allowedRemote('https://192.168.1.2/x'))
    assert.ok(!allowedRemote('file:///etc/passwd'))
    assert.ok(!allowedRemote('not a url'))
  })

  it('hands out a proxied URL only for an allowed cover', () => {
    const u = remoteImageUrl(COVER)
    assert.ok(u!.startsWith('/media/remote/'))
    assert.equal(remoteUpstream(u!.slice('/media/remote/'.length)), COVER)
    assert.equal(remoteImageUrl('https://cdn.example.com/x.jpg'), null)
    assert.equal(remoteImageUrl(null), null)
    assert.equal(remoteImageUrl(undefined), null)
    assert.equal(remoteImageUrl(''), null)
  })

  it('refuses a token for a disallowed host even when the signature is right', () => {
    // in unsigned mode the key is fixed, so a forged token is possible; the allowlist still holds
    assert.equal(remoteUpstream(signRemote('https://evil.example/x.jpg')), null)
    assert.equal(remoteUpstream(signRemote('http://stashdb.org/x.jpg')), null)
    assert.equal(remoteUpstream('garbage'), null)
    assert.equal(remoteUpstream(undefined), null)
  })
})

const image = (body = 'img') => new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg' } })
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } })

describe('fetching a remote cover', () => {
  it('follows a redirect that stays on an allowed host and stops at one that leaves it', async () => {
    const asked: string[] = []
    const fake: typeof fetch = async (url) => {
      asked.push(String(url))
      if (String(url) === COVER) return redirect('https://cdn.stashdb.org/final.jpg')
      return image()
    }
    const ok = await fetchRemote(COVER, {}, fake)
    assert.equal(ok.status, 200)
    assert.deepEqual(asked, [COVER, 'https://cdn.stashdb.org/final.jpg'])

    asked.length = 0
    const away: typeof fetch = async (url) => {
      asked.push(String(url))
      return redirect('https://evil.example/x.jpg')
    }
    const refused = await fetchRemote(COVER, {}, away)
    assert.equal(refused.status, 404)
    assert.deepEqual(asked, [COVER]) // the foreign host was never asked
  })

  it('gives up on a redirect loop and treats a non-image as not found', async () => {
    let n = 0
    const loop: typeof fetch = async () => {
      n++
      return redirect(COVER)
    }
    assert.equal((await fetchRemote(COVER, {}, loop)).status, 404)
    assert.ok(n <= 4)

    const html: typeof fetch = async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })
    assert.equal((await fetchRemote(COVER, {}, html)).status, 404)

    const missing: typeof fetch = async () => new Response(null, { status: 404 })
    assert.equal((await fetchRemote(COVER, {}, missing)).status, 404)
  })

  it('passes the validators through and asks with manual redirects', async () => {
    let init: RequestInit | undefined
    const fake: typeof fetch = async (_url, i) => {
      init = i
      return image()
    }
    await fetchRemote(COVER, { 'if-none-match': '"abc"' }, fake)
    assert.equal(init?.redirect, 'manual')
    assert.deepEqual(init?.headers, { 'if-none-match': '"abc"' })
  })
})
