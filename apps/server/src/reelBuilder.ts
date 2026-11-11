// The reel builder (wiki features/reel-builds). Not part of the flix server: it is copied to the
// NAS with the two shared files it imports (scripts/reel-builder.mjs) and runs there in a
// container. It asks flix once a minute whether a reel is waiting, and renders what it is
// handed: every clip to its own intermediate (reused when nothing about it changed), then the
// intermediates joined by copy into one file. flix decides when work is offered; this never
// looks at the clock.
//
//   FLIX_URL      flix by IP and port, e.g. http://192.168.1.152 (no hosts entry in the container)
//   REELS_DIR     the reels folder, writable (default /reels); intermediates live in its .work
//   POLL_SECONDS  between questions to flix (default 60)
//   ONCE=1        ask once, build at most one reel, exit (for a test run)
//
// It prints ids, counts and timings only, never a path or a title.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { type BuildPlan, clipArgs, clipKey, concatList, joinArgs, overSource, type RenderClip } from '../../../packages/shared/src/render.ts'

const FLIX = (process.env.FLIX_URL ?? '').replace(/\/$/, '')
const DIR = (process.env.REELS_DIR ?? '/reels').replace(/\/$/, '')
const WORK = `${DIR}/.work`
const POLL_MS = Number(process.env.POLL_SECONDS ?? 60) * 1000
const KEEP_INTERMEDIATES_DAYS = 30
const REEL_FILE = /^reel-\d+-b\d+\.mp4$/
const log = (s: string) => console.log(`${new Date().toISOString()} ${s}`)

if (!FLIX) throw new Error('FLIX_URL is not set')

