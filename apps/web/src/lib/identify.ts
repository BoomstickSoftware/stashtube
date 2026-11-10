// Stash's Identify against StashDB for one scene. The server waits for the job and answers with
// its result (the hook refreshes the scene, even if the page is gone by then); a job that outlived
// the wait is polled, and picked up again on the next visit.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { identifyFinished, jobDone, pendingIdentify, useJob, useSceneEdits } from './api'

export interface Identify {
  running: boolean
  // what the action reads: "Identify on StashDB", "Identifying 40%…", the result after
  label: string
  // set once a run ended or is under way, for a status line on the page
  status: 'idle' | 'running' | 'done' | 'failed'
  start: () => void
}

// Owned by the scene page, not the "⋯" sheet that starts it, so the run keeps being polled and
// its progress shows after the sheet closes.
export function useIdentify(id: string): Identify {
  const { identify } = useSceneEdits(id)
  const [jobId, setJobId] = useState<string | null>(() => pendingIdentify.get(id) ?? null)
  const { data: polled } = useJob(jobId)
  const job = identify.data && jobDone(identify.data) ? identify.data : polled
  const qc = useQueryClient()
  useEffect(() => {
    if (jobId && polled?.status === 'FINISHED') identifyFinished(qc, id)
  }, [jobId, polled?.status, qc, id])
  const running = identify.isPending || (!!jobId && !jobDone(polled))
  const status = running ? 'running' : job?.status === 'FINISHED' ? 'done' : job?.status === 'FAILED' ? 'failed' : 'idle'
  return {
    running,
    status,
    label:
      status === 'running'
        ? `Identifying${polled?.progress != null ? ` ${Math.round(polled.progress * 100)}%` : '…'}`
        : status === 'done'
          ? 'Identified (no change means no StashDB match)'
          : status === 'failed'
            ? `Identify failed${job?.error ? `: ${job.error}` : ''}`
            : 'Identify on StashDB',
    start: () => {
      if (!running) identify.mutate(undefined, { onSuccess: (r) => setJobId(jobDone(r) ? null : r.id) })
    },
  }
}
