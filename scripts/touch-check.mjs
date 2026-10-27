// Drives the player with real touch events in headless Chrome (iPhone 17 Pro Max size):
// tap to show/hide controls, drag the seek bar (seeks only on release), double tap the
// right side (+10 s), swipe sideways (page must not pan). Prints the player state after
// each step. Plays and progress are blocked, so nothing is recorded in Stash.
// usage: node scripts/touch-check.mjs <outdir> http://localhost:5173 /scene/<id>
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


const state = () => evaluate(`(() => { const v = document.querySelector('main video[poster]'); const bar = document.querySelector('[class*="group/bar"]'); const r = bar.getBoundingClientRect(); const ctl = bar.parentElement; return { t: +v.currentTime.toFixed(1), paused: v.paused, scrollX, ctlOpacity: getComputedStyle(ctl).opacity, ctlEvents: getComputedStyle(ctl).pointerEvents, bar: [r.left, r.top + r.height / 2, r.width], vid: (() => { const b = v.getBoundingClientRect(); return [b.left, b.top, b.width, b.height] })() } })()`)
const touch = async (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
const tap = async (x, y) => { await touch('touchStart', x, y); await sleep(40); await touch('touchEnd') }
await send('Page.navigate', { url: base + path })
await sleep(5000)
let s0 = await state(); console.log('loaded (controls should have auto-hidden)', s0)
const [vx, vy, vw, vh] = s0.vid
// 1. tap the middle of the picture: controls appear, playback continues
await tap(vx + vw / 2, vy + vh * 0.3); await sleep(400)
console.log('after center tap', await state())
// 2. drag the seek bar from 20% to 60%: no seek until release, page does not pan
if ((await state()).ctlOpacity !== '1') { await tap(vx + vw / 2, vy + vh * 0.3); await sleep(400) }
let s1 = await state(); const [bx, by, bw] = s1.bar; console.log('before drag', s1)
await touch('touchStart', bx + bw * 0.2, by); await sleep(50)
for (let i = 1; i <= 8; i++) { await touch('touchMove', bx + bw * (0.2 + i * 0.05), by + (i % 2 ? 6 : -6)); await sleep(30) }
console.log('mid-drag (t should be unchanged)', await state())
await touch('touchEnd'); await sleep(800)
const afterDrag = await state(); console.log('after release (t ~ 60% of duration)', afterDrag)
// 3. double tap the right third: +10 s
await sleep(4000) // let controls hide again
const before = (await state()).t
await tap(vx + vw * 0.85, vy + vh / 2); await sleep(120); await tap(vx + vw * 0.85, vy + vh / 2); await sleep(600)
const s3 = await state(); console.log('double tap right: t before', before, 'after', s3.t, 'paused', s3.paused)
// 4. sideways swipe across the picture: the page must not pan
console.log('before swipe', await state())
await touch('touchStart', vx + vw * 0.8, vy + vh * 0.5); for (let i = 1; i <= 10; i++) { await touch('touchMove', vx + vw * (0.8 - i * 0.06), vy + vh * 0.5); await sleep(20) } await touch('touchEnd'); await sleep(300)
console.log('after sideways swipe (controls unchanged by the swipe)', await state())
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(`${outDir}/interact.png`, Buffer.from(shot.result.data, 'base64'))
ws.close(); chrome.kill()
