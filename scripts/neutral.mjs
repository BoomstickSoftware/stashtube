#!/usr/bin/env node
// Content-neutral observability: look at flix, Stash, Whisparr, Postgres and the pod's logs
// without a performer, studio, scene, category, indexer or download name, a title, a
// description or a file path reaching the terminal. Ids in, counts out: every string that is
// not an id, a number, a date, an enum or a route becomes `<str:LEN #HASH>` (equal strings share
// a hash). Rules and unit tests: scripts/lib/neutral.mjs; runbook: wiki/runbooks/neutral-observability.md.
// Everything here only reads: GET for flix and Whisparr, queries (never mutations) for Stash,
// a READ ONLY transaction for Postgres.
//
//   node scripts/neutral.mjs api <path> [--n 5]            GET a flix route: status, ms, bytes, cache headers, shape
//   node scripts/neutral.mjs routes                        the GET routes of apps/server/src/api.ts
//   node scripts/neutral.mjs stash summary|jobs            library counts, missing-metadata counts, job queue
//   node scripts/neutral.mjs stash q '<graphql>' ['<vars>'] any Stash query (a mutation is refused)
//   node scripts/neutral.mjs whisparr summary              records, files, what is monitored, queue, history, health
//   node scripts/neutral.mjs whisparr get <path> [k=v…]    any Whisparr GET (movie, queue, history, health, …)
//   node scripts/neutral.mjs db                            flix's tables: rows, nulls, id and time ranges, enum counts, jsonb shape
//   node scripts/neutral.mjs db sql '<select …>'           one statement in a READ ONLY transaction
//   node scripts/neutral.mjs logs [--since 15m] [--tail 2000] [--lines] [--previous]   the pod's log, scrubbed
//   <any command> | node scripts/neutral.mjs redact        scrub JSON, JSON lines, TSV or text from stdin
//
// Output of api / q / get / sql / redact: one line per JSON path (shape). --full prints the
// redacted JSON instead (--items N array entries, default 5); --pick '$.items[].id' prints every
// value at one path (ids out, to feed the next command).
// Stash, Whisparr and Postgres are reached from inside the flix pod (kubectl exec, where the keys
// are; the Mac needs no .env); --local runs the fetcher here with STASH_URL, STASH_API_KEY,
// WHISPARR_URL, WHISPARR_API_KEY, DATABASE_URL from the environment or .env (never printed).
// env: FLIX (default http://flix.lan), NEUTRAL_SALT (default: private/neutral.salt, made on first use)
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib'
import { buildVocab, classify, denyScrubber, pick, redactText, redactUrl, redactValue, shapeLines, urlPattern } from './lib/neutral.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}
const VALUE_FLAGS = new Set(['--n', '--items', '--pick', '--since', '--tail', '--base'])
const pos = argv.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]))

