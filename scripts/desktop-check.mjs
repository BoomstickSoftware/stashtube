// Headless Chrome at a desktop size, driven by a scenario file: per scenario navigate, then run
// steps (real mouse moves, clicks, right-clicks, key presses, Tab, typing, scrolling, eval) and
// save screenshots along the way. Modelled on scripts/mobile-check.mjs; the Stash-write block is
// kept verbatim so nothing is recorded.
// usage: node scripts/desktop-check.mjs <outdir> <base> <scenario.json>
// env: W, H (viewport; default 1440x900)
// scenario.json: [{ name, path, steps: [ {wait:ms} | {mouse:[x,y]} | {click:[x,y]} | {rclick:[x,y]}
//   | {key:'t'} | {tab:n} | {type:'text'} | {scroll:y} | {eval:'expr'} | {shot:'suffix'} ] }]
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const [outDir, base, scenarioFile] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const W = Number(process.env.W ?? 1440)
const H = Number(process.env.H ?? 900)
const scenarios = JSON.parse(readFileSync(scenarioFile, 'utf8'))
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
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
await send('Page.enable')

const KEYS = {
  t: { key: 't', code: 'KeyT', text: 't', vk: 84 },
  b: { key: 'b', code: 'KeyB', text: 'b', vk: 66 },
  f: { key: 'f', code: 'KeyF', text: 'f', vk: 70 },
  '?': { key: '?', code: 'Slash', text: '?', vk: 191, modifiers: 8 },
  '/': { key: '/', code: 'Slash', text: '/', vk: 191 },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Enter: { key: 'Enter', code: 'Enter', text: '\r', vk: 13 },
  Tab: { key: 'Tab', code: 'Tab', vk: 9 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  Space: { key: ' ', code: 'Space', text: ' ', vk: 32 },
}
const press = async (name) => {
  const k = KEYS[name] ?? { key: name, code: name, text: name, vk: name.toUpperCase().charCodeAt(0) }
  const common = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers: k.modifiers ?? 0 }
  await send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...common, ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}) })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...common })
}
const mouse = async (type, x, y, button = 'none', extra = {}) =>
  send('Input.dispatchMouseEvent', { type, x, y, button, pointerType: 'mouse', ...extra })
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.result.data, 'base64'))
  console.log('  shot', name)
}

for (const sc of scenarios) {
  console.log(sc.name, sc.path)
  await send('Page.navigate', { url: base + sc.path })
  await sleep(sc.wait ?? 4000)
  for (const st of sc.steps ?? []) {
    if (st.wait) await sleep(st.wait)
    else if (st.mouse) { await mouse('mouseMoved', st.mouse[0], st.mouse[1]) }
    else if (st.click) {
      const [x, y] = st.click
      await mouse('mouseMoved', x, y)
      await mouse('mousePressed', x, y, 'left', { clickCount: 1 })
      await mouse('mouseReleased', x, y, 'left', { clickCount: 1 })
    } else if (st.rclick) {
      const [x, y] = st.rclick
      await mouse('mouseMoved', x, y)
      await mouse('mousePressed', x, y, 'right', { clickCount: 1 })
      await mouse('mouseReleased', x, y, 'right', { clickCount: 1 })
    } else if (st.key) await press(st.key)
    else if (st.tab) { for (let i = 0; i < st.tab; i++) await press('Tab') }
    else if (st.type) await send('Input.insertText', { text: st.type })
    else if (st.scroll !== undefined) await evaluate(`window.scrollTo({top:${st.scroll}})`)
    else if (st.eval) console.log('  eval:', JSON.stringify(await evaluate(st.eval)))
    else if (st.shot) await shot(`${sc.name}_${st.shot}`)
  }
}
ws.close()
chrome.kill()
