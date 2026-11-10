// The mini-player round trip in real WebKit (Playwright's build, iPhone 15 Pro Max emulation
// with touch): load a scene, start it (muted: no gesture needed), tap Home (docks), then tap
// Expand, the title and the picture, each of which must restore the full player. Prints the
// path and dock state after each step, every console message, page error and failed request,
// and saves a screenshot per step. Writes that record viewing are blocked.
// usage: node scripts/webkit-mini-check.mjs <outdir> http://localhost:5174 /scene/<id>
// needs: Playwright installed globally (npm i -g playwright) and its WebKit build
//        (`playwright install webkit`; if that hangs while extracting, unzip the downloaded
//        zip by hand into ~/Library/Caches/ms-playwright/webkit-<rev>/ and touch
//        INSTALLATION_COMPLETE there, see wiki/gotchas/playwright-webkit-install-hangs.md)
// env: PLAYWRIGHT (path of the playwright package, /opt/homebrew/lib/node_modules/playwright)
import { mkdirSync } from 'node:fs'
import { maskValue, redactUrl } from './lib/neutral.mjs'
import { INJECT, PLACEHOLDER, wantsNeutral } from './lib/neutral-page.mjs'

const PW = process.env.PLAYWRIGHT ?? '/opt/homebrew/lib/node_modules/playwright'
let webkit, devices
try {
  ;({ webkit, devices } = await import(`${PW}/index.mjs`))
} catch (e) {
  console.error(`cannot load Playwright from ${PW} (${e.message}); npm i -g playwright && playwright install webkit, or set PLAYWRIGHT`)
  process.exit(2)
}

const [outDir, base, path] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
// NEUTRAL BY DEFAULT (wiki/runbooks/neutral-observability.md); --content or CONTENT=1 shows the real library.
const NEUTRAL = wantsNeutral()
if (!outDir || !base || !path) { console.error('usage: node scripts/webkit-mini-check.mjs <outdir> <base url> /scene/<id>'); process.exit(2) }
mkdirSync(outDir, { recursive: true })
const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPhone 15 Pro Max'] })
// Never record plays or progress in Stash, or delete anything, from a test run.
await ctx.route(/\/api\/(scenes\/[^/]+\/(play|activity|markers|o|rating)(?=[/?]|$)|scenes\/delete|whisparr\/get)/, (r) => {
  console.log('  blocked:', r.request().method(), NEUTRAL ? redactUrl(new URL(r.request().url()).pathname) : r.request().url())
  r.abort()
})
const replaced = new Set() // picture URLs answered with the placeholder
let masked = 0
if (NEUTRAL) {
  await ctx.addInitScript(INJECT)
  // library pictures become a grey placeholder; API answers reach the app with names and titles as filler
  await ctx.route(/\/media\/.*/, (r) => {
    if (r.request().resourceType() !== 'image') return r.fallback()
    replaced.add(r.request().url())
    return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: Buffer.from(PLACEHOLDER, 'base64') })
  })
  await ctx.route(/\/api\//, async (r) => {
    if (r.request().method() !== 'GET') return r.fallback()
    try {
      const res = await r.fetch()
      const type = res.headers()['content-type'] ?? ''
      if (!type.includes('json')) return r.fulfill({ response: res })
      masked++
      return r.fulfill({ response: res, json: maskValue(await res.json()) })
    } catch {
      return r.fulfill({ status: 502, json: { error: 'neutral mode could not read this response' } })
    }
  })
}
const show = (u) => (NEUTRAL ? redactUrl(new URL(u).pathname) : u.slice(0, 140))
const page = await ctx.newPage()
page.on('console', (m) => m.type() !== 'debug' && console.log(`  console.${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => console.log(`  PAGE ERROR: ${e.message}\n${e.stack ?? ''}`))
page.on('requestfailed', (r) => r.failure()?.errorText !== 'cancelled' && console.log('  request failed:', r.method(), show(r.url()), r.failure()?.errorText))

const state = () =>
  page.evaluate(() => {
    const v = document.querySelector('video')
    const dock = document.querySelector('[role=region][aria-label="Now playing"]')
    return { path: location.pathname, docked: !!dock, paused: v?.paused ?? null, t: v ? +v.currentTime.toFixed(1) : null }
  })
let n = 0
const step = async (name, fn) => {
  await fn()
  await page.waitForTimeout(1500)
  const s = await state()
  console.log(`${name.padEnd(24)} ${JSON.stringify(s)}`)
  // neutral: the stylesheet is in force, every video is flat, and every library picture showing is a placeholder
  const seen = NEUTRAL ? await page.evaluate(() => ({ flat: !!window.__neutralSheet && [...document.querySelectorAll('video, canvas')].every((v) => getComputedStyle(v).filter.includes('contrast(0)')), shown: [...document.images].filter((i) => i.complete && i.naturalWidth > 0 && /\/media\//.test(i.currentSrc)).map((i) => i.currentSrc) })) : { flat: true, shown: [] }
  const real = seen.shown.filter((u) => !replaced.has(u)).length
  const flat = seen.flat && real === 0
  if (!flat) console.log(`  not neutral: flat=${seen.flat} real pictures=${real}`)
  if (flat) await page.screenshot({ path: `${outDir}/${++n}-${name.replace(/\W+/g, '_')}.png` })
  else console.log('  NOT NEUTRAL, screenshot withheld')
  return s
}

await page.goto(base + path)
await page.waitForTimeout(5000)
await step('loaded', async () => {})
await step('play', async () => {
  // a tap on the Player's centre button seeks to the resume point; muted play() then needs no gesture
  const big = page.locator('button.size-20').first()
  if (await big.count()) await big.tap({ force: true })
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    const v = document.querySelector('video')
    v.muted = true
    return v.play().catch((e) => console.log('play refused', e.name, e.message))
  })
  await page.waitForTimeout(2500)
})
const docked = await step('tap Home', () => page.locator('nav a[href="/"]').tap())
if (!docked.docked) { console.log('FAIL: the player did not dock'); await browser.close(); process.exit(1) }

let failed = false
const paths = [['Expand', '[aria-label="Expand"]'], ['title', '[role=region][aria-label="Now playing"] a.min-w-0'], ['picture', '[aria-label="Back to the video"]']]
for (const [name, loc] of paths) {
  if ((await state()).path !== '/') await step('tap Home', () => page.locator('nav a[href="/"]').tap())
  const s = await step(`tap ${name}`, () => page.locator(loc).tap())
  if (s.path === path && !s.docked) console.log(`ok: ${name} restored`)
  else { console.log(`FAIL: ${name} -> ${s.path}, docked ${s.docked}`); failed = true }
}
if (NEUTRAL) console.log(`neutral: ${masked} API answers masked, ${replaced.size} pictures replaced`)
console.log(failed ? 'FAILED' : 'all restore paths work')
await browser.close()
process.exit(failed ? 1 : 0)
