// Client-side performance probe, modelled on scripts/mobile-check.mjs. Per route: cold load
// (navigation timing, requests and transfer bytes by type, slowest API calls with their start
// offsets, the five largest responses, the images on the first screen and how well their
// chosen variant fits, CLS / LCP / long tasks), then a second full load to see what the HTTP
// cache answers. With SCROLL=<n> a route is also scrolled page by page while the per-page
// request cost is recorded. Writes <outdir>/result.json and prints a summary.
// usage: node scripts/perf-check.mjs <outdir> http://localhost:5174 / /browse ...
// env: W, H, DESKTOP=1, WAIT (settle ms after load, default 4000), SCROLL=<n pages> (routes
//      named in SCROLL_ROUTES, comma separated, default "/browse")
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const [outDir, base, ...paths] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
// The numbers need the real responses, so this script does not mask them; it prints routes, ids, sizes and timings only,
// and saves a screenshot (which would show the library) only with --content or CONTENT=1.
const CONTENT = process.argv.includes('--content') || process.env.CONTENT === '1'
mkdirSync(outDir, { recursive: true })
const W = Number(process.env.W ?? 440)
const H = Number(process.env.H ?? 956)
const WAIT = Number(process.env.WAIT ?? 4000)
const SCROLL = Number(process.env.SCROLL ?? 0)
const SCROLL_ROUTES = (process.env.SCROLL_ROUTES ?? '/browse').split(',')
rmSync(`${outDir}/profile/DevToolsActivePort`, { force: true })
let port
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${outDir}/profile`,
  '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' })

let ws
for (let i = 0; i < 50; i++) {
  try {
    port ??= readFileSync(`${outDir}/profile/DevToolsActivePort`, 'utf8').split('\n')[0]
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const page = list.find((t) => t.type === 'page')
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break }
  } catch {}
  await sleep(200)
}
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map()
const events = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  else if (m.method) events.push(m)
})
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value

// Never record plays or progress in Stash, or delete anything, from a test run.
await send('Network.enable')
await send('Network.setBlockedURLs', {
  urls: [
    '*/api/scenes/*/play', '*/api/scenes/*/activity', '*/api/scenes/*/markers*', '*/api/scenes/*/o', '*/api/scenes/*/rating',
    '*/api/scenes/delete', '*/api/whisparr/get/*', '*/api/whisparr/get-remote/*',
  ],
})
const requests = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Network.requestWillBeSent') requests.set(m.params.requestId, `${m.params.request.method} ${m.params.request.url}`)
  if (m.method === 'Network.loadingFailed' && m.params.blockedReason) console.log('  blocked:', requests.get(m.params.requestId) ?? m.params.requestId)
})
const desktop = !!process.env.DESKTOP
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: desktop ? 1 : 2, mobile: !desktop })
if (!desktop) {
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1' })
}
await send('Page.enable')
await send('Performance.enable')
// CLS, LCP and long tasks need observers registered before the page's own scripts run.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__cls = 0; window.__lcp = 0; window.__long = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true }) } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true }) } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true }) } catch {}
` })