// --- salt, vocabulary, the deny-list net ----------------------------------------------------
function salt() {
  if (process.env.NEUTRAL_SALT) return process.env.NEUTRAL_SALT
  const file = join(ROOT, 'private', 'neutral.salt')
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, randomBytes(16).toString('hex'))
  }
  return readFileSync(file, 'utf8').trim()
}
const SALT = salt()
const sources = () => {
  const out = []
  for (const dir of ['apps/server/src', 'apps/server/src/cache', 'apps/server/src/db', 'packages/shared/src', 'scripts/lib']) {
    const abs = join(ROOT, dir)
    if (!existsSync(abs)) continue
    for (const f of readdirSync(abs)) if (/\.(ts|mjs)$/.test(f) && !/\.test\.|schema\.ts$/.test(f)) out.push(readFileSync(join(abs, f), 'utf8'))
  }
  // Stash's schema names, so a GraphQL error can name the field it objects to
  const schema = join(ROOT, 'apps/server/stash.schema.graphql')
  if (existsSync(schema)) out.push(readFileSync(schema, 'utf8').replace(/"""[\s\S]*?"""|#[^\n]*/g, ' '))
  return out
}
let vocabCache
const vocab = () => (vocabCache ??= buildVocab(sources()))
const O = () => ({ salt: SALT, vocab: vocab(), items: Number(opt('items', 5)) })

const terms = (f) => (existsSync(join(ROOT, 'private', f)) ? readFileSync(join(ROOT, 'private', f), 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean) : [])
let scrub
let denyHits = 0
// The only way anything is printed: through the deny-list net (private/denylist*.txt).
function say(...lines) {
  scrub ??= denyScrubber([...terms('denylist.auto.txt'), ...terms('denylist.txt')], terms('allowlist.txt'))
  for (const line of lines) {
    const r = scrub(String(line))
    denyHits += r.hits
    process.stdout.write(`${r.text}\n`)
  }
}
const finish = (code = 0) => {
  if (denyHits) process.stdout.write(`(deny-list net: ${denyHits} replacement(s) above; the allow-list let a library name through, tighten scripts/lib/neutral.mjs)\n`)
  process.exit(code)
}
const die = (msg, code = 2) => {
  say(`neutral: ${msg}`)
  finish(code)
}

// How a JSON value is shown: shape lines, the redacted JSON (--full) or one path's values (--pick).
function show(value) {
  const o = O()
  const want = opt('pick')
  if (want) return say(pick(value, want, o).map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n') || `(nothing at ${want})`)
  if (flag('full')) return say(JSON.stringify(redactValue(value, o), null, 1))
  say(...shapeLines(value, o))
}

// --- flix API -------------------------------------------------------------------------------
function get(url) {
  return new Promise((done, fail) => {
    const t0 = performance.now()
    const req = (url.startsWith('https:') ? https : http).get(url, { headers: { 'accept-encoding': 'gzip, br', accept: 'application/json' }, timeout: 120_000 }, (res) => {
      const ttfb = performance.now() - t0
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const wire = Buffer.concat(chunks)
        const enc = res.headers['content-encoding'] ?? ''
        let body = wire
        try {
          body = enc === 'gzip' ? gunzipSync(wire) : enc === 'br' ? brotliDecompressSync(wire) : enc === 'deflate' ? inflateSync(wire) : wire
        } catch {}
        done({ status: res.statusCode, headers: res.headers, ttfb, ms: performance.now() - t0, wire: wire.length, body })
      })
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', fail)
  })
}

async function api() {
  const path = pos[1]
  if (!path || !path.startsWith('/')) die('usage: neutral.mjs api </api/… or any path> [--n 5] [--full|--pick $.path]')
  if (argv.some((a) => /^(-X|--method|--data|-d)$/.test(a))) die('GET only: this tool never writes')
  const base = opt('base', process.env.FLIX ?? 'http://flix.lan').replace(/\/$/, '')
  const n = Math.max(1, Math.min(50, Number(opt('n', 1))))
  const runs = []
  for (let i = 0; i < n; i++) runs.push(await get(base + path))
  const r = runs[0]
  const type = (r.headers['content-type'] ?? '').split(';')[0]
  const ms = runs.map((x) => Math.round(x.ms)).sort((a, b) => a - b)
  say(`GET ${redactUrl(path, O())}  ${r.status}  ${n > 1 ? `ms min/med/max ${ms[0]}/${ms[Math.floor((n - 1) / 2)]}/${ms.at(-1)} (n=${n})` : `${ms[0]}ms`} (ttfb ${Math.round(r.ttfb)}ms)  ${r.wire}B on the wire${r.headers['content-encoding'] ? ` (${r.headers['content-encoding']})` : ''}, ${r.body.length}B decoded`)
  say(`type=${type || '-'}  cache-control=${r.headers['cache-control'] ?? '-'}  etag=${r.headers.etag ? 'yes' : 'no'}  vary=${r.headers.vary ?? '-'}`)
  if (type.includes('json')) {
    let json
    try {
      json = JSON.parse(r.body.toString('utf8'))
    } catch {
      die('the body is not valid JSON', 1)
    }
    show(json)
  } else if (type.startsWith('text/') && !type.includes('html')) {
    say(...r.body.toString('utf8').split('\n').slice(0, 5).map((l) => `  ${redactText(l, O())}`))
  }
  finish(r.status >= 400 ? 1 : 0)
}

function routes() {
  const src = readFileSync(join(ROOT, 'apps/server/src/api.ts'), 'utf8')
  const found = [...src.matchAll(/api\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)].map((m) => [m[1].toUpperCase(), `/api${m[2]}`])
  const gets = found.filter(([m]) => m === 'GET').map(([, p]) => p)
  say(...gets, `${gets.length} GET routes (this tool reads only these); ${found.length - gets.length} write routes not listed`)
}

// --- the pod-side fetcher -------------------------------------------------------------------
function fetcher(job) {
  const payload = Buffer.from(JSON.stringify(job)).toString('base64')
  const script = readFileSync(join(ROOT, 'scripts/lib/neutral-pod.mjs'), 'utf8')
  const r = flag('local')
    ? spawnSync(process.execPath, [existsSync(join(ROOT, '.env')) ? `--env-file=${join(ROOT, '.env')}` : '--no-warnings', '-', payload], { input: script, cwd: join(ROOT, 'apps/server'), encoding: 'utf8', maxBuffer: 1 << 30 })
    : spawnSync('kubectl', ['-n', 'flix', 'exec', '-i', 'deploy/flix', '--', 'node', '-', payload], { input: script, encoding: 'utf8', maxBuffer: 1 << 30 })
  if (r.error) die(`could not start ${flag('local') ? 'node' : 'kubectl'}: ${r.error.code ?? r.error.name}`, 1)
  let env
  try {
    env = JSON.parse(r.stdout)
  } catch {
    // never the raw stderr: it can quote what was sent
    say(`neutral: the fetcher gave no JSON (exit ${r.status}); stderr, scrubbed:`, ...String(r.stderr).split('\n').filter(Boolean).slice(0, 12).map((l) => `  ${redactText(l, O())}`))
    finish(1)
  }
  return env
}
// A failed envelope, said without echoing what the upstream said back about our input.
function problem(name, e) {
  if (e.refused) return `${name}: refused: ${e.refused}`
  if (e.thrown) return `${name}: ${e.thrown.name}${e.thrown.code ? ` ${e.thrown.code}` : ''}: ${redactText(e.thrown.message, O())}`
  if (e.errors?.length) return `${name}: ${e.errors.length} GraphQL error(s): ${e.errors.map((x) => `${x.code ?? 'error'} at ${(x.path ?? []).map((p) => (typeof p === 'number' ? p : redactText(String(p), O()))).join('.') || '-'}: ${redactText(x.message, O())}`).join(' | ')}`
  return `${name}: HTTP ${e.status}${e.body && typeof e.body === 'object' ? `: ${JSON.stringify(redactValue(e.body, O()))}` : ''}`
}
const head = (name, e) => `${name}  ${e.status ?? '-'}  ${e.ms ?? '-'}ms  ${e.bytes ?? '-'}B`

// Counts of each (redacted) value of `key` across rows: `monitored true=3 false=120`.
function tally(rows, key) {
  const counts = new Map()
  for (const r of rows) {
    const v = r?.[key]
    const k = v === null || v === undefined ? 'null' : typeof v === 'string' ? classify(key, v, O()).out : typeof v === 'object' ? '(object)' : String(v)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return `${key} ${[...counts].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}=${n}`).join(' ')}`
}

// --- Stash ----------------------------------------------------------------------------------
const JOBS = '{ jobQueue { id status progress addTime startTime } }'
const count = (finder, filterType, filter) => `{ ${finder}(${filterType}: ${filter}, filter: { per_page: 0 }) { count } }`
function stashSummary() {
  const jobs = {
    system: { op: 'stash', query: '{ version { version } systemStatus { status databaseSchema appSchema } stats { scene_count scenes_size scenes_duration image_count gallery_count performer_count studio_count group_count tag_count total_o_count total_play_duration total_play_count scenes_played } }' },
    jobs: { op: 'stash', query: JOBS },
  }
  const missing = { scene: ['title', 'details', 'date', 'studio', 'performers', 'tags', 'stash_id', 'phash', 'url', 'cover'], performer: ['stash_id', 'image', 'gender', 'details'], studio: ['stash_id', 'image'] }
  const finder = { scene: ['findScenes', 'scene_filter'], performer: ['findPerformers', 'performer_filter'], studio: ['findStudios', 'studio_filter'] }
  for (const [kind, fields] of Object.entries(missing)) for (const f of fields) jobs[`${kind} missing ${f}`] = { op: 'stash', query: count(...finder[kind], `{ is_missing: "${f}" }`) }
  Object.assign(jobs, {
    'scene organized': { op: 'stash', query: count('findScenes', 'scene_filter', '{ organized: true }') },
    'scene never played': { op: 'stash', query: count('findScenes', 'scene_filter', '{ play_count: { value: 0, modifier: EQUALS } }') },
    'scene with resume point': { op: 'stash', query: count('findScenes', 'scene_filter', '{ resume_time: { value: 0, modifier: GREATER_THAN } }') },
    'scene rated': { op: 'stash', query: count('findScenes', 'scene_filter', '{ rating100: { value: 0, modifier: GREATER_THAN } }') },
    'scene without a file': { op: 'stash', query: count('findScenes', 'scene_filter', '{ file_count: { value: 0, modifier: EQUALS } }') },
    'scene with 2+ files': { op: 'stash', query: count('findScenes', 'scene_filter', '{ file_count: { value: 1, modifier: GREATER_THAN } }') },
    'scene with markers': { op: 'stash', query: count('findScenes', 'scene_filter', '{ has_markers: "true" }') },
    'performer favourite': { op: 'stash', query: count('findPerformers', 'performer_filter', '{ filter_favorites: true }') },
    'performer without scenes': { op: 'stash', query: count('findPerformers', 'performer_filter', '{ scene_count: { value: 0, modifier: EQUALS } }') },
    'studio favourite': { op: 'stash', query: count('findStudios', 'studio_filter', '{ favorite: true }') },
    'studio without scenes': { op: 'stash', query: count('findStudios', 'studio_filter', '{ scene_count: { value: 0, modifier: EQUALS } }') },
    'tag favourite': { op: 'stash', query: count('findTags', 'tag_filter', '{ favorite: true }') },
    'tag without scenes': { op: 'stash', query: count('findTags', 'tag_filter', '{ scene_count: { value: 0, modifier: EQUALS } }') },
  })
  const env = fetcher({ op: 'batch', jobs })
  if (!env.ok) die(problem('stash', env), 1)
  const b = env.body
  if (!b.system.ok) die(problem('stash', b.system), 1)
  const s = b.system.body
  say(`stash ${s.version.version}  status=${classify('status', s.systemStatus.status, O()).out}  schema ${s.systemStatus.databaseSchema}/${s.systemStatus.appSchema}  (${b.system.ms}ms)`)
  say(...Object.entries(s.stats).map(([k, v]) => `  ${k.padEnd(22)} ${typeof v === 'number' ? Math.round(v) : v}`))
  say('counts')
  for (const [name, e] of Object.entries(b)) {
    if (name === 'system' || name === 'jobs') continue
    const n = e.ok ? Object.values(e.body)[0]?.count : null
    say(`  ${name.padEnd(26)} ${n ?? `(${problem('query', e)})`}`)
  }
  jobLines(b.jobs)
}
function jobLines(e) {
  if (!e.ok) return say(problem('jobs', e))
  const q = e.body.jobQueue ?? []
  say(`job queue: ${q.length}${q.length ? '' : ' (empty)'}`)
  for (const j of q) say(`  job ${j.id}  ${classify('status', j.status, O()).out}  ${j.progress === null ? '-' : `${Math.round(j.progress * 100)}%`}  added ${j.addTime}  started ${j.startTime ?? '-'}`)
}
function stash() {
  const sub = pos[1]
  if (sub === 'summary') return stashSummary()
  if (sub === 'jobs') return jobLines(fetcher({ op: 'stash', query: JOBS }))
  if (sub === 'q' && pos[2]) {
    let variables
    try {
      variables = pos[3] ? JSON.parse(pos[3]) : undefined
    } catch {
      die('the variables are not valid JSON')
    }
    const e = fetcher({ op: 'stash', query: pos[2], variables })
    if (!e.ok) die(problem('stash', e), 1)
    say(head('stash', e))
    return show(e.body)
  }
  die("usage: neutral.mjs stash summary | jobs | q '<graphql>' ['<vars json>']")
}

// --- Whisparr -------------------------------------------------------------------------------
function whisparrSummary() {
  const env = fetcher({
    op: 'batch',
    jobs: {
      status: { op: 'whisparr', path: 'system/status' },
      health: { op: 'whisparr', path: 'health' },
      movie: { op: 'whisparr', path: 'movie' },
      performer: { op: 'whisparr', path: 'performer' },
      studio: { op: 'whisparr', path: 'studio' },
      queue: { op: 'whisparr', path: 'queue?pageSize=500&includeUnknownMovieItems=true' },
      history: { op: 'whisparr', path: 'history?pageSize=200&sortKey=date&sortDirection=descending' },
      missing: { op: 'whisparr', path: 'wanted/missing?pageSize=1' },
      exclusions: { op: 'whisparr', path: 'exclusions' },
      commands: { op: 'whisparr', path: 'command' },
      disks: { op: 'whisparr', path: 'diskspace' },
    },
  })
  if (!env.ok) die(problem('whisparr', env), 1)
  const b = env.body
  const list = (name) => (b[name].ok ? (Array.isArray(b[name].body) ? b[name].body : (b[name].body?.records ?? [])) : null)
  const section = (name, fn) => {
    const rows = list(name)
    if (!rows) return say(`${name}: ${problem(name, b[name])}`)
    say(`${name}: ${b[name].body?.totalRecords ?? rows.length}${b[name].body?.totalRecords > rows.length ? ` (first ${rows.length} read)` : ''}  (${b[name].ms}ms, ${b[name].bytes}B)`)
    if (rows.length) fn(rows)
  }
  if (b.status.ok) say(`whisparr ${b.status.body.version}  started ${b.status.body.startTime ?? '-'}  db ${classify('databaseType', String(b.status.body.databaseType ?? ''), O()).out}  (${b.status.ms}ms)`)
  else say(problem('status', b.status))
  section('health', (rows) => say(`  ${tally(rows, 'type')}`, `  ${tally(rows, 'source')}`))
  section('movie', (rows) => {
    say(`  ${tally(rows, 'hasFile')}`, `  ${tally(rows, 'monitored')}`, `  ${tally(rows, 'itemType')}`, `  ${tally(rows, 'status')}`)
    say(`  monitored without a file: ${rows.filter((m) => m.monitored && !m.hasFile).length}; ids: ${rows.filter((m) => m.monitored && !m.hasFile).slice(0, 20).map((m) => m.id).join(',') || '-'}`)
    const sizes = rows.map((m) => m.sizeOnDisk ?? 0)
    say(`  size on disk: ${Math.round(sizes.reduce((a, c) => a + c, 0) / 2 ** 30)} GiB; id range ${Math.min(...rows.map((m) => m.id))}..${Math.max(...rows.map((m) => m.id))}`)
  })
  // CLAUDE.md rule 9: no performer or studio may be monitored
  for (const kind of ['performer', 'studio']) section(kind, (rows) => say(`  ${tally(rows, 'monitored')}${rows.some((r) => r.monitored) ? `  <-- must be 0 (rule 9); ids: ${rows.filter((r) => r.monitored).slice(0, 20).map((r) => r.id).join(',')}` : ''}`))
  section('queue', (rows) => {
    say(`  ${tally(rows, 'status')}`, `  ${tally(rows, 'trackedDownloadState')}`, `  ${tally(rows, 'trackedDownloadStatus')}`, `  ${tally(rows, 'protocol')}`)
    say(`  queue ids: ${rows.slice(0, 30).map((r) => r.id).join(',')}; movie ids: ${rows.slice(0, 30).map((r) => r.movieId ?? '-').join(',')}`)
  })
  section('history', (rows) => {
    const dates = rows.map((r) => r.date).filter(Boolean).sort()
    say(`  ${tally(rows, 'eventType')}`, `  ${dates[0] ?? '-'} .. ${dates.at(-1) ?? '-'}`)
  })
  section('missing', () => {})
  section('exclusions', () => {})
  // a command's `name` is a code identifier (one CamelCase word), not library content
  section('commands', (rows) => say(`  ${tally(rows, 'status')}`, `  ${tally(rows.map((r) => ({ command: /^[A-Za-z]{1,40}$/.test(r.name ?? '') ? r.name : null })), 'command')}`))
  section('disks', (rows) => say(...rows.map((d, i) => `  disk ${i}: ${Math.round((d.freeSpace ?? 0) / 2 ** 30)} GiB free of ${Math.round((d.totalSpace ?? 0) / 2 ** 30)} GiB`)))
}
function whisparr() {
  const sub = pos[1]
  if (sub === 'summary') return whisparrSummary()
  if (sub === 'get' && pos[2]) {
    const params = pos.slice(3).filter((a) => a.includes('='))
    const path = pos[2].replace(/^\//, '') + (params.length ? (pos[2].includes('?') ? '&' : '?') + params.join('&') : '')
    const e = fetcher({ op: 'whisparr', path })
    if (!e.ok) die(problem('whisparr', e), 1)
    say(head(`GET ${redactUrl(`/api/v3/${path}`, O())}`, e))
    return show(e.body)
  }
  die('usage: neutral.mjs whisparr summary | get <path> [k=v…]')
}

// --- Postgres -------------------------------------------------------------------------------
function db() {
  if (pos[1] === 'sql') {
    if (!pos[2]) die("usage: neutral.mjs db sql '<select …>'")
    // reads only, said twice: here by the statement's first word, in the pod by a READ ONLY transaction
    if (!/^\s*(select|with|show|explain|table|values)\b/i.test(pos[2]) || /;\s*\S/.test(pos[2])) die('db sql takes one read statement (select, with, show, explain); this tool never writes')
    const e = fetcher({ op: 'sql', sql: pos[2] })
    if (!e.ok) die(problem('sql', e), 1)
    say(`sql  ${e.body.length} row(s)  ${e.ms}ms`)
    return show(e.body)
  }
  const e = fetcher({ op: 'db' })
  if (!e.ok) die(problem('db', e), 1)
  const o = O()
  for (const t of e.body) {
    say(`${t.table}: ${t.agg.rows} rows, ${Math.round(t.bytes / 1024)} KiB`)
    for (const c of t.columns) {
      const a = (fn) => t.agg[`${fn}:${c.column_name}`]
      const type = c.data_type.replace('timestamp with time zone', 'timestamptz').replace('character varying', 'varchar')
      const parts = [`nulls ${a('nulls')}`]
      if (a('min') !== undefined && a('min') !== null) parts.push(`${classify('', String(a('min')).replace(' ', 'T').replace(/\+00$/, 'Z'), o).out} .. ${classify('', String(a('max')).replace(' ', 'T').replace(/\+00$/, 'Z'), o).out}`)
      if (a('distinct') !== undefined) parts.push(`distinct ${a('distinct')}`, `avg len ${a('avglen') ?? '-'}`, `id-like ${a('idlike')}`)
      if (a('true') !== undefined) parts.push(`true ${a('true')}`)
      if (a('avgbytes') !== undefined) parts.push(`avg ${a('avgbytes') ?? '-'} B`)
      if (t.enums[c.column_name]) parts.push(`values ${t.enums[c.column_name].map((r) => `${r.value === null ? 'null' : classify(c.column_name, String(r.value), o).out}=${r.n}`).join(' ')}`)
      say(`  ${c.column_name.padEnd(18)} ${type.padEnd(12)} ${parts.join('; ')}`)
      if (t.json[c.column_name]?.length) say(...shapeLines(t.json[c.column_name], o).slice(1, 40).map((l) => `      ${l}`))
    }
  }
}

// --- logs -----------------------------------------------------------------------------------
function logs() {
  const args = ['-n', 'flix', 'logs', 'deploy/flix', `--since=${opt('since', '15m')}`, `--tail=${Number(opt('tail', 2000))}`]
  if (flag('previous')) args.push('--previous')
  const r = spawnSync('kubectl', args, { encoding: 'utf8', maxBuffer: 1 << 28 })
  if (r.error || r.status !== 0) die(`kubectl logs failed (exit ${r.status ?? r.error?.code}): ${redactText(String(r.stderr ?? '').split('\n')[0], O())}`, 1)
  const lines = r.stdout.split('\n').filter((l) => l.trim())
  const o = O()
  const red = lines.map((l) => redactText(l, o))
  if (flag('lines')) return say(...red)
  // Hono's logger: `<-- GET /path` then `--> GET /path 200 12ms`
  const reqs = new Map()
  const other = new Map()
  for (const l of red) {
    const m = l.match(/^--> (\w+) (\S+) (\d{3}) (\d+)(ms|s)$/)
    if (m) {
      const key = `${m[1]} ${urlPattern(m[2])}  ${m[3]}`
      const ms = Number(m[4]) * (m[5] === 's' ? 1000 : 1)
      reqs.set(key, [...(reqs.get(key) ?? []), ms])
    } else if (!l.startsWith('<-- ')) other.set(l, (other.get(l) ?? 0) + 1)
  }
  say(`${lines.length} lines since ${opt('since', '15m')}: ${[...reqs.values()].reduce((a, b) => a + b.length, 0)} requests on ${reqs.size} route+status pairs, ${[...other.values()].reduce((a, b) => a + b, 0)} other lines`)
  say('requests (count, ms min/med/max), slowest median first:')
  const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]
  for (const [k, xs] of [...reqs].sort((a, b) => med(b[1]) - med(a[1])).slice(0, 60)) say(`  ${String(xs.length).padStart(5)}  ${String(Math.min(...xs)).padStart(6)}/${String(med(xs)).padStart(6)}/${String(Math.max(...xs)).padStart(6)}  ${k}`)
  say('other lines (count, text):')
  for (const [l, n] of [...other].sort((a, b) => b[1] - a[1]).slice(0, 80)) say(`  ${String(n).padStart(5)}  ${l.slice(0, 300)}`)
  if (!other.size) say('  (none)')
}

// --- stdin filter ---------------------------------------------------------------------------
function redactStdin() {
  const text = readFileSync(0, 'utf8')
  const o = O()
  try {
    return show(JSON.parse(text))
  } catch {}
  const lines = text.split('\n').filter((l) => l.length)
  const parsed = lines.map((l) => {
    try {
      const v = JSON.parse(l)
      return v && typeof v === 'object' ? v : undefined
    } catch {
      return undefined
    }
  })
  if (lines.length && parsed.every((v) => v !== undefined)) return show(parsed)
  // TSV with a header line (whisparr.py): each cell under its column's name
  const tabs = lines[0]?.split('\t').length ?? 0
  if (tabs > 1 && !lines[0].startsWith('ERR\t') && lines.every((l) => l.split('\t').length === tabs)) {
    const cols = lines[0].split('\t')
    say(cols.map((c) => redactText(c, o)).join('\t'))
    return say(...lines.slice(1).map((l) => l.split('\t').map((cell, i) => (cell === '-' ? cell : classify(cols[i], cell, o).out)).join('\t')))
  }
  say(...lines.map((l) => l.split('\t').map((cell) => redactText(cell, o)).join('\t')))
}

const commands = { api, routes, stash, whisparr, db, logs, redact: redactStdin }
try {
  const cmd = commands[pos[0]]
  if (!cmd) {
    say(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 28).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
    finish(pos[0] ? 2 : 0)
  }
  await cmd()
  finish(0)
} catch (e) {
  // an exception's message can carry data; say its class and a scrubbed message only
  say(`neutral: ${e?.name ?? 'Error'}${e?.code ? ` ${e.code}` : ''}: ${redactText(String(e?.message ?? ''), { salt: SALT, vocab: buildVocab() })}`)
  finish(1)
}
