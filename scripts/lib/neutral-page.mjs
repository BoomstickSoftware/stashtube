// Neutral pages for the headless checks (wiki/runbooks/neutral-observability.md): the page under
// test is the real app with real layout, but no library content reaches the screen.
//   - every /api response is rewritten before the app sees it: titles, names, descriptions and
//     paths become filler of the same length and word shape (maskValue in neutral.mjs); ids,
//     numbers, dates, enums and media URLs are untouched, so the app behaves as usual;
//   - every picture from /media (and any picture from another origin) is answered with a flat
//     grey placeholder, so nothing is even downloaded;
//   - video and canvas are flattened to grey by a stylesheet (the stream still plays, so the
//     player's controls and timings are real);
//   - the HTTP cache is off and the caller uses a separate browser profile, so nothing an
//     earlier content run stored (the persisted query cache) can be shown.
// A screenshot is withheld when ready() cannot confirm all of that. Writes stay blocked: the
// caller's blocked URL patterns are failed here as well as by Network.setBlockedURLs.
import { maskValue, redactUrl } from './neutral.mjs'

// --content (or CONTENT=1) turns neutral mode off; it is on by default.
export const wantsNeutral = (argv = process.argv, env = process.env) => !(argv.includes('--content') || env.CONTENT === '1')

import { writeFileSync } from 'node:fs'

const W = 640
const H = 360
export const PLACEHOLDER = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#565b66"/><path d="M0 ${H}L${W} 0" stroke="#6b717d" stroke-width="2"/></svg>`).toString('base64')
const CSS = 'img[src*="/media/"],img[srcset*="/media/"],img[src^="blob:"],img[src^="http"],video,canvas{filter:contrast(0) brightness(.55)!important}'
export const INJECT = `(() => { try { const s = new CSSStyleSheet(); s.replaceSync(${JSON.stringify(CSS)}); document.adoptedStyleSheets = [...document.adoptedStyleSheets, s]; window.__neutralSheet = s } catch {} })()`
// What ready() reads from the page: is the stylesheet in force, is every video and canvas flat,
// and which library or outside pictures are showing (each must be one this module answered).
const READY = `(() => ({
  sheet: !!window.__neutralSheet && document.adoptedStyleSheets.includes(window.__neutralSheet),
  flat: [...document.querySelectorAll('video, canvas')].every((v) => getComputedStyle(v).filter.includes('contrast(0)')),
  shown: [...document.images].filter((i) => i.complete && i.naturalWidth > 0 && /^https?:/.test(i.currentSrc) && (/\\/media\\//.test(i.currentSrc) || !i.currentSrc.startsWith(location.origin))).map((i) => i.currentSrc),
}))()`

// One screenshot, written only when the page is confirmed neutral (or the run is a content run).
export async function capture({ send, neutral, file, params = {}, log = console.log }) {
  const ready = neutral ? await neutral.ready() : { ok: true }
  if (!ready.ok) return log(`  NOT NEUTRAL, ${file.split('/').pop()} withheld: ${JSON.stringify(ready)}`), false
  const s = await send('Page.captureScreenshot', { format: 'png', ...params })
  writeFileSync(file, Buffer.from(s.result.data, 'base64'))
  return true
}

