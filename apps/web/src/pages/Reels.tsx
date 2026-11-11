// Reels (wiki features/reels): the list, and one reel's editor with its preview on top.
import { FADE_SEC, type ReelClip, type ReelDetail, type ReelTransition } from '@flix/shared'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Ellipsis, Pencil, Plus, Scissors, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EdgeRow } from '../components/ClipSheet'
import { ReelPlayer, type ReelPlayerHandle } from '../components/ReelPlayer'
import { ActionSheet, RenameSheet, Sheet } from '../components/Sheet'
import { SpriteThumb } from '../components/SpriteThumb'
import { Empty, ErrorBox, IconButton, ListSkeleton, Segmented, UndoButton } from '../components/ui'
import { useReel, useReelMutations, useReels, useReelsEnabled } from '../lib/api'
import { duration as fmt } from '../lib/format'
import { loadSprites, type SpriteCue } from '../lib/media'
import { tenths } from '../lib/reels'
import { showToast } from '../lib/toast'

const TRANSITIONS = [
  { value: 'cut', label: 'Cut' },
  { value: 'fade', label: 'Fade' },
] as const

function Off() {
  return <Empty>Reels are not switched on for this server.</Empty>
}

export function ReelsPage() {
  const on = useReelsEnabled()
  const { data, error, isPending } = useReels(on)
  const m = useReelMutations()
  const navigate = useNavigate()
  const [naming, setNaming] = useState(false)
  if (!on) return <Off />
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-xl font-bold">Reels</h1>
        <button type="button" onClick={() => setNaming(true)} className="press-soft ml-auto inline-flex h-11 items-center gap-1.5 rounded-full bg-raised px-4 text-sm font-semibold hover:bg-line">
          <Plus size={16} /> New reel
        </button>
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : isPending ? (
        <ListSkeleton rows={4} />
      ) : !data.length ? (
        <Empty>No reels yet. Open a video and tap Clip to mark the first range.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((r) => (
            <li key={r.id}>
              <Link to="/reel/$id" params={{ id: String(r.id) }} className="press-soft flex items-center gap-3 rounded-xl p-2 hover:bg-raised">
                <span className="aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-raised">{r.cover && <img src={r.cover} alt="" loading="lazy" className="h-full w-full object-cover" />}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="block text-sm text-muted">
                    {r.clipCount} {r.clipCount === 1 ? 'clip' : 'clips'} · {fmt(r.durationSec)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {naming && (
        <RenameSheet
          title="New reel"
          value=""
          onClose={() => setNaming(false)}
          onSave={(name) => m.create.mutate({ name }, { onSuccess: ({ id }) => navigate({ to: '/reel/$id', params: { id: String(id) } }) })}
        />
      )}
    </div>
  )
}

// A frame of the clip's video at `t`, from Stash's sprite sheet (the nearest of about 80
// frames: a guide, the preview shows the exact one).
function Frame({ vtt, t, fallback, width }: { vtt: string | null; t: number; fallback: string; width: number }) {
  const [cues, setCues] = useState<SpriteCue[]>([])
  useEffect(() => {
    if (vtt) loadSprites(vtt).then(setCues)
  }, [vtt])
  return (
    <span className="block aspect-video shrink-0 overflow-hidden rounded-lg bg-raised" style={{ width }}>
      {cues.length ? <SpriteThumb cues={cues} t={t} width={width} /> : <img src={fallback} alt="" loading="lazy" className="h-full w-full object-cover" />}
    </span>
  )
}

function TrimSheet({ clip, onSave, onPreview, onClose }: { clip: ReelClip; onSave: (r: { start: number; end: number }) => void; onPreview: (edge: 'start' | 'end', r: { start: number; end: number }) => void; onClose: () => void }) {
  const [range, setRange] = useState({ start: clip.start, end: clip.end })
  const dur = clip.source?.durationSec ?? clip.end
  const clamp = (t: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, t)) * 1000) / 1000
  const changed = range.start !== clip.start || range.end !== clip.end
  return (
    <Sheet title="Trim clip" onClose={onClose} size="form">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-center gap-3">
          <Frame vtt={clip.source?.vtt ?? null} t={range.start} fallback={clip.source?.screenshot ?? ''} width={132} />
          <span className="text-sm text-muted tabular-nums">{tenths(range.end - range.start)}</span>
          <Frame vtt={clip.source?.vtt ?? null} t={range.end} fallback={clip.source?.screenshot ?? ''} width={132} />
        </div>
        <EdgeRow label="In" value={range.start} onChange={(t) => setRange((r) => ({ ...r, start: clamp(t, 0, r.end - 1) }))} />
        <EdgeRow label="Out" value={range.end} onChange={(t) => setRange((r) => ({ ...r, end: clamp(t, r.start + 1, dur) }))} />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              if (changed) onSave(range)
              onPreview('start', range)
              onClose()
            }}
            className="press-soft h-12 rounded-full bg-raised text-sm font-semibold hover:bg-line"
          >
            Save and play start
          </button>
          <button
            type="button"
            onClick={() => {
              if (changed) onSave(range)
              onPreview('end', range)
              onClose()
            }}
            className="press-soft h-12 rounded-full bg-accent text-sm font-semibold text-white hover:bg-accent-hover"
          >
            Save and play end
          </button>
        </div>
      </div>
    </Sheet>
  )
}

