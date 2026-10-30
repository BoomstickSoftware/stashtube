// In-place editing on the scene page: title, tags, markers, and a StashDB lookup.
import type { Marker, SceneDetail } from '@flix/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Bookmark, Check, Pencil, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useJob, useSceneEdits, useTags } from '../lib/api'
import { duration } from '../lib/format'
import { AddFilterButton } from './AddFilter'
import { Chip, Spinner } from './ui'
import { useDebounced } from '../lib/hooks'
import { loadSprites, type SpriteCue } from '../lib/media'
import { SpriteThumb } from './SpriteThumb'

export function EditableTitle({ scene }: { scene: SceneDetail }) {
  const { update } = useSceneEdits(scene.id)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(scene.title)
  if (!editing) {
    return (
      <h1 className="group/title text-xl leading-tight font-bold sm:text-2xl">
        {scene.title}
        <button
          onClick={() => {
            setTitle(scene.title)
            setEditing(true)
          }}
          className="ml-2 inline-flex align-middle text-muted hover:text-fg [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/title:opacity-100"
          aria-label="Edit title"
        >
          <Pencil size={16} />
        </button>
      </h1>
    )
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        update.mutate({ title: title.trim() }, { onSuccess: () => setEditing(false) })
      }}
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        className="min-w-0 flex-1 rounded-lg bg-raised px-3 py-1.5 text-xl font-bold outline-none focus:ring-1 focus:ring-accent"
      />
      <button type="submit" className="rounded-lg bg-accent px-3 hover:bg-accent-hover" aria-label="Save title">
        <Check size={18} />
      </button>
    </form>
  )
}

