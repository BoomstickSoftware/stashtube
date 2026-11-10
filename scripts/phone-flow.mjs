// Headless Chrome at iPhone size driven by a list of steps (JSON in env STEPS), modelled on
// scripts/mobile-check.mjs. Steps: {goto:'/path'}, {tap:'css'}, {tapText:'label'} (the first visible
// button/a/label whose text includes it), {longpress:'css'}, {type:'text'} (into the focused element), {key:'Enter'},
// {scroll:px}, {scrollTo:'css'}, {wait:ms}, {eval:'expr'}, {init:'js'} (run before the app on later loads), {shot:'name'}, {full:'name'} (whole page),
// {standalone:true} (display-mode: standalone), {back:true}, {targets:true} (list controls < 44px).
// Plays, activity, markers, o, rating, deletes and whisparr gets are blocked, so nothing is recorded.
// STUB='{"/api/settings": {...}}' answers those GET API paths from here instead of the server, to show
// a state production does not have (a Settings value, an empty list); writes are never stubbed.
// NEUTRAL BY DEFAULT (wiki/runbooks/neutral-observability.md): the app gets every API answer with titles, names
// and descriptions replaced by filler of the same shape, every library picture is a grey placeholder and video
// is flattened to grey, so the screenshots and this script's output show layout and controls, never content.
// tapText therefore finds the app's own labels only; open a video, performer or studio by id ({goto:'/scene/<id>'}).
// --content (or CONTENT=1) shows the real library: only when the user asks for it.
// usage: STEPS='[...]' node scripts/phone-flow.mjs <outdir> http://localhost:5174 [--content]
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { installNeutral, wantsNeutral } from './lib/neutral-page.mjs'

const [outDir, base] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const NEUTRAL = wantsNeutral()
// a neutral run has its own browser profile: the app persists its query cache, and a content run's must not be shown
const profile = `${outDir}/${NEUTRAL ? 'profile-neutral' : 'profile'}`
mkdirSync(outDir, { recursive: true })
const W = Number(process.env.W ?? 440)
const H = Number(process.env.H ?? 956)
const steps = JSON.parse(process.env.STEPS ?? '[]')
rmSync(`${profile}/DevToolsActivePort`, { force: true })
let port
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' })

let ws
for (let i = 0; i < 50; i++) {
  try {
    port ??= readFileSync(`${profile}/DevToolsActivePort`, 'utf8').split('\n')[0]
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const page = list.find((t) => t.type === 'page')
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break }
  } catch {}
  await sleep(200)
}
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
})
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value

// Never record plays or progress in Stash, or delete anything, from a test run.
await send('Network.enable')
const BLOCKED = [
  '*/api/scenes/*/play', '*/api/scenes/*/activity', '*/api/scenes/*/markers*', '*/api/scenes/*/o', '*/api/scenes/*/rating',
  '*/api/scenes/delete', '*/api/whisparr/get/*', '*/api/whisparr/get-remote/*',
]
// neutral mode blocks these itself, anchored: the CDP pattern is a prefix match and would also stop GET …/playlists
if (!NEUTRAL) await send('Network.setBlockedURLs', { urls: BLOCKED })
// Stubbed reads (env STUB): a GET whose pathname is a key gets that JSON as its 200 answer.
const stubs = Object.entries(JSON.parse(process.env.STUB ?? '{}'))
const stubFor = (request) => stubs.find(([path]) => request.method === 'GET' && new URL(request.url).pathname === path)?.[1]
let neutral = null
if (NEUTRAL) neutral = await installNeutral({ send, ws, base, blocked: BLOCKED, stub: stubFor })
const requests = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Network.requestWillBeSent') requests.set(m.params.requestId, `${m.params.request.method} ${m.params.request.url}`)
  if (m.method === 'Network.loadingFailed' && m.params.blockedReason && !neutral?.wasBlockedHere(m.params.requestId)) console.log('  blocked:', NEUTRAL ? (requests.get(m.params.requestId) ?? '').replace(/\?.*$/, '') : (requests.get(m.params.requestId) ?? m.params.requestId))
})
if (stubs.length && !NEUTRAL) {
  await send('Fetch.enable', { patterns: stubs.map(([path]) => ({ urlPattern: `*${path}*`, requestStage: 'Request' })) })
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.method !== 'Fetch.requestPaused') return
    const { requestId, request } = m.params
    const hit = stubFor(request)
    if (hit === undefined) return send('Fetch.continueRequest', { requestId })
    console.log('  stubbed:', request.url)
    send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(hit)).toString('base64'),
    })
  })
}
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1' })
await send('Page.enable')

