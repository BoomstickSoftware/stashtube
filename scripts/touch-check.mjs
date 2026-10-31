// Drives the player with real touch events in headless Chrome (iPhone 17 Pro Max size):
// tap to show/hide controls, drag the seek bar (moves the playhead by as far as the finger
// moves, seeks only on release), tap the bar (jumps), drag from the raised hit area above the
// track, double tap the right side (+10 s), swipe sideways on the picture (scrubs, the page
// must not pan), tap the centre play/pause. Prints the player state after each step. Plays and progress are blocked, so nothing is recorded in Stash.
// usage: node scripts/touch-check.mjs <outdir> http://localhost:5173 /scene/<id>
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const [outDir, base, path] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const W = Number(process.env.W ?? 440)
const H = Number(process.env.H ?? 956)
// Chrome picks a free port and writes it to the profile. A fixed port would silently attach to
// any headless Chrome left running from an earlier check (and keep driving its page).
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


const state = () => evaluate(`(() => { const v = document.querySelector('video[poster]'); const bar = document.querySelector('[class*="group/bar"]'); const r = bar.getBoundingClientRect(); const ctl = bar.parentElement; return { t: +v.currentTime.toFixed(1), dur: +v.duration.toFixed(1), paused: v.paused, scrollX, ctlOpacity: getComputedStyle(ctl).opacity, ctlEvents: getComputedStyle(ctl).pointerEvents, bar: [r.left, r.top + r.height / 2, r.width], vid: (() => { const b = v.getBoundingClientRect(); return [b.left, b.top, b.width, b.height] })() } })()`)
const touch = async (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
const tap = async (x, y) => { await touch('touchStart', x, y); await sleep(40); await touch('touchEnd') }
await send('Page.navigate', { url: base + path })
await sleep(5000)
let s0 = await state(); console.log('loaded (controls should have auto-hidden)', s0)
const [vx, vy, vw, vh] = s0.vid
// 1. tap the middle of the picture: controls appear, playback continues
await tap(vx + vw / 2, vy + vh * 0.3); await sleep(400)
console.log('after center tap', await state())
const shown = async () => { if ((await state()).ctlOpacity !== '1') { await tap(vx + vw / 2, vy + vh * 0.3); await sleep(400) } }
// a finger down at `from` (fraction of the bar), moved by `by` of the bar's width, `dy` px above the track
const dragBar = async (from, by, dy = 0) => {
  const [bx, y, bw] = (await state()).bar
  await touch('touchStart', bx + bw * from, y - dy); await sleep(50)
  for (let i = 1; i <= 8; i++) { await touch('touchMove', bx + bw * (from + (by * i) / 8), y - dy + (i % 2 ? 4 : -4)); await sleep(30) }
}
// 2. grab the bar at 70% and drag 20% right: the playhead does not jump to 70%, no seek until
// release, then it lands 20% of the duration past where it was
await shown()
let s1 = await state(); console.log('before drag', s1)
await dragBar(0.7, 0.2)
console.log('mid-drag (t should be unchanged)', await state())
await touch('touchEnd'); await sleep(800)
const afterDrag = await state(); console.log(`after release (t ~ ${(s1.t + s1.dur * 0.2).toFixed(1)}, not ${(s1.dur * 0.9).toFixed(1)})`, afterDrag)
// 2b. a tap on the bar at 30% jumps there
await shown()
{ const [bx, y, bw] = (await state()).bar; await tap(bx + bw * 0.3, y); await sleep(800) }
const afterTap = await state(); console.log(`tap on the bar (t ~ ${(afterTap.dur * 0.3).toFixed(1)})`, afterTap)
// 2c. a drag that starts 40 px above the track still scrubs (the raised hit area)
await shown()
const s2 = await state()
await dragBar(0.5, -0.1, 40); await touch('touchEnd'); await sleep(800)
console.log(`drag from 40 px above the track (t ~ ${(s2.t - s2.dur * 0.1).toFixed(1)})`, await state())
// 3. double tap the right third: +10 s
await sleep(4000) // let controls hide again
const before = (await state()).t
await tap(vx + vw * 0.85, vy + vh / 2); await sleep(120); await tap(vx + vw * 0.85, vy + vh / 2); await sleep(600)
const s3 = await state(); console.log('double tap right: t before', before, 'after', s3.t, 'paused', s3.paused)
// 4. sideways swipe right across the picture: scrubs by as far as the finger moved (1:1 with the
// bar's width), shows the controls, seeks on release; the page must not pan
const s4 = await state(); console.log('before swipe', s4)
await touch('touchStart', vx + vw * 0.2, vy + vh * 0.25) // above the centre buttons
for (let i = 1; i <= 10; i++) { await touch('touchMove', vx + vw * (0.2 + i * 0.03), vy + vh * 0.25); await sleep(20) }
console.log('mid-swipe (t unchanged, controls shown)', await state())
const shotSwipe = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(`${outDir}/swipe.png`, Buffer.from(shotSwipe.result.data, 'base64'))
await touch('touchEnd'); await sleep(800)
console.log(`after sideways swipe (t ~ ${(s4.t + (s4.dur * vw * 0.3) / s4.bar[2]).toFixed(1)}, scrollX 0)`, await state())
// 5. the big play/pause in the middle must take the tap (the controls' gradient once covered it)
const play = () => evaluate(`(() => { const b = document.querySelector('[aria-label="Pause"],[aria-label="Play"]'); const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label'), x: r.left + r.width / 2, y: r.top + r.height / 2, shown: getComputedStyle(b).pointerEvents !== 'none' } })()`)
let pb = await play()
if (!pb.shown) { await tap(pb.x, pb.y); await sleep(400); pb = await play() }
await tap(pb.x, pb.y); await sleep(500)
console.log('centre button: was', pb.label, '-> paused', (await state()).paused)
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(`${outDir}/interact.png`, Buffer.from(shot.result.data, 'base64'))
ws.close(); chrome.kill()
