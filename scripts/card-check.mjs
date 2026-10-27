// Checks the touch preview on scene cards in headless Chrome (iPhone 17 Pro Max size): a slight drag on a
// thumbnail starts its preview without opening the video, a drag on another card moves the preview there,
// scrolling a card away stops it, and a tap still opens the scene. Chrome holds back touchmoves inside its
// ~15 px tap slop (iOS Safari does not), so the test drags 25 px.
// usage: node scripts/card-check.mjs <outdir> http://localhost:5173 /browse
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const [outDir, base, path] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const W = Number(process.env.W ?? 440)
const H = Number(process.env.H ?? 956)
const port = 9333
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${outDir}/profile`,
  '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' })

let ws
for (let i = 0; i < 50; i++) {
  try {
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

// Never record plays or progress in Stash from a test run.
await send('Network.enable')
await send('Network.setBlockedURLs', { urls: ['*/api/scenes/*/play', '*/api/scenes/*/activity'] })
const desktop = !!process.env.DESKTOP
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: desktop ? 1 : 2, mobile: !desktop })
if (!desktop) {
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1' })
}
await send('Page.enable')
const touch = async (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
const cards = () => evaluate(`[...document.querySelectorAll('a[href^="/scene/"].aspect-video')].slice(0, 3).map((a) => { const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, video: !!a.querySelector('video') } })`)
const drag = async (x, y, dy) => { await touch('touchStart', x, y); await sleep(40); for (let i = 1; i <= 4; i++) { await touch('touchMove', x, y - (dy * i) / 4); await sleep(30) } await touch('touchEnd'); await sleep(600) }
await send('Page.navigate', { url: base + path })
await sleep(5000)
const url = () => evaluate('location.pathname')
let c = await cards(); console.log('loaded', await url(), c)
await drag(c[0].x, c[0].y, 25)
console.log('slight drag on card 1 -> card 1 previews, no navigation:', await url(), await cards())
c = await cards()
await drag(c[1].x, c[1].y, 25)
console.log('slight drag on card 2 -> only card 2 previews:', await cards())
await evaluate('window.scrollBy(0, 2000)'); await sleep(600)
await evaluate('window.scrollTo(0, 0)'); await sleep(600)
console.log('after scrolling card 2 away and back -> no previews:', await cards())
c = await cards()
await touch('touchStart', c[0].x, c[0].y); await sleep(60); await touch('touchEnd'); await sleep(1500)
console.log('tap card 1 -> opens the scene:', await url())
ws.close(); chrome.kill()
