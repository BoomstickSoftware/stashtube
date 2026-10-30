// Headless Chrome at iPhone 17 Pro Max size: per page, report horizontal overflow and the
// elements that stick out past the viewport, and save a screenshot. Plays and progress are
// blocked, so opening a scene records nothing in Stash.
// usage: node scripts/mobile-check.mjs <outdir> http://localhost:5173 / /browse /scene/<id>
// env: W, H (viewport; W=932 H=430 for landscape), DESKTOP=1 (no touch), WAIT (ms per page),
//      EVAL (an expression to print per page)
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const [outDir, base, ...paths] = process.argv.slice(2)
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

// Never record plays or progress in Stash, or delete anything, from a test run.
await send('Network.enable')
await send('Network.setBlockedURLs', {
  urls: [
    '*/api/scenes/*/play', '*/api/scenes/*/activity', '*/api/scenes/*/markers*', '*/api/scenes/*/o', '*/api/scenes/*/rating',
    '*/api/scenes/delete', '*/api/whisparr/get/*', '*/api/whisparr/get-remote/*',
  ],
})
// Say what was blocked: a gesture test asserts that the write was at least attempted.
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

const probe = `(() => {
  const vw = innerWidth
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (!r.width || (r.right <= vw + 1 && r.left >= -1)) continue
    // ignore things inside a horizontal scroller or a deliberate crop (overflow hidden), but not content cut
    // off by the layout root's overflow-x-clip at the viewport edge: that is text the user cannot read
    let p = el.parentElement, clipped = false
    while (p && p !== document.body) {
      const s = getComputedStyle(p)
      if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden') { clipped = true; break }
      if (s.overflowX === 'clip' && p.getBoundingClientRect().width < vw - 1) { clipped = true; break }
      p = p.parentElement
    }
    if (clipped || getComputedStyle(el).position === 'fixed') continue
    out.push((el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 4).join('.')).slice(0, 90) + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']')
  }
  return { vw, scrollW: document.documentElement.scrollWidth, offenders: out.slice(0, 8) }
})()`

for (const p of paths) {
  await send('Page.navigate', { url: base + p })
  await sleep(Number(process.env.WAIT ?? 4000))
  const r = await evaluate(probe)
  if (process.env.EVAL) console.log('  eval:', JSON.stringify(await evaluate(process.env.EVAL)))
  const name = p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(shot.result.data, 'base64'))
  console.log(`${p}\tvw=${r?.vw} scrollW=${r?.scrollW}${r?.scrollW > r?.vw ? '  OVERFLOW' : ''}`)
  for (const o of r?.offenders ?? []) console.log(`    ${o}`)
}
ws.close()
chrome.kill()