async function api<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  const r = await fetch(`${FLIX}/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  if (r.status === 204) return null
  if (!r.ok) throw new Error(`flix ${method} ${path}: HTTP ${r.status}`)
  return (await r.json()) as T
}

// Runs a program, niced; resolves with its exit code and the tail of what it printed.
function run(cmd: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn('nice', ['-n', '10', cmd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const keep = (d: Buffer) => {
      out = (out + d.toString()).slice(-8000)
    }
    p.stdout.on('data', keep)
    p.stderr.on('data', keep)
    p.on('error', (e) => resolve({ code: 127, out: String(e) }))
    p.on('close', (code) => resolve({ code: code ?? 1, out }))
  })
}

// ffmpeg's last complaint, with any path taken out.
const reason = (out: string, paths: string[]) => {
  const lines = out.split(/[\r\n]+/)
  const line = lines.filter((l) => /error|invalid|failed|no such|denied/i.test(l)).at(-1) ?? lines.filter((l) => l.trim()).at(-1) ?? 'no output'
  return paths.reduce((l, p) => l.replaceAll(p, '<path>'), line).slice(0, 300)
}

async function probe(file: string): Promise<{ duration: number; bitrate: number }> {
  const r = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate', '-of', 'csv=p=0', file])
  const [duration, bitrate] = r.out.trim().split(',').map(Number)
  return { duration: duration || 0, bitrate: bitrate || 0 }
}

const exists = (f: string) => stat(f).then(() => true, () => false)

// One clip to its intermediate; returns the file. Reused when the same source, range, fades
// and settings were rendered before.
async function renderClip(c: RenderClip, plan: BuildPlan): Promise<string> {
  const src = await stat(c.path).catch(() => null)
  if (!src) throw new Error('a source file is not where flix says it is')
  const name = (cap: number | null) => createHash('sha1').update(clipKey(c, plan.settings, cap)).update(`${src.size}:${Math.round(src.mtimeMs)}`).digest('hex')
  const cap = c.bitrate > 0 ? c.bitrate : null
  // an earlier run may have kept the constant-quality file or, when that came out above the
  // source's rate, the capped one
  for (const done of [`${WORK}/${name(null)}.mp4`, ...(cap ? [`${WORK}/${name(cap)}.mp4`] : [])]) {
    if (await exists(done)) {
      await utimes(done, new Date(), new Date()).catch(() => {})
      return done
    }
  }
  const render = async (limit: number | null) => {
    const out = `${WORK}/${name(limit)}.mp4`
    const tmp = `${out}.part.mp4`
    const r = await run('ffmpeg', clipArgs(c, plan.settings, tmp, limit))
    if (r.code !== 0) {
      await rm(tmp, { force: true })
      throw new Error(`ffmpeg: ${reason(r.out, [c.path, tmp])}`)
    }
    return { out, tmp }
  }
  const first = await render(null)
  const { bitrate } = await probe(first.tmp)
  if (cap && overSource(bitrate, cap)) {
    await rm(first.tmp, { force: true })
    const second = await render(cap)
    await rename(second.tmp, second.out)
    return second.out
  }
  await rename(first.tmp, first.out)
  return first.out
}

async function build(id: number, plan: BuildPlan) {
  const t0 = Date.now()
  await mkdir(WORK, { recursive: true })
  const files: string[] = []
  for (const [i, c] of plan.clips.entries()) {
    const mine = await api<{ continue: boolean }>('POST', `/reel-builds/${id}/progress`, { progress: i / (plan.clips.length + 1), message: `Clip ${i + 1} of ${plan.clips.length}` })
    if (!mine?.continue) return log(`build ${id}: no longer mine, stopping`)
    files.push(await renderClip(c, plan))
  }
  await api('POST', `/reel-builds/${id}/progress`, { progress: plan.clips.length / (plan.clips.length + 1), message: 'Joining' })
  const list = `${WORK}/build-${id}.txt`
  const joined = `${WORK}/build-${id}.mp4`
  await writeFile(list, concatList(files))
  const j = await run('ffmpeg', joinArgs(list, joined))
  await rm(list, { force: true })
  if (j.code !== 0) {
    await rm(joined, { force: true })
    throw new Error(`join: ${reason(j.out, [...files, joined])}`)
  }
  const { duration } = await probe(joined)
  const size = (await stat(joined)).size
  if (!(duration > 0) || Math.abs(duration - plan.duration) > 1 + plan.clips.length * 0.1) {
    await rm(joined, { force: true })
    throw new Error(`the built file is ${duration.toFixed(1)} s long, the reel ${plan.duration.toFixed(1)} s`)
  }
  const file = `reel-${plan.reelId}-b${id}.mp4`
  await rename(joined, `${DIR}/${file}`)
  await api('POST', `/reel-builds/${id}/done`, { file, durationSec: duration, sizeBytes: size })
  log(`build ${id}: reel ${plan.reelId} done, ${plan.clips.length} clips, ${duration.toFixed(1)} s, ${(size / 1e6).toFixed(0)} MB, in ${Math.round((Date.now() - t0) / 1000)} s`)
}

// Built files no reel owns any more, half-written leftovers and intermediates unused for a month.
async function tidy() {
  const owned = new Set((await api<string[]>('GET', '/reel-builds/files')) ?? [])
  for (const f of await readdir(DIR).catch(() => [] as string[])) {
    if (REEL_FILE.test(f) && !owned.has(f)) {
      await rm(`${DIR}/${f}`, { force: true })
      log('removed a built file no reel owns')
    }
  }
  const old = Date.now() - KEEP_INTERMEDIATES_DAYS * 86_400_000
  for (const f of await readdir(WORK).catch(() => [] as string[])) {
    const info = await stat(`${WORK}/${f}`).catch(() => null)
    if (info && (f.includes('.part.') || /^build-\d+\./.test(f) || info.mtimeMs < old)) await rm(`${WORK}/${f}`, { force: true })
  }
}

async function once(): Promise<boolean> {
  const job = await api<{ id: number; plan: BuildPlan }>('POST', '/reel-builds/claim')
  if (!job) return false
  log(`build ${job.id}: reel ${job.plan.reelId}, ${job.plan.clips.length} clips, ${job.plan.duration.toFixed(1)} s`)
  try {
    await build(job.id, job.plan)
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    log(`build ${job.id}: FAILED ${error}`)
    await api('POST', `/reel-builds/${job.id}/fail`, { error }).catch(() => {})
  }
  return true
}

log(`reel builder: asking flix every ${POLL_MS / 1000} s`)
let ticks = 0
for (;;) {
  try {
    const built = await once()
    // leftovers are cleared at the start and after a build, never while one runs
    if (built || ticks === 0) await tidy()
  } catch (e) {
    log(`waiting: ${e instanceof Error ? e.message : String(e)}`) // flix restarting or unreachable
  }
  ticks++
  if (process.env.ONCE === '1') break
  await new Promise((r) => setTimeout(r, POLL_MS))
}
