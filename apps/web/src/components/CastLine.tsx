import type { CastCount, SceneDetail } from '@flix/shared'
import clsx from 'clsx'
import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { useSetSceneCast } from '../lib/api'
import { CAST_LETTERS, CAST_WORDS, castText } from '../lib/cast'
import { Button } from './ui'

// The scene page's Cast line (wiki features/cast): who is in the video, as flix files it, and an
// editor for when Stash's performers miss someone. Saving sets an override the Cast sync files the
// video by; "Use performers" drops it.

const WORDS = CAST_WORDS
const LETTERS = CAST_LETTERS

export function CastLine({ scene }: { scene: SceneDetail }) {
  const { cast } = scene
  const save = useSetSceneCast()
  const [draft, setDraft] = useState<CastCount | null>(null)
  const start = () => setDraft(cast.counts ?? cast.performers ?? { F: 0, M: 0, X: 0 })
  const bump = (l: (typeof LETTERS)[number], d: number) => setDraft((n) => n && { ...n, [l]: Math.max(0, Math.min(20, n[l] + d)) })
  const done = () => setDraft(null)

  if (!draft)
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span>
          Cast: <span className="text-fg/90">{castText(cast.counts)}</span>
          {cast.override && ' · set by hand'}
        </span>
        <button onClick={start} className="font-semibold hover:text-fg touch:min-h-11 touch:px-2">
          Edit
        </button>
      </div>
    )

  const total = draft.F + draft.M + draft.X
  return (
    <div className="mt-3 rounded-xl bg-raised/60 p-3">
      <p className="text-xs text-muted">
        Who is in this video? Use this when Stash’s performers miss someone; it decides the video’s Cast categories.
        {cast.performers && ` Performers say: ${castText(cast.performers)}.`}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {LETTERS.map((l) => (
          <div key={l} className="flex items-center gap-1.5">
            <span className="w-14 text-sm capitalize">{WORDS[l][1]}</span>
            <button
              onClick={() => bump(l, -1)}
              disabled={!draft[l]}
              aria-label={`One fewer ${WORDS[l][0]}`}
              className="grid size-8 place-items-center rounded-full bg-raised hover:bg-line disabled:opacity-40 touch:size-11"
            >
              <Minus size={15} />
            </button>
            <span className={clsx('w-6 text-center text-sm font-semibold tabular-nums', !draft[l] && 'text-muted')}>{draft[l]}</span>
            <button
              onClick={() => bump(l, 1)}
              aria-label={`One more ${WORDS[l][0]}`}
              className="grid size-8 place-items-center rounded-full bg-raised hover:bg-line touch:size-11"
            >
              <Plus size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="solid" disabled={!total || save.isPending} onClick={() => save.mutate({ id: scene.id, cast: draft }, { onSuccess: done })}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        {cast.override && (
          <Button disabled={save.isPending} onClick={() => save.mutate({ id: scene.id, cast: null }, { onSuccess: done })}>
            Use performers
          </Button>
        )}
        <Button onClick={done}>Cancel</Button>
      </div>
    </div>
  )
}
