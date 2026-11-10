// Checks the mini-player round trip with real touch events in headless Chrome (iPhone size):
// play a scene, tap the Home tab (the player docks), tap the docked picture (back to the
// scene, un-docked), again via the title and the Expand button, then tap a related card (the
// next video opens on its own page, not docked). Prints the path and the dock state after each
// step and saves a screenshot per step. Plays and progress are blocked, so nothing is
// recorded in Stash.
// usage: node scripts/mini-check.mjs <outdir> http://localhost:5174 /scene/<id>
// env: W, H (viewport), STEP (ms to wait after a tap, 1500)
// NEUTRAL BY DEFAULT (wiki/runbooks/neutral-observability.md): names and titles reach the app as filler, pictures are grey
// placeholders and video is flattened, so a screenshot shows layout, never content. --content (or CONTENT=1) opts out.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

import { capture, installNeutral, wantsNeutral } from './lib/neutral-page.mjs'

const [outDir, base, path] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const NEUTRAL = wantsNeutral()
// a neutral run has its own browser profile: the app persists its query cache
const profile = `${outDir}/${NEUTRAL ? 'profile-neutral' : 'profile'}`
mkdirSync(outDir, { recursive: true })
const W = Number(process.env.W ?? 440)
const H = Number(process.env.H ?? 956)
const STEP = Number(process.env.STEP ?? 1500)
// Chrome picks a free port and writes it to the profile. A fixed port would silently attach to
// any headless Chrome left running from an earlier check (and keep driving its page).
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
const neutral = NEUTRAL ? await installNeutral({ send, ws, base, blocked: BLOCKED }) : null
const requests = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Network.requestWillBeSent') requests.set(m.params.requestId, `${m.params.request.method} ${m.params.request.url}`)
  if (m.method === 'Network.loadingFailed' && m.params.blockedReason && !neutral?.wasBlockedHere(m.params.requestId)) console.log('  blocked:', (requests.get(m.params.requestId) ?? m.params.requestId).replace(/\?.*$/, ''))
})
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1' })
await send('Page.enable')

const touch = async (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
const tap = async (x, y) => { await touch('touchStart', x, y); await sleep(40); await touch('touchEnd'); await sleep(STEP) }
const rect = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } })()`)
const state = () => evaluate(`(() => { const v = document.querySelector('video'); const dock = document.querySelector('[role=region][aria-label="Now playing"]'); return { path: location.pathname, docked: !!dock, video: !!v, paused: v?.paused, t: v ? +v.currentTime.toFixed(1) : null } })()`)
let n = 0
const shot = async (name) => {
  await capture({ send, neutral, file: `${outDir}/${++n}-${name}.png` })
}
const step = async (name, fn) => {
  await fn()
  const s = await state()
  console.log(`${name.padEnd(28)} ${JSON.stringify(s)}`)
  await shot(name.replace(/\W+/g, '_'))
  return s
}

await send('Page.navigate', { url: base + path })
await sleep(5000)
await step('scene loaded', async () => {})
await step('play (JS)', async () => { await evaluate(`document.querySelector('video').play().catch(() => {})`); await sleep(2000) })
// The phone tab bar's Home link
const home = await rect('nav a[href="/"]')
if (!home) { console.log('no Home tab found'); process.exit(1) }
const docked = await step('tap Home tab', () => tap(home.x, home.y))
if (!docked.docked) { console.log('FAIL: the player did not dock'); ws.close(); chrome.kill(); process.exit(1) }
const pic = await rect('[aria-label="Back to the video"]')
console.log('  dock picture button at', pic)
const back1 = await step('tap dock picture', () => tap(pic.x, pic.y))
if (back1.path === path && !back1.docked) console.log('ok: picture tap restored the full player')
else {
  console.log(`FAIL: picture tap -> path ${back1.path}, docked ${back1.docked}`)
  const title = await rect('[role=region][aria-label="Now playing"] a.min-w-0')
  console.log('  dock title button at', title)
  if (title) {
    const back2 = await step('tap dock title', () => tap(title.x, title.y))
    console.log(back2.path === path && !back2.docked ? 'ok: title tap restored the full player' : `FAIL: title tap -> path ${back2.path}, docked ${back2.docked}`)
  }
}
// Round trips again from Home, by the title and by the Expand button
let failed = back1.path !== path || back1.docked
for (const [name, sel] of [['title', '[role=region][aria-label="Now playing"] a.min-w-0'], ['Expand', '[role=region][aria-label="Now playing"] [aria-label="Expand"]']]) {
  if ((await state()).path !== path) break
  const home2 = await rect('nav a[href="/"]')
  await step('tap Home tab again', () => tap(home2.x, home2.y))
  const r = await rect(sel)
  if (!r) { console.log(`FAIL: no ${name} control in the dock`); failed = true; break }
  const s = await step(`tap dock ${name}`, () => tap(r.x, r.y))
  if (s.path === path && !s.docked) console.log(`ok: ${name} tap restored the full player`)
  else { console.log(`FAIL: ${name} tap -> path ${s.path}, docked ${s.docked}`); failed = true }
}
// Scene to scene: a tap on a related card below the player must open that video on its own
// page, not dock it, and so must Back and a second tap, when the page's record is already
// cached and its slot mounts at once (2026-10-31: the leaving page's cleanup wiped the slot the
// new page had just attached, so the next video showed as a mini-player over its own empty page).
const findCard = () => evaluate(`(() => { const a = [...document.querySelectorAll('a[href^="/scene/"]')].find((el) => el.getAttribute('href').split('?')[0] !== location.pathname); if (!a) return null; a.scrollIntoView({ block: 'center' }); const r = a.getBoundingClientRect(); return { href: a.getAttribute('href'), x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const onPage = (s, target) => s.path === target && !s.docked && s.video
if ((await state()).path === path) {
  const card = await findCard()
  if (!card) { console.log('FAIL: no related card to tap'); failed = true }
  else {
    const target = card.href.split('?')[0]
    await sleep(300)
    const s1 = await step('tap related card', () => tap(card.x, card.y))
    if (onPage(s1, target)) console.log('ok: the related video opened on its own page, un-docked')
    else { console.log(`FAIL: related card -> path ${s1.path} (wanted ${target}), docked ${s1.docked}, video ${s1.video}`); failed = true }
    const s2 = await step('back (cached page)', async () => { await evaluate('history.back()'); await sleep(STEP) })
    if (onPage(s2, path)) console.log('ok: Back found the first video on its page, un-docked')
    else { console.log(`FAIL: Back -> path ${s2.path} (wanted ${path}), docked ${s2.docked}, video ${s2.video}`); failed = true }
    const again = await findCard()
    if (again) {
      await sleep(300)
      const s3 = await step('tap related (cached)', () => tap(again.x, again.y))
      const t3 = again.href.split('?')[0]
      if (onPage(s3, t3)) console.log('ok: the cached related video opened on its own page, un-docked')
      else { console.log(`FAIL: cached related card -> path ${s3.path} (wanted ${t3}), docked ${s3.docked}, video ${s3.video}`); failed = true }
    }
  }
}
console.log(failed ? 'FAILED' : 'all restore paths work')
ws.close()
chrome.kill()
process.exit(failed ? 1 : 0)