const touch = (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
const rectOf = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } })()`)
const rectOfText = (text) => evaluate(`(() => { const els = [...document.querySelectorAll('button, a, label, [role=radio], [role=menuitem], summary')]; const el = els.find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.innerText||e.getAttribute('aria-label')||'').trim().includes(${JSON.stringify(text)}) }); if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, tag: el.tagName, text: (el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,40) } })()`)
const tapAt = async (x, y) => { await touch('touchStart', x, y); await sleep(40); await touch('touchEnd'); }
const state = () => evaluate(`(() => ({ path: location.pathname + location.search, dialog: !!document.querySelector('[role=dialog],[role=menu]'), title: document.title }))()`)
const shot = async (name, full) => {
  if (neutral) {
    const r = await neutral.ready()
    if (!r.ok) return console.log(`  NOT NEUTRAL, ${name}.png withheld: ${JSON.stringify(r)}`)
  }
  let clip
  if (full) {
    const h = await evaluate('Math.min(document.documentElement.scrollHeight, 8000)')
    clip = { x: 0, y: 0, width: W, height: h, scale: 1 }
  }
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!full, ...(clip ? { clip } : {}) })
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(s.result.data, 'base64'))
}
const targets = `(() => {
  const out = []
  for (const el of document.querySelectorAll('a, button, [role=button], input, select, [role=switch], [role=radio]')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue
    if (getComputedStyle(el).visibility === 'hidden') continue
    if (r.width < 44 || r.height < 44) out.push(((el.getAttribute('aria-label') || el.title || el.innerText || el.tagName).trim().replace(/\\s+/g,' ').slice(0, 30)) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))
  }
  return out
})()`

for (const s of steps) {
  let note = ''
  if (s.standalone) await send('Emulation.setEmulatedMedia', { features: [{ name: 'display-mode', value: 'standalone' }] })
  if (s.init) await send('Page.addScriptToEvaluateOnNewDocument', { source: s.init }) // runs before the app on every later load
  if (s.goto) { await send('Page.navigate', { url: base + s.goto }); await sleep(s.wait ?? 3500) }
  if (s.tap) { const r = await rectOf(s.tap); if (!r) note = 'NOT FOUND ' + s.tap; else { await sleep(150); await tapAt(r.x, r.y); note = `tap ${Math.round(r.w)}x${Math.round(r.h)}` } await sleep(s.wait ?? 1200) }
  if (s.tapText) { const r = await rectOfText(s.tapText); if (!r) note = 'NOT FOUND ' + s.tapText; else { await sleep(150); await tapAt(r.x, r.y); note = `tap "${r.text}" ${Math.round(r.w)}x${Math.round(r.h)}` } await sleep(s.wait ?? 1200) }
  if (s.longpress) { const r = await rectOf(s.longpress); if (!r) note = 'NOT FOUND'; else { await sleep(150); await touch('touchStart', r.x, r.y); await sleep(s.ms ?? 700); await touch('touchEnd'); } await sleep(s.wait ?? 1200) }
  if (s.type) { await send('Input.insertText', { text: s.type }); await sleep(s.wait ?? 1200) }
  if (s.key) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: s.key, code: s.key, windowsVirtualKeyCode: s.key === 'Enter' ? 13 : 0 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: s.key, code: s.key }); await sleep(s.wait ?? 1200) }
  if (s.scroll !== undefined) { await evaluate(`window.scrollBy(0, ${s.scroll})`); await sleep(s.wait ?? 800) }
  if (s.scrollTo) { await evaluate(`document.querySelector(${JSON.stringify(s.scrollTo)})?.scrollIntoView({block:'start'})`); await sleep(s.wait ?? 800) }
  if (s.back) { await evaluate('history.back()'); await sleep(s.wait ?? 1200) }
  if (s.wait && !s.goto && !s.tap && !s.tapText && !s.longpress && !s.type && !s.key && s.scroll === undefined && !s.scrollTo && !s.back) await sleep(s.wait)
  if (s.eval) note += ' eval=' + JSON.stringify(await evaluate(s.eval))
  if (s.targets) note += ' small=' + JSON.stringify(await evaluate(targets))
  if (s.shot) await shot(s.shot, false)
  if (s.full) await shot(s.full, true)
  console.log(JSON.stringify(s).slice(0, 70).padEnd(72), JSON.stringify(await state()), note)
}
if (neutral) console.log(`neutral: ${neutral.stats.api} API answers masked, ${neutral.stats.pictures} pictures replaced, ${neutral.stats.unreadable} withheld`)
else console.log('CONTENT MODE: the screenshots and the lines above show the real library')
ws.close()
chrome.kill()
