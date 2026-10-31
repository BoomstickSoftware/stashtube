// Fills the asset cache with every scene's screenshot, preview, scrubber thumbnails and
// sprite, and every performer and studio image, so nothing loads cold from Stash. Runs
// nightly (WARM_AT_UTC) and on demand from Settings; what is already fresh is skipped.
import type { WarmStatus } from '@flix/shared'
import { readFile } from 'node:fs/promises'
import { config } from './config.ts'
import { assetCache } from './media.ts'
import { allArtwork } from './stash.ts'

const PARALLEL = 4 // Stash's disks are spinning RAID; keep it gentle

let status: WarmStatus = {
  running: false,
  total: 0,
  done: 0,
  fetched: 0,
  failed: 0,
  startedAt: null,
  finishedAt: null,
  nextRun: null,
}

export const warmStatus = (): WarmStatus => status

export function startWarm(): boolean {
  if (status.running) return false
  void run().catch((e) => {
    console.error('warming assets:', (e as Error).message)
    status = {
      ...status,
      running: false,
      finishedAt: new Date().toISOString(),
    }
  })
  return true
}

async function run() {
  status = {
    ...status,
    running: true,
    total: 0,
    done: 0,
    fetched: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  }
  const paths = (await allArtwork()).map(local)
  status.total = paths.length
  const queue = [...paths]
  const one = async (path: string) => {
    try {
      const got = await assetCache.warm(path)
      if (got?.fetched) status.fetched++
      // the resized copies cards ask for (desktop grids pick 640, a 3x phone 960; avatars 320)
      if (got) for (const w of RESIZED.find(([re]) => re.test(path))?.[1] ?? []) await assetCache.warmResized(path, w)
      // The scrubber's VTT names its sprite sheet relative to itself.
      if (got && path.includes('/vtt/')) {
        const sprite = (await readFile(got.file, 'utf8')).match(/^([^\s#/]+\.jpg)#/m)?.[1]
        if (sprite) {
          status.total++
          queue.push(path.replace(/[^/]*$/, sprite))
        }
      }
    } catch {
      status.failed++
    }
    status.done++
  }
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let p = queue.shift(); p; p = queue.shift()) await one(p)
    }),
  )
  status = { ...status, running: false, finishedAt: new Date().toISOString() }
  console.log(`warmed assets: ${status.done} checked, ${status.fetched} fetched, ${status.failed} failed`)
}

const RESIZED: [RegExp, number[]][] = [
  [/\/screenshot\?/, [640, 960]],
  [/\/image\?/, [320]],
]

// "/media/stash/scene/1/screenshot?t=…" -> "/scene/1/screenshot?t=…", the asset cache's key
const local = (url: string) => url.replace(/^\/media\/stash/, '')

// Once a day at WARM_AT_UTC (hour, may be fractional); unset or negative turns it off.
export function scheduleWarm() {
  const at = config.cache.warmAtUtc
  if (at === null) return
  const next = new Date()
  next.setUTCHours(Math.floor(at), Math.round((at % 1) * 60), 0, 0)
  if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1)
  status.nextRun = next.toISOString()
  setTimeout(() => {
    startWarm()
    scheduleWarm()
  }, next.getTime() - Date.now()).unref()
}
