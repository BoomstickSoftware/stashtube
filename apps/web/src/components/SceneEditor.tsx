// In-place editing on the scene page: title, tags, and a StashDB lookup's status (markers: Moments.tsx).
import type { SceneDetail } from '@flix/shared'
import { Link } from '@tanstack/react-router'
import { Check, Pencil, Plus, Search, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { useSceneEdits, useTags } from '../lib/api'
import type { Identify } from '../lib/identify'
import { AddFilterButton } from './AddFilter'
import { Chip, Spinner } from './ui'
import { useDebounced } from '../lib/hooks'

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
          className="ml-2 inline-flex align-middle text-muted hover:text-fg touch:-my-3 touch:p-3 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/title:opacity-100"
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

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {scene.tags.map((tag) =>
          editing ? (
            <Chip key={tag.id} tone="exclude" className="!py-0.5 !text-xs !no-underline" onClick={() => update.mutate({ removeTagIds: [tag.id] })}>
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
          {editing ? <Check size={12} /> : <Pencil size={12} />} {editing ? 'Done' : 'Edit categories'}
        </button>
        {update.isPending && <Spinner className="size-3 border" />}
      </div>
      {editing && (
        <div className="mt-2 max-w-sm">
          <label className="flex items-center gap-2 rounded-lg bg-raised px-3 py-1.5">
            <Search size={14} className="text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a category…" className="w-full bg-transparent text-sm outline-none" />
          </label>
          {dq.length >= 2 && (
            <div className="mt-1 max-h-56 overflow-y-auto rounded-lg bg-surface py-1 ring-1 ring-line">
              {found?.items
                .filter((t) => !ids.includes(t.id))
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      update.mutate({ addTagIds: [t.id] })
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

// The scene page's line for an Identify run (started from its "⋯" menu, lib/identify.ts).
export function IdentifyStatus({ identify }: { identify: Identify }) {
  if (identify.status === 'idle') return null
  return (
    <div role="status" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1 text-xs">
      {identify.running ? <Spinner className="size-3 border" /> : <Sparkles size={13} className="text-accent" />}
      {identify.label}
    </div>
  )
}