export function TagEditor({ scene }: { scene: SceneDetail }) {
  const { update } = useSceneEdits(scene.id)
  const [editing, setEditing] = useState(false)
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 150)
  const { data: found } = useTags({ q: dq || undefined, unblocked: true }, editing && dq.length >= 2)
  const ids = scene.tags.map((t) => t.id)
  const save = (tagIds: string[]) => update.mutate({ tagIds })

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {scene.tags.map((tag) =>
          editing ? (
            <Chip key={tag.id} tone="exclude" className="!py-0.5 !text-xs !no-underline" onClick={() => save(ids.filter((x) => x !== tag.id))}>
              {tag.name} <X size={12} />
            </Chip>
          ) : (
            <span key={tag.id} className="inline-flex items-center rounded-full bg-raised text-xs text-fg/90">
              <Link to="/tag/$id" params={{ id: tag.id }} className="rounded-l-full py-0.5 pr-1 pl-3 hover:text-accent">
                {tag.name}
              </Link>
              <AddFilterButton kind="tag" id={tag.id} name={tag.name} className="mr-0.5 !size-5 !bg-transparent !ring-0" />
            </span>
          ),
        )}
        <button
          onClick={() => setEditing((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted hover:bg-raised hover:text-fg"
        >
          {editing ? <Check size={12} /> : <Pencil size={12} />} {editing ? 'Done' : 'Edit tags'}
        </button>
        {update.isPending && <Spinner className="size-3 border" />}
      </div>
      {editing && (
        <div className="mt-2 max-w-sm">
          <label className="flex items-center gap-2 rounded-lg bg-raised px-3 py-1.5">
            <Search size={14} className="text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a tag…" className="w-full bg-transparent text-sm outline-none" />
          </label>
          {dq.length >= 2 && (
            <div className="mt-1 max-h-56 overflow-y-auto rounded-lg bg-surface py-1 ring-1 ring-line">
              {found?.items
                .filter((t) => !ids.includes(t.id))
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      save([...ids, t.id])
                      setQ('')
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-white/5"
                  >
                    <Plus size={13} className="text-accent" /> {t.name}
                    <span className="ml-auto text-xs text-muted">{t.sceneCount}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Runs Stash's Identify against StashDB for this one scene and refreshes when it finishes.
export function IdentifyButton({ scene }: { scene: SceneDetail }) {
  const { identify } = useSceneEdits(scene.id)
  const [jobId, setJobId] = useState<string | null>(null)
  const { data: job } = useJob(jobId)
  const qc = useQueryClient()
  const finished = job && ['FINISHED', 'FAILED', 'CANCELLED'].includes(job.status)
  useEffect(() => {
    if (job?.status === 'FINISHED') {
      qc.invalidateQueries({ queryKey: ['scene', scene.id] })
      qc.invalidateQueries({ queryKey: ['scenes'] })
      qc.invalidateQueries({ queryKey: ['home'] })
    }
  }, [job?.status, qc, scene.id])
  const running = identify.isPending || (jobId && !finished)
  return (
    <button
      disabled={!!running}
      onClick={() => identify.mutate(undefined, { onSuccess: (r) => setJobId(r.jobId) })}
      title="Look this video up on StashDB and fill in title, date, studio, performers and tags"
      className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1 text-xs hover:bg-line disabled:opacity-60"
    >
      {running ? <Spinner className="size-3 border" /> : <Sparkles size={13} className="text-accent" />}
      {running
        ? `Identifying${job?.progress != null ? ` ${Math.round(job.progress * 100)}%` : '…'}`
        : job?.status === 'FINISHED'
          ? 'Identified (no change means no StashDB match)'
          : job?.status === 'FAILED'
            ? `Identify failed${job.error ? `: ${job.error}` : ''}`
            : 'Identify on StashDB'}
    </button>
  )
}

// Markers as chapters, each with its frame from the scrubber sprites: jump, rename, delete.
// Press "b" in the player to add one; an O-counter press adds one too.
export function Chapters({ scene, onSeek }: { scene: SceneDetail; onSeek: (t: number) => void }) {
  const [sprites, setSprites] = useState<SpriteCue[]>([])
  useEffect(() => {
    if (scene.vtt && scene.markers.length) loadSprites(scene.vtt).then(setSprites)
  }, [scene.vtt, scene.markers.length])
  if (!scene.markers.length) {
    return (
      <div className="mt-4 text-xs text-muted">
        <span className="touch:hidden">
          Press <kbd className="rounded bg-raised px-1">b</kbd> while watching
        </span>
        <span className="hidden touch:inline">Hold the picture while watching</span> to mark a moment.
      </div>
    )
  }
  return (
    <div className="mt-5">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
        <Bookmark size={15} className="text-star" /> Markers
        <span className="font-normal text-muted">[ and ] jump between them</span>
      </h3>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {scene.markers.map((m) => (
          <ChapterChip key={m.id} scene={scene} marker={m} sprites={sprites} onSeek={onSeek} />
        ))}
      </div>
    </div>
  )
}

function ChapterChip({ scene, marker, sprites, onSeek }: { scene: SceneDetail; marker: Marker; sprites: SpriteCue[]; onSeek: (t: number) => void }) {
  const { renameMarker, deleteMarker } = useSceneEdits(scene.id)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(marker.title)
  return (
    <div className="group w-40 shrink-0 rounded-xl bg-surface p-1.5 ring-1 ring-white/5">
      <button onClick={() => onSeek(marker.seconds)} className="relative block aspect-video w-full overflow-hidden rounded-lg bg-raised" title="Jump here">
        {sprites.length > 0 && <SpriteThumb cues={sprites} t={marker.seconds} width={148} className="absolute top-1/2 left-0 -translate-y-1/2" />}
        <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[11px] font-semibold text-star tabular-nums">{duration(marker.seconds)}</span>
      </button>
      <div className="mt-1 flex items-center">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            renameMarker.mutate({ marker: marker.id, title: title.trim() }, { onSuccess: () => setEditing(false) })
          }}
        >
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setEditing(false)}
            className="w-full rounded bg-raised px-1.5 py-0.5 text-xs outline-none"
          />
        </form>
      ) : (
        <button onClick={() => setEditing(true)} className="min-w-0 flex-1 truncate px-1 text-left text-xs" title="Rename">
          {marker.title || 'Untitled'}
        </button>
      )}
      <button onClick={() => deleteMarker.mutate(marker.id)} className="rounded p-1 text-muted hover:text-red-400 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100" aria-label="Delete marker">
        <Trash2 size={12} />
      </button>
      </div>
    </div>
  )
}
