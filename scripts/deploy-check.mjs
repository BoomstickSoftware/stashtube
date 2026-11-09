#!/usr/bin/env node
// After `git push`: wait until the cluster's /healthz reports the pushed commit, then GET the
// routes the CI smoke step covers and print each status. Shows the deployment's image when
// kubectl is on the path. Read-only: nothing here writes to flix, Stash or Whisparr.
//
//   node scripts/deploy-check.mjs             # waits for HEAD, up to 10 min
//   node scripts/deploy-check.mjs <sha>       # a specific commit (full or abbreviated)
//   node scripts/deploy-check.mjs --no-wait   # report what runs now, no waiting
//   env: FLIX (default http://192.168.1.152, the LoadBalancer address flix.lan resolves to),
//        TIMEOUT (seconds, default 600)
import { execSync, spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const FLIX = (process.env.FLIX ?? 'http://192.168.1.152').replace(/\/$/, '')
const TIMEOUT = Number(process.env.TIMEOUT ?? 600) * 1000
const args = process.argv.slice(2)
const noWait = args.includes('--no-wait')
const want = args.find((a) => !a.startsWith('--')) ?? execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()

// The same list as the smoke step in .forgejo/workflows/deploy.yml: every page's first paint.
const ROUTES = ['/readyz', '/', '/api/home', '/api/tags/tiles', '/api/tags?perPage=3', '/api/search?q=a', '/api/scenes/facets', '/api/performers?perPage=3', '/api/studios?perPage=3']

const health = async () => {
  try {
    const r = await fetch(`${FLIX}/healthz`, { signal: AbortSignal.timeout(5000) })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

const t0 = Date.now()
let h = await health()
// Progress: a live line in a terminal, one line every 30 s when piped (a log, an agent).
const tty = process.stdout.isTTY
if (!noWait) {
  let n = 0
  while (!h?.version?.startsWith(want) && Date.now() - t0 < TIMEOUT) {
    const msg = `waiting for ${want.slice(0, 7)}: running ${h?.version?.slice(0, 7) ?? '(no answer)'} after ${Math.round((Date.now() - t0) / 1000)}s`
    if (tty) process.stdout.write(`\r${msg}   `)
    else if (n++ % 6 === 0) console.log(msg)
    await sleep(5000)
    h = await health()
  }
  if (tty) process.stdout.write('\n')
}
if (!h) {
  console.log(`healthz: no answer from ${FLIX}`)
  process.exit(1)
}
const running = h.version ?? '?'
const match = running.startsWith(want)
console.log(`running ${running.slice(0, 7)} ${match ? `(= ${want.slice(0, 7)}) after ${Math.round((Date.now() - t0) / 1000)}s` : `(wanted ${want.slice(0, 7)}, NOT deployed)`}`)

const k = spawnSync('kubectl', ['-n', 'flix', 'get', 'deploy', 'flix', '-o', 'jsonpath={.spec.template.spec.containers[0].image} ready={.status.readyReplicas}/{.spec.replicas}'], { encoding: 'utf8' })
if (k.status === 0) console.log(`image   ${k.stdout.trim()}`)

let bad = 0
for (const path of ROUTES) {
  const started = Date.now()
  try {
    const r = await fetch(`${FLIX}${path}`, { signal: AbortSignal.timeout(30000), redirect: 'manual' })
    const ms = Date.now() - started
    const mark = r.status === 200 ? 'ok  ' : r.status === 401 && path.startsWith('/api') ? 'lock' : 'FAIL'
    if (mark === 'FAIL') bad++
    console.log(`${mark} ${String(r.status).padEnd(4)} ${String(ms).padStart(5)}ms  ${path}`)
  } catch (e) {
    bad++
    console.log(`FAIL ---  ${String(Date.now() - started).padStart(5)}ms  ${path}  ${e instanceof Error ? e.message : e}`)
  }
}
console.log(bad ? `${bad} route(s) failed` : `all ${ROUTES.length} routes answered 200`)

// The Unlisted hold (wiki features/vault): with anything Unlisted, no Vault video may reach a
// Home row flix fills itself (pinned rows may name one) or the Featured row, nor the related
// videos of a video that is not Unlisted, and `noUnlisted` must shrink the library. The Edu hold
// shipped broken once, when Stash ignored its exclusion (2026-11-09).
const json = async (path) => {
  const r = await fetch(`${FLIX}${path}`, { signal: AbortSignal.timeout(60000) })
  if (!r.ok) throw new Error(`${path} answered ${r.status}`)
  return r.json()
}
try {
  const u = await json('/api/unlisted')
  if (!u.tags.length && !u.performers.length && !u.studios.length && !u.sceneTag) console.log('vault -    nothing Unlisted; hold not checked')
  else {
    const ids = new Set()
    let total = 0
    for (let page = 1; page <= 20; page++) {
      const r = await json(`/api/scenes?vault=1&perPage=120&page=${page}`)
      total = r.total
      r.items.forEach((s) => ids.add(s.id))
      if (page * 120 >= r.total) break
    }
    const [all, held, home, featured, recent] = await Promise.all([
      json('/api/scenes?perPage=1'),
      json('/api/scenes?noUnlisted=1&perPage=1'),
      json('/api/home'),
      json('/api/featured?seed=deploy-check&limit=60'),
      json('/api/scenes?noUnlisted=1&sort=created_at&perPage=1'),
    ])
    const normal = recent.items[0]
    const related = normal ? await json(`/api/scenes/${normal.id}/related`) : []
    const leaks = [
      ...home.filter((r) => !String(r.key).startsWith('saved-')).flatMap((r) => r.items.filter((s) => ids.has(s.id)).map((s) => `${r.key}:${s.id}`)),
      ...featured.filter((s) => ids.has(s.id)).map((s) => `featured:${s.id}`),
      ...related.filter((s) => ids.has(s.id)).map((s) => `related(${normal.id}):${s.id}`),
    ]
    const shrinks = !total || held.total < all.total
    const partial = total > ids.size ? ` (checked ${ids.size})` : ''
    if (leaks.length || !shrinks) bad++
    console.log(`${leaks.length || !shrinks ? 'FAIL' : 'ok  '} vault ${total} Unlisted videos${partial}; noUnlisted ${held.total} of ${all.total}; ${leaks.length ? `leaks ${leaks.join(' ')}` : 'none on Home, Featured or related'}`)
  }
} catch (e) {
  bad++
  console.log(`FAIL vault ${e instanceof Error ? e.message : e}`)
}
process.exit(bad || !match ? 1 : 0)