export function ReelPage() {
  const { id: raw } = useParams({ strict: false }) as { id: string }
  const id = Number(raw)
  const on = useReelsEnabled()
  const { data: reel, error, isPending } = useReel(on && Number.isInteger(id) ? id : undefined)
  if (!on) return <Off />
  if (error) return <ErrorBox error={error} />
  if (isPending || !reel) return <ListSkeleton rows={5} />
  return <ReelEditor reel={reel} />
}

function ReelEditor({ reel }: { reel: ReelDetail }) {
  const m = useReelMutations()
  const navigate = useNavigate()
  const player = useRef<ReelPlayerHandle>(null)
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [trimming, setTrimming] = useState<ReelClip | null>(null)
  const [current, setCurrent] = useState<number | null>(null)
  // a clip being removed is hidden at once and deleted when its Undo has gone
  const [leaving, setLeaving] = useState<number[]>([])
  const shown = useMemo(() => ({ ...reel, clips: reel.clips.filter((c) => !leaving.includes(c.id)) }), [reel, leaving])
  const playable = shown.clips.filter((c) => c.status !== 'missing')
  // where each clip starts on the reel, for "tap a clip to go there"
  const startOf = (clipId: number) => {
    let at = 0
    for (const c of playable) {
      if (c.id === clipId) return at
      at += c.end - c.start
    }
    return null
  }

  const move = (index: number, dir: 1 | -1) => {
    const ids = shown.clips.map((c) => c.id)
    const to = index + dir
    if (to < 0 || to >= ids.length) return
    ;[ids[index], ids[to]] = [ids[to], ids[index]]
    m.reorder.mutate({ id: reel.id, clipIds: ids })
  }

  const remove = (clip: ReelClip) => {
    setLeaving((l) => [...l, clip.id])
    const timer = window.setTimeout(() => m.removeClip.mutate({ id: reel.id, clipId: clip.id }, { onSettled: () => setLeaving((l) => l.filter((x) => x !== clip.id)) }), 6000)
    showToast(
      'Clip removed',
      <UndoButton
        onClick={() => {
          clearTimeout(timer)
          setLeaving((l) => l.filter((x) => x !== clip.id))
        }}
      />,
      6000,
    )
  }

  const setJoin = (clip: ReelClip, t: ReelTransition) => m.updateClip.mutate({ id: reel.id, clipId: clip.id, transition: t === reel.transition ? null : t })

  const total = playable.reduce((n, c) => n + (c.end - c.start), 0)

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{reel.name}</h1>
          <p className="text-sm text-muted">
            {shown.clips.length} {shown.clips.length === 1 ? 'clip' : 'clips'} · {fmt(total)}
          </p>
        </div>
        <IconButton label="Reel options" onClick={() => setMenu(true)} className="ml-auto">
          <Ellipsis size={20} />
        </IconButton>
      </div>

      <ReelPlayer ref={player} reel={shown} onSegment={setCurrent} />

      <div className="my-4 flex items-center gap-3">
        <span className="text-sm text-muted">Between clips</span>
        <Segmented label="Transition between clips" value={reel.transition} onChange={(transition) => m.update.mutate({ id: reel.id, transition })} options={TRANSITIONS} />
        {reel.transition === 'fade' && <span className="text-xs text-muted">{FADE_SEC * 2}s through black</span>}
      </div>

      {!shown.clips.length ? (
        <Empty>No clips yet. Open a video, tap Clip, and add a range to this reel.</Empty>
      ) : (
        <ol className="flex flex-col">
          {shown.clips.map((c, i) => {
            const join = c.transition ?? reel.transition
            return (
              <li key={c.id}>
                <div className={clsx('flex items-center gap-3 rounded-xl p-2', current === c.id && 'bg-raised')}>
                  <button
                    type="button"
                    className="press-soft flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => {
                      const at = startOf(c.id)
                      if (at != null) player.current?.seek(at)
                    }}
                  >
                    <Frame vtt={c.source?.vtt ?? null} t={c.start} fallback={c.source?.screenshot ?? ''} width={112} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{c.source?.title ?? 'Video no longer in the library'}</span>
                      <span className="block text-sm text-muted tabular-nums">
                        {tenths(c.start)} – {tenths(c.end)} · {tenths(c.end - c.start)}
                      </span>
                      {c.status === 'shifted' && <span className="block text-xs text-amber-400">The video file changed: check this range</span>}
                      {c.status === 'missing' && <span className="block text-xs text-danger">Skipped when the reel plays</span>}
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-col">
                    <IconButton label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp size={18} />
                    </IconButton>
                    <IconButton label="Move later" disabled={i === shown.clips.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown size={18} />
                    </IconButton>
                  </div>
                  <div className="flex shrink-0 flex-col">
                    <IconButton label="Trim" disabled={c.status === 'missing'} onClick={() => setTrimming(c)}>
                      <Scissors size={18} />
                    </IconButton>
                    <IconButton label="Remove clip" tone="danger" onClick={() => remove(c)}>
                      <Trash2 size={18} />
                    </IconButton>
                  </div>
                </div>
                {i < shown.clips.length - 1 && (
                  <div className="flex items-center gap-2 py-1 pl-4">
                    <span className="h-6 w-px bg-line" />
                    <Segmented label={`Transition after clip ${i + 1}`} value={join} onChange={(t) => setJoin(c, t)} options={TRANSITIONS} />
                    {c.transition == null && <span className="text-xs text-muted">reel default</span>}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {menu && (
        <ActionSheet
          title={reel.name}
          onClose={() => setMenu(false)}
          actions={[
            { icon: <Pencil size={18} />, label: 'Rename', run: () => setRenaming(true) },
            {
              icon: <Trash2 size={18} />,
              label: 'Delete reel',
              hint: 'The videos themselves are not touched',
              tone: 'danger',
              run: () => {
                const undo = m.removeLater(reel.id)
                navigate({ to: '/reels' })
                showToast(`Deleted "${reel.name}"`, <UndoButton onClick={undo} />, 6000)
              },
            },
          ]}
        />
      )}
      {renaming && <RenameSheet title="Rename reel" value={reel.name} onClose={() => setRenaming(false)} onSave={(name) => m.update.mutate({ id: reel.id, name })} />}
      {trimming && (
        <TrimSheet
          clip={trimming}
          onClose={() => setTrimming(null)}
          onSave={(r) => m.updateClip.mutate({ id: reel.id, clipId: trimming.id, ...r })}
          onPreview={(edge, r) => {
            // inside the tap, so the player may start: the clip's start, or its last seconds.
            // The saved range reshapes the reel a moment later; the player keeps its place.
            const at = startOf(trimming.id)
            if (at == null) return
            player.current?.seek(edge === 'start' ? at : at + Math.max(0, r.end - r.start - 3))
            player.current?.play()
          }}
        />
      )}
    </div>
  )
}