const glob = (p) => new RegExp(`^${p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)

// send: (method, params) => Promise<cdp message>; ws: the page's CDP WebSocket; base: the app's
// origin; blocked: URL globs never to send; stub: (request) => JSON to answer with, or undefined;
// latency: ms to hold every /api and /media request.
export async function installNeutral({ send, ws, base, blocked = [], stub = () => undefined, latency = 0, log = console.log }) {
  const origin = new URL(base).origin
  const blockedRe = blocked.map(glob)
  const failed = new Set() // network ids this handler blocked, so the caller's own log skips them
  const stats = { api: 0, pictures: 0, unreadable: 0 }
  const replaced = new Set() // picture URLs answered with the placeholder
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT })
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  const b64 = (s) => Buffer.from(s).toString('base64')

  async function onResponse(p) {
    const { requestId } = p
    if (p.responseErrorReason) return send('Fetch.failRequest', { requestId, errorReason: p.responseErrorReason })
    const status = p.responseStatusCode
    const headers = (p.responseHeaders ?? []).filter((h) => !/^(content-length|content-encoding|transfer-encoding|etag)$/i.test(h.name))
    const type = (p.responseHeaders ?? []).find((h) => h.name.toLowerCase() === 'content-type')?.value ?? ''
    let body = ''
    let code = status
    if (status !== 204 && status !== 304 && !(status >= 300 && status < 400)) {
      const r = await send('Fetch.getResponseBody', { requestId })
      const raw = r.result ? Buffer.from(r.result.body, r.result.base64Encoded ? 'base64' : 'utf8').toString('utf8') : ''
      if (raw && type.includes('json')) {
        try {
          body = JSON.stringify(maskValue(JSON.parse(raw)))
          stats.api++
        } catch {
          // fail closed: an answer that cannot be masked is not shown
          stats.unreadable++
          code = 502
          body = '{"error":"neutral mode could not read this response"}'
          log('  neutral: unreadable API response withheld:', redactUrl(new URL(p.request.url).pathname))
        }
      }
    }
    return send('Fetch.fulfillRequest', { requestId, responseCode: code, responseHeaders: headers, body: b64(body) })
  }

  ws.addEventListener('message', async (e) => {
    const m = JSON.parse(e.data)
    if (m.method !== 'Fetch.requestPaused') return
    const p = m.params
    const { requestId, request } = p
    try {
      if (p.responseStatusCode !== undefined || p.responseErrorReason !== undefined) return await onResponse(p)
      const url = new URL(request.url)
      if (!/^https?:$/.test(url.protocol)) return await send('Fetch.continueRequest', { requestId })
      if (blockedRe.some((r) => r.test(request.url))) {
        if (p.networkId) failed.add(p.networkId)
        log('  blocked:', request.method, redactUrl(url.pathname + url.search))
        return await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })
      }
      const answer = stub(request)
      if (answer !== undefined) {
        log('  stubbed:', redactUrl(url.pathname + url.search))
        return await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: b64(JSON.stringify(answer)) })
      }
      const same = url.origin === origin
      // desktop-check's LATENCY: the BFF's answers arrive late, the dev server's modules do not
      if (latency > 0 && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/'))) await new Promise((r) => setTimeout(r, latency))
      if (p.resourceType === 'Image' && (!same || url.pathname.startsWith('/media/'))) {
        stats.pictures++
        replaced.add(request.url)
        return await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/svg+xml' }, { name: 'Cache-Control', value: 'no-store' }], body: PLACEHOLDER })
      }
      if (same && url.pathname.startsWith('/api/')) {
        // identity encoding, so the body read at the response stage is plain JSON
        const headers = Object.entries({ ...request.headers, 'Accept-Encoding': 'identity' }).filter(([k]) => k.toLowerCase() !== 'accept-encoding' || k === 'Accept-Encoding').map(([name, value]) => ({ name, value: String(value) }))
        return await send('Fetch.continueRequest', { requestId, headers, interceptResponse: true })
      }
      return await send('Fetch.continueRequest', { requestId })
    } catch {
      await send('Fetch.failRequest', { requestId, errorReason: 'Failed' })
    }
  })

  return {
    stats,
    wasBlockedHere: (networkId) => failed.has(networkId),
    // { ok, sheet, flat, real }: call before every capture; not ok means do not write the picture.
    // `real` counts pictures on the page that did not come from this module's placeholder.
    ready: async () => {
      const r = (await send('Runtime.evaluate', { expression: READY, returnByValue: true })).result?.result?.value
      if (!r) return { ok: false }
      const real = r.shown.filter((u) => !replaced.has(u)).length
      return { ok: r.sheet && r.flat && real === 0, sheet: r.sheet, flat: r.flat, real }
    },
  }
}
