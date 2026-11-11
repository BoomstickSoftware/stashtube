// Mark a range of the playing video and add it to a reel (wiki features/reels). In and Out
// start around where playback is; "Now" moves an edge to the playing moment, the steppers
// nudge it, and the picture seeks along so the edge is seen, not guessed.
import { clampClip, MIN_CLIP_SEC, type SceneDetail } from '@flix/shared'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { useState } from 'react'
import { useReelMutations, useReels } from '../lib/api'
import { nowPlaying } from '../lib/nowPlaying'
import { LAST_REEL_KEY, tenths } from '../lib/reels'
import { asNumber, readStored, writeStored } from '../lib/storage'
import { showToast } from '../lib/toast'
import { Sheet } from './Sheet'

const STEPS = [-5, -1, -0.1, 0.1, 1, 5]
const DEFAULT_LENGTH = 15 // seconds a new clip spans until its Out is set

export function EdgeRow({ label, value, onChange, onNow }: { label: string; value: number; onChange: (t: number) => void; onNow?: () => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="w-9 text-sm font-semibold">{label}</span>
        <span className="text-lg tabular-nums">{tenths(value)}</span>
        {onNow && (
          <button type="button" onClick={onNow} className="press-soft ml-auto h-11 rounded-full bg-raised px-4 text-sm font-semibold hover:bg-line">
            Set to now
          </button>
        )}
      </div>
      <div className="grid grid-cols-6 gap-1">
        {STEPS.map((d) => (
          <button key={d} type="button" onClick={() => onChange(value + d)} aria-label={`${label} ${d > 0 ? 'later' : 'earlier'} by ${Math.abs(d)} seconds`} className="press-soft h-11 rounded-lg bg-raised text-sm tabular-nums hover:bg-line">
            {d > 0 ? '+' : '−'}
            {Math.abs(d)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ClipSheet({ scene, onClose }: { scene: SceneDetail; onClose: () => void }) {
  const { data: reels } = useReels()
  const m = useReelMutations()
  const [range, setRange] = useState(() => clampClip(nowPlaying.time(), nowPlaying.time() + DEFAULT_LENGTH, scene.durationSec) ?? { start: 0, end: 0 })
  const last = readStored(LAST_REEL_KEY, asNumber(0))
  const [picked, setPicked] = useState<number | 'new' | null>(null)
  const [name, setName] = useState('')
  const reelId = picked ?? (reels?.some((r) => r.id === last) ? last : (reels?.[0]?.id ?? 'new'))
  const busy = m.create.isPending || m.addClip.isPending

  // moving one edge keeps the other where it is, pushing it only to keep the shortest clip
  const set = (edge: 'start' | 'end', t: number) => {
    const next = edge === 'start' ? clampClip(t, Math.max(range.end, t + MIN_CLIP_SEC), scene.durationSec) : clampClip(Math.min(range.start, t - MIN_CLIP_SEC), t, scene.durationSec)
    if (!next) return
    setRange(next)
    nowPlaying.seek(edge === 'start' ? next.start : next.end)
  }

  const save = async () => {
    try {
      const id = reelId === 'new' ? (await m.create.mutateAsync({ name: name.trim() || 'New reel' })).id : reelId
      await m.addClip.mutateAsync({ id, sceneId: scene.id, ...range })
      writeStored(LAST_REEL_KEY, id)
      showToast(
        `Clip added (${tenths(range.end - range.start)})`,
        <Link to="/reel/$id" params={{ id: String(id) }} className="font-semibold text-accent">
          Open reel
        </Link>,
      )
      onClose()
    } catch {
      /* the failed write shows its own toast */
    }
  }

  return (
    <Sheet title="Add a clip to a reel" onClose={onClose} size="form">
      <div className="flex flex-col gap-4 p-4">
        <EdgeRow label="In" value={range.start} onChange={(t) => set('start', t)} onNow={() => set('start', nowPlaying.time())} />
        <EdgeRow label="Out" value={range.end} onChange={(t) => set('end', t)} onNow={() => set('end', nowPlaying.time())} />
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>
            Length <span className="text-fg tabular-nums">{tenths(range.end - range.start)}</span>
          </span>
          <button type="button" onClick={() => nowPlaying.seek(range.start)} className="press-soft ml-auto h-11 rounded-full bg-raised px-4 text-sm font-semibold text-fg hover:bg-line">
            Play from In
          </button>
        </div>
        <div>
          <div className="mb-1.5 text-sm font-semibold">Reel</div>
          <div className="flex flex-wrap gap-1.5">
            {reels?.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={reelId === r.id}
                onClick={() => setPicked(r.id)}
                className={clsx('press-soft h-11 max-w-full truncate rounded-full px-4 text-sm', reelId === r.id ? 'bg-white font-semibold text-black' : 'bg-raised hover:bg-line')}
              >
                {r.name}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={reelId === 'new'}
              onClick={() => setPicked('new')}
              className={clsx('press-soft h-11 rounded-full px-4 text-sm', reelId === 'new' ? 'bg-white font-semibold text-black' : 'bg-raised hover:bg-line')}
            >
              New reel
            </button>
          </div>
          {reelId === 'new' && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Name of the new reel"
              aria-label="Name of the new reel"
              className="mt-2 h-11 w-full rounded-full bg-raised px-4 text-base outline-none focus:ring-1 focus:ring-accent sm:text-sm"
            />
          )}
        </div>
        <button type="button" disabled={busy || !reels} onClick={save} className="press-soft h-12 rounded-full bg-accent text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50">
          Add clip
        </button>
      </div>
    </Sheet>
  )
}
