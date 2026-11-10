import type { JobStatus } from '@flix/shared'
import { dataCache } from '../cache/data.ts'
import type { IdentifyFieldOptionsInput, Mutation, Query } from '../stash.schema.ts'
import { gql, mutate } from './client.ts'

// Look one scene up on StashDB with the merge rules the NAS docs record for Identify
// (merge title, date, details, studio, performers, tags; create missing; skip ambiguous).
// Stash runs it as a job; this waits for it, so the caller gets the finished result in one
// answer (a single scene takes a few seconds). Past `waitMs` (well under the web client's 65 s)
// the current status goes back and the job is followed here instead, so the caches are dropped
// when it finishes whether or not anyone is still polling (until 2026-10-31 that depended on
// the scene page staying open).
const IDENTIFY_WAIT = 40_000
const JOB_DONE = new Set<JobStatus['status']>(['FINISHED', 'FAILED', 'CANCELLED'])
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref())

export async function identifyScene(id: string, { waitMs = IDENTIFY_WAIT, pollMs = 1000 } = {}): Promise<JobStatus> {
  const jobId = await startIdentify(id)
  const until = Date.now() + waitMs
  for (;;) {
    let j: JobStatus | null | undefined
    try {
      j = await jobStatus(jobId)
    } catch {
      // the job itself holds the lock longer than gql's retries: keep asking until the deadline
      if (Date.now() >= until) break
    }
    if (j === null) return jobGone(jobId)
    if (j && JOB_DONE.has(j.status)) return j
    if (Date.now() >= until) break
    await sleep(pollMs)
  }
  followJob(jobId, pollMs)
  return { id: jobId, status: 'RUNNING', progress: null, error: null }
}

async function startIdentify(id: string): Promise<string> {
  const field = (f: string, createMissing = false): IdentifyFieldOptionsInput => ({ field: f, strategy: 'MERGE', createMissing })
  const d = await mutate<Pick<Mutation, 'metadataIdentify'>>(
    `mutation($i: IdentifyMetadataInput!) { metadataIdentify(input: $i) }`,
    {
      i: {
        sources: [{ source: { stash_box_endpoint: 'https://stashdb.org/graphql' } }],
        sceneIDs: [id],
        options: {
          fieldOptions: [
            field('title'), field('date'), field('details'), field('code'), field('urls'),
            field('studio', true), field('performers', true), field('tags', true),
          ],
          setCoverImage: true,
          includeMalePerformers: true,
          skipMultipleMatches: true,
        },
      },
    },
    [],
  )
  return String(d.metadataIdentify)
}

// Identify can touch any of these, and Stash's own change check would catch it only a poll later.
const jobFinished = () => dataCache.invalidate('scene', 'performer', 'studio', 'tag')
// Stash forgets a job once it has left the queue, so a job it no longer lists is over.
const jobGone = (id: string): JobStatus => {
  jobFinished()
  return { id, status: 'FINISHED', progress: 1, error: null }
}

export async function jobStatus(id: string): Promise<JobStatus | null> {
  const d = await gql<Pick<Query, 'findJob'>>(`query($id: ID!) { findJob(input: { id: $id }) { id status progress error } }`, { id })
  const j = d.findJob
  if (!j) return null
  if (j.status === 'FINISHED') jobFinished()
  return { id: j.id, status: j.status, progress: j.progress ?? null, error: j.error ?? null }
}

// Keeps asking after a job that outlived its request, every `pollMs`, for up to `maxMs`; a read
// that fails (the lock) is retried on the next tick. One follower per job.
const following = new Set<string>()
export function followJob(jobId: string, pollMs = 2000, maxMs = 10 * 60_000) {
  if (following.has(jobId)) return
  following.add(jobId)
  const until = Date.now() + maxMs
  const tick = async () => {
    try {
      const j = await jobStatus(jobId)
      if (j === null) jobGone(jobId)
      if (j === null || JOB_DONE.has(j.status)) return following.delete(jobId)
    } catch (e) {
      console.error('job follow:', (e as Error).message)
    }
    if (Date.now() > until) return following.delete(jobId)
    setTimeout(tick, pollMs).unref()
  }
  setTimeout(tick, pollMs).unref()
}
