// A video's markers as a list you can come back to: frame, time, title and primary tag, each
// editable in place, with delete and undo. Marks come from a hold on the picture, `b`, the gear
// menu or the O counter (title `O`); `[` and `]` jump between them in the player.
import type { Marker, SceneDetail } from '@flix/shared'
import clsx from 'clsx'
import { Bookmark, Droplet, Search, Tag, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSceneEdits, useTags } from '../lib/api'
import { duration } from '../lib/format'
import { useClickOutside, useDebounced } from '../lib/hooks'
import { loadSprites, type SpriteCue } from '../lib/media'
import { guardWrite } from '../lib/privacy'
import { showToast } from '../lib/toast'
import { SpriteThumb } from './SpriteThumb'

export function Moments({ scene, onSeek }: { scene: SceneDetail; onSeek: (t: number) => void }) {
  const [sprites, setSprites] = useState<SpriteCue[]>([])
  useEffect(() => {
    if (scene.vtt && scene.markers.length) loadSprites(scene.vtt).then(setSprites)
  }, [scene.vtt, scene.markers.length])
  if (!scene.markers.length) {
    return (
      <div className="mt-4 text-xs text-muted touch:hidden">
        <span className="touch:hidden">
          Press <kbd className="rounded bg-raised px-1">b</kbd> while watching
        </span>
        <span className="hidden touch:inline">Hold the picture while watching</span> to mark a moment.
      </div>
    )
  }
  return (
    <section className="mt-5">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
        <Bookmark size={15} className="text-star" /> Moments
        <span className="font-normal text-muted">{scene.markers.length}</span>
        <span className="ml-auto font-normal text-muted touch:hidden">[ and ] jump between them</span>
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {scene.markers.map((m) => (
          <MomentRow key={m.id} scene={scene} marker={m} sprites={sprites} onSeek={onSeek} />
        ))}
      </div>
    </section>
  )
}

function MomentRow({ scene, marker, sprites, onSeek }: { scene: SceneDetail; marker: Marker; sprites: SpriteCue[]; onSeek: (t: number) => void }) {
  const { addMarker, updateMarker, deleteMarker } = useSceneEdits(scene.id)
  const isO = marker.title === 'O'
  const [title, setTitle] = useState(marker.title === marker.tag ? '' : marker.title)
  const saveTitle = () => {
    const t = title.trim()
    if (t === (marker.title === marker.tag ? '' : marker.title)) return
    guardWrite(() => updateMarker.mutate({ marker: marker.id, title: t }))
  }
  const remove = () =>
    guardWrite(() => {
      deleteMarker.mutate(marker.id)
      showToast(
        `Removed the moment at ${duration(marker.seconds)}`,
        <button
          onClick={() => addMarker.mutate({ seconds: marker.seconds, title: marker.title === marker.tag ? '' : marker.title, tagId: marker.tagId || undefined })}
          className="rounded-full bg-raised px-3 py-1 text-xs font-semibold hover:bg-line"
        >
          Undo
        </button>,
      )
    })

  return (
    <div className="flex gap-3 rounded-xl bg-surface p-2 ring-1 ring-white/5">
      <button onClick={() => onSeek(marker.seconds)} className="relative block aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-raised sm:w-32" title="Jump here">
        {sprites.length > 0 && <SpriteThumb cues={sprites} t={marker.seconds} width={128} className="absolute top-1/2 left-0 -translate-y-1/2" />}
        <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[11px] font-semibold text-star tabular-nums">{duration(marker.seconds)}</span>
        {isO && (
          <span className="absolute top-1 left-1 rounded-full bg-black/75 p-1 text-sky-400">
            <Droplet size={11} className="fill-sky-400" />
          </span>
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder={isO ? 'O' : 'Untitled'}
          aria-label="Moment title"
          className="w-full rounded-md bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted hover:bg-raised focus:bg-raised"
        />
        <div className="flex items-center gap-1">
          <TagPicker current={marker} onPick={(tagId) => guardWrite(() => updateMarker.mutate({ marker: marker.id, tagId }))} />
          <button onClick={remove} className="ml-auto rounded-md p-1.5 text-muted hover:bg-raised hover:text-red-400" aria-label="Delete moment">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// The marker's primary tag as a pill; tapping it opens a search over Stash's tags.
function TagPicker({ current, onPick }: { current: Marker; onPick: (tagId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 150)
  const { data: found } = useTags({ q: dq || undefined, unblocked: true }, open && dq.length >= 2)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx('inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs', open ? 'bg-accent text-white' : 'bg-raised text-fg/80 hover:bg-line')}
        title="Change the tag"
      >
        <Tag size={11} /> <span className="truncate">{current.tag || 'Tag'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-20 mt-1 w-64 rounded-lg bg-surface p-1.5 shadow-2xl ring-1 ring-line">
          <label className="flex items-center gap-2 rounded-md bg-raised px-2 py-1">
            <Search size={13} className="text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tag…" className="w-full bg-transparent text-sm outline-none" />
          </label>
          {dq.length >= 2 && (
            <div className="mt-1 max-h-48 overflow-y-auto">
              {found?.items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onPick(t.id)
                    setOpen(false)
                    setQ('')
                  }}
                  className={clsx('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/5', t.id === current.tagId && 'text-accent')}
                >
                  {t.name}
                  <span className="ml-auto text-xs text-muted">{t.sceneCount}</span>
                </button>
              ))}
              {found && found.items.length === 0 && <div className="px-2 py-1.5 text-xs text-muted">No tag matches</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
