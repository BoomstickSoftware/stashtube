import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { describe, it } from 'node:test'
import { hostGuard, localHost, playbackOrigin, sameOriginWrites, securityHeaders } from './guard.ts'

const app = new Hono()
app.use('*', securityHeaders, hostGuard)
app.use('/api/*', sameOriginWrites)
app.get('/healthz', (c) => c.text('ok'))
app.all('/api/x', (c) => c.text('done'))
const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  app.request(`http://flix${path}`, { method: init.method ?? 'GET', headers: { host: 'flix.lan', ...init.headers } })

describe('guard', () => {
  it('knows which hosts only the LAN can mean', () => {
    for (const h of ['192.168.1.152', '192.168.1.152:8080', 'flix.lan', 'localhost:5174', 'flix', 'flix.flix.svc.cluster.local', '[::1]:8080', 'nas.home.arpa'])
      assert.equal(localHost(h), true, h)
    for (const h of ['evil.example.com', 'flix.lan.evil.com', '192.168.1.152.nip.io', '', undefined]) assert.equal(localHost(h), false, String(h))
  })

  it('refuses a public host name (DNS rebinding) but always answers the probes', async () => {
    assert.equal((await req('/api/x', { headers: { host: 'rebind.attacker.com' } })).status, 421)
    assert.equal((await req('/healthz', { headers: { host: 'rebind.attacker.com' } })).status, 200)
    assert.equal((await req('/api/x', { headers: { host: '192.168.1.152' } })).status, 200)
  })

  it('refuses writes another site makes, allows its own and those from tools', async () => {
    const post = (headers: Record<string, string>) => req('/api/x', { method: 'POST', headers })
    assert.equal((await post({ 'sec-fetch-site': 'cross-site', origin: 'http://evil.example.com' })).status, 403)
    assert.equal((await post({ origin: 'http://evil.example.com' })).status, 403) // an older browser: Origin only
    assert.equal((await post({ 'sec-fetch-site': 'same-site', origin: 'http://other.lan' })).status, 403)
    assert.equal((await post({ 'sec-fetch-site': 'same-origin', origin: 'http://flix.lan' })).status, 200)
    assert.equal((await post({ origin: 'http://flix.lan' })).status, 200)
    assert.equal((await post({})).status, 200) // curl
    assert.equal((await req('/api/x', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 200) // reads are not writes
  })

  it('sets the headers on every response', async () => {
    const r = await req('/healthz')
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(r.headers.get('x-frame-options'), 'DENY')
  })

  it('allows playback CORS only for local origins', () => {
    assert.equal(playbackOrigin('http://flix.lan'), 'http://flix.lan')
    assert.equal(playbackOrigin('https://evil.example.com'), null)
    assert.equal(playbackOrigin(undefined), null)
  })
})