const kind = (type, mime, url) => {
  if (url.startsWith(base + '/api/')) return 'api'
  if (type === 'Script' || /javascript/.test(mime)) return 'script'
  if (type === 'Stylesheet' || /css/.test(mime)) return 'css'
  if (type === 'Image' || /^image\//.test(mime)) return 'image'
  if (type === 'Media' || /^video\/|mpegurl|mp2t/.test(mime) || /\/stream|\.m3u8|\.ts(\?|$)/.test(url)) return 'media'
  if (type === 'Font' || /font/.test(mime)) return 'font'
  if (type === 'Document') return 'document'
  if (type === 'XHR' || type === 'Fetch') return 'fetch'
  return 'other'
}

// Collect the network events since `from` (an index into `events`) into per-request records.
function collect(from) {
  const reqs = new Map()
  let t0
  for (const m of events.slice(from)) {
    const p = m.params
    if (m.method === 'Network.requestWillBeSent') {
      if (p.type === 'Document' && t0 === undefined) t0 = p.timestamp
      reqs.set(p.requestId, { url: p.request.url, type: p.type, start: p.timestamp, method: p.request.method })
    } else if (m.method === 'Network.requestServedFromCache') {
      const r = reqs.get(p.requestId); if (r) r.memory = true
    } else if (m.method === 'Network.responseReceived') {
      const r = reqs.get(p.requestId); if (!r) continue
      r.status = p.response.status; r.mime = p.response.mimeType; r.disk = !!p.response.fromDiskCache
      r.responseAt = p.timestamp; r.headersSize = p.response.encodedDataLength
      r.len = Number(p.response.headers['content-length'] ?? p.response.headers['Content-Length'] ?? 0)
      r.type = p.type ?? r.type
    } else if (m.method === 'Network.loadingFinished') {
      const r = reqs.get(p.requestId); if (!r) continue
      r.bytes = p.encodedDataLength; r.end = p.timestamp
    } else if (m.method === 'Network.loadingFailed') {
      const r = reqs.get(p.requestId); if (!r) continue
      r.failed = p.errorText; r.blocked = !!p.blockedReason; r.end = p.timestamp
    }
  }
  const list = [...reqs.values()].map((r) => ({ ...r, kind: kind(r.type, r.mime ?? '', r.url), bytes: r.bytes ?? 0, t: t0 !== undefined ? +((r.start - t0) * 1000).toFixed(0) : null, dur: r.end && r.start ? +((r.end - r.start) * 1000).toFixed(0) : null }))
  return { t0, list }
}

const short = (u) => u.replace(base, '').replace(/^\/media\/stash\//, 'm:/').replace(/[?&]t=\d+/, '').replace(/([?&]q=)[^&]*/, '$1…').slice(0, 110)
const byType = (list) => {
  const out = {}
  for (const r of list) {
    const o = (out[r.kind] ??= { n: 0, bytes: 0, cached: 0, notModified: 0 })
    o.n++; o.bytes += r.bytes
    if (r.memory || r.disk) o.cached++
    if (r.status === 304) o.notModified++
  }
  return out
}

const FIRST_SCREEN = `(() => {
  const dpr = devicePixelRatio, ih = innerHeight, iw = innerWidth
  const out = []
  for (const img of document.images) {
    const r = img.getBoundingClientRect()
    if (!r.width || r.bottom < 0 || r.top > ih || r.right < 0 || r.left > iw) continue
    const u = new URL(img.currentSrc || img.src, location.href)
    out.push({ w: Math.round(r.width), h: Math.round(r.height), nat: img.naturalWidth, natH: img.naturalHeight, variant: u.searchParams.get('w'), srcset: !!img.srcset, lazy: img.loading, decoding: img.decoding, complete: img.complete, src: u.pathname.slice(0, 60), dpr })
  }
  return out
})()`
const NAV = `(() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), respEnd: Math.round(n.responseEnd) } : null })()`
const VITALS = `({ cls: +window.__cls.toFixed(3), lcp: Math.round(window.__lcp), long: window.__long, nodes: document.getElementsByTagName('*').length, imgs: document.images.length, videos: document.querySelectorAll('video').length, scrollH: document.documentElement.scrollHeight })`

async function metrics() {
  const m = (await send('Performance.getMetrics')).result?.metrics ?? []
  const g = (n) => m.find((x) => x.name === n)?.value
  return { jsHeapMB: +((g('JSHeapUsedSize') ?? 0) / 1048576).toFixed(1), nodes: g('Nodes'), listeners: g('JSEventListeners'), layouts: g('LayoutCount'), recalcs: g('RecalcStyleCount'), scriptMs: Math.round((g('ScriptDuration') ?? 0) * 1000), layoutMs: Math.round((g('LayoutDuration') ?? 0) * 1000), taskMs: Math.round((g('TaskDuration') ?? 0) * 1000) }
}

async function load(url) {
  const from = events.length
  const loaded = new Promise((r) => { const h = (e) => { const m = JSON.parse(e.data); if (m.method === 'Page.loadEventFired') { ws.removeEventListener('message', h); r() } }; ws.addEventListener('message', h) })
  await send('Page.navigate', { url })
  await Promise.race([loaded, sleep(30000)])
  await sleep(WAIT)
  return from
}

const results = []
for (const p of paths) {
  const url = base + p
  const name = p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'
  // --- cold load (the profile is fresh: nothing in the HTTP cache or localStorage) ---
  const from = await load(url)
  const nav = await evaluate(NAV)
  const vit = await evaluate(VITALS)
  const met = await metrics()
  const first = await evaluate(FIRST_SCREEN)
  const { list } = collect(from)
  if (CONTENT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${outDir}/${name}.png`, Buffer.from(shot.result.data, 'base64'))
  }
  const api = list.filter((r) => r.kind === 'api').map((r) => ({ url: short(r.url), t: r.t, dur: r.dur, bytes: r.bytes, status: r.status, cached: !!(r.memory || r.disk) })).sort((a, b) => a.t - b.t)
  const largest = [...list].sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((r) => ({ url: short(r.url), kind: r.kind, bytes: r.bytes, status: r.status }))
  const images = list.filter((r) => r.kind === 'image')
  const variants = {}
  for (const r of images) { const w = new URL(r.url).searchParams.get('w') ?? 'full'; variants[w] = (variants[w] ?? 0) + 1 }
  const res = { route: p, viewport: `${W}x${H}${desktop ? ' desktop' : ' phone'}`, nav, vitals: vit, metrics: met, byType: byType(list), total: { n: list.length, bytes: list.reduce((a, r) => a + r.bytes, 0) }, api, largest, images: { n: images.length, bytes: images.reduce((a, r) => a + r.bytes, 0), variants, failed: images.filter((r) => r.failed && !r.blocked).length }, firstScreen: first, blocked: list.filter((r) => r.blocked).map((r) => short(r.url)) }
  // the fit of each first-screen image: natural width vs the device pixels it covers
  res.fit = first.map((i) => ({ src: i.src, rendered: `${i.w}x${i.h}`, needPx: Math.round(i.w * i.dpr), natural: i.nat, variant: i.variant, ratio: i.nat && i.w ? +(i.nat / (i.w * i.dpr)).toFixed(2) : null, lazy: i.lazy, decoding: i.decoding, srcset: i.srcset }))

  // --- scrolling: load the next pages and cost each one ---
  if (SCROLL && SCROLL_ROUTES.includes(p)) {
    const samples = []
    const mark = events.length
    const t0 = Date.now()
    let lastH = 0
    for (let i = 0; i < 400; i++) {
      const s = await evaluate(`(() => { scrollBy(0, innerHeight * 0.9); return { y: scrollY, h: document.documentElement.scrollHeight, ih: innerHeight, cards: document.querySelectorAll('img[sizes]').length, spinner: !!document.querySelector('.animate-spin') } })()`)
      samples.push({ ms: Date.now() - t0, ...s, atBottom: s.y + s.ih >= s.h - 2 })
      await sleep(250)
      const pagesSeen = collect(mark).list.filter((r) => r.kind === 'api' && /\/api\/scenes\?.*[?&]page=/.test(r.url)).length
      if (pagesSeen >= SCROLL && s.y + s.ih >= s.h - 2) { lastH = s.h; break }
      if (pagesSeen >= SCROLL && s.h === lastH && i > 20) break
      lastH = s.h
    }
    await sleep(2500)
    const { list: scrolled } = collect(mark)
    const pageReqs = scrolled.filter((r) => r.kind === 'api' && /\/api\/scenes\?.*[?&]page=/.test(r.url)).sort((a, b) => a.start - b.start)
    const pages = pageReqs.map((pr, i) => {
      const next = pageReqs[i + 1]
      const window = scrolled.filter((r) => r.start >= pr.start && (!next || r.start < next.start) && r !== pr)
      const imgs = window.filter((r) => r.kind === 'image')
      // the scroll sample taken just before the request went out: how far from the bottom was the user?
      const wall = (pr.start - (scrolled[0]?.start ?? pr.start)) * 1000
      const sample = samples.filter((s) => s.ms <= wall + 300).at(-1) ?? samples[0]
      return { page: new URL(pr.url).searchParams.get('page'), apiMs: pr.dur, apiBytes: pr.bytes, images: imgs.length, imageBytes: imgs.reduce((a, r) => a + r.bytes, 0), otherReqs: window.length - imgs.length, distanceToBottomPx: sample ? sample.h - (sample.y + sample.ih) : null }
    })
    const blankSamples = samples.filter((s) => s.atBottom && s.spinner).length
    res.scroll = { pages, samples: samples.length, blankSamplesAtBottom: blankSamples, finalCards: samples.at(-1)?.cards, finalScrollH: samples.at(-1)?.h, vitalsAfter: await evaluate(VITALS), metricsAfter: await metrics() }
  }

  // --- second load: what the HTTP cache answers ---
  const from2 = await load(url)
  const { list: l2 } = collect(from2)
  res.second = { nav: await evaluate(NAV), byType: byType(l2), total: { n: l2.length, bytes: l2.reduce((a, r) => a + r.bytes, 0) }, apiCached: l2.filter((r) => r.kind === 'api' && (r.memory || r.disk || r.status === 304)).length, apiN: l2.filter((r) => r.kind === 'api').length, imagesCached: l2.filter((r) => r.kind === 'image' && (r.memory || r.disk || r.status === 304)).length, imagesN: l2.filter((r) => r.kind === 'image').length, vitals: await evaluate(VITALS) }
  results.push(res)
  const bt = res.byType
  const f = (k) => bt[k] ? `${bt[k].n}/${(bt[k].bytes / 1024).toFixed(0)}k` : '0'
  console.log(`${p}\tdcl=${nav?.dcl} load=${nav?.load} lcp=${vit.lcp} cls=${vit.cls} long=${vit.long.length}(${vit.long.reduce((a, b) => a + b, 0)}ms)\treq=${res.total.n} ${(res.total.bytes / 1024).toFixed(0)}k\tapi=${f('api')} img=${f('image')} script=${f('script')} css=${f('css')} media=${f('media')}\tfirstScreenImgs=${first.length}\t2nd: req=${res.second.total.n} ${(res.second.total.bytes / 1024).toFixed(0)}k apiCached=${res.second.apiCached}/${res.second.apiN} imgCached=${res.second.imagesCached}/${res.second.imagesN} load=${res.second.nav?.load}`)
  if (res.scroll) console.log('   scroll:', JSON.stringify(res.scroll.pages), `blankAtBottom=${res.scroll.blankSamplesAtBottom} cards=${res.scroll.finalCards} nodes=${res.scroll.vitalsAfter.nodes} heap=${res.scroll.metricsAfter.jsHeapMB}MB`)
}
writeFileSync(`${outDir}/result.json`, JSON.stringify(results, null, 2))
ws.close()
chrome.kill()
