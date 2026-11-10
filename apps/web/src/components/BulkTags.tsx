// The bulk Categories sheet: pick categories to add and to remove, then apply them to the selected
// videos (the select bar) or to every video in a list (a studio's whole library from its page).
import type { SceneQuery, TagCard } from '@flix/shared'
import { Minus, Plus, Search, X } from 'lucide-react'
import { useState } from 'react'
import { useBulkTags, useTags } from '../lib/api'
import { useDebounced } from '../lib/hooks'
import { Sheet } from './Sheet'
import { Chip, Spinner } from './ui'

type Picked = { tag: Pick<TagCard, 'id' | 'name'>; mode: 'add' | 'remove' }

// flix files the Cast categories itself and puts a hand edit back on its next sync (wiki features/cast)
const ownedByFlix = (name: string) => name === 'Cast' || name.startsWith('Cast: ')

export function BulkTagsSheet({
  target,
  count,
  onClose,
  onDone,
}: {
  target: { sceneIds: string[] } | { query: SceneQuery }
  count: number // how many videos it will touch, for the button
  onClose: () => void
  onDone?: (changed: number) => void
}) {
  const bulk = useBulkTags()
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 150)
  const { data: found, isFetching } = useTags({ q: dq || undefined, unblocked: true }, dq.length >= 2)
  const [picked, setPicked] = useState<Picked[]>([])
  const [changed, setChanged] = useState<number | null>(null)
  const pick = (tag: Picked['tag'], mode: Picked['mode']) => {
    setPicked((p) => [...p.filter((x) => x.tag.id !== tag.id), { tag, mode }])
    setQ('')
  }
  const add = picked.filter((p) => p.mode === 'add').map((p) => p.tag.id)
  const remove = picked.filter((p) => p.mode === 'remove').map((p) => p.tag.id)
  const videos = `${count.toLocaleString()} video${count === 1 ? '' : 's'}`

  return (
    <Sheet title={`Categories · ${videos}`} onClose={onClose}>
      <div className="p-4">
        {changed !== null ? (
          <div className="flex flex-col items-center gap-3 py-4 text-sm">
            <span>Updated {changed.toLocaleString()} video{changed === 1 ? '' : 's'}</span>
            <button onClick={onClose} className="rounded-lg bg-raised px-4 py-2 font-semibold hover:bg-line touch:py-3">
              Done
            </button>
          </div>
        ) : (
          <>
            <label className="flex items-center gap-2 rounded-lg bg-raised px-3 py-2 focus-within:ring-1 focus-within:ring-accent">
              <Search size={14} className="text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a category…"
                className="w-full bg-transparent text-base outline-none sm:text-sm"
              />
              {isFetching && <Spinner className="size-3 border" />}
            </label>
            {dq.length >= 2 && q.trim().length >= 2 && (
              <div className="mt-1 max-h-56 overflow-y-auto rounded-lg bg-bg/40 py-1 ring-1 ring-line">
                {found?.items
                  .filter((t) => !ownedByFlix(t.name) && !picked.some((p) => p.tag.id === t.id))
                  .map((t) => (
                    <div key={t.id} className="flex items-center gap-1 py-0.5 pr-1 pl-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      <span className="mr-1 text-xs text-muted tabular-nums">{t.sceneCount}</span>
                      <button onClick={() => pick(t, 'add')} className="rounded-md p-2 text-accent hover:bg-accent/15 touch:p-3.5" aria-label={`Add ${t.name}`}>
                        <Plus size={16} />
                      </button>
                      <button onClick={() => pick(t, 'remove')} className="rounded-md p-2 text-red-400 hover:bg-red-500/15 touch:p-3.5" aria-label={`Remove ${t.name}`}>
                        <Minus size={16} />
                      </button>
                    </div>
                  ))}
                {found && !found.items.length && <div className="px-3 py-2 text-sm text-muted">No category by that name</div>}
              </div>
            )}
            {picked.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {picked.map((p) => (
                  <Chip key={p.tag.id} tone={p.mode === 'add' ? 'include' : 'exclude'} onClick={() => setPicked((x) => x.filter((y) => y.tag.id !== p.tag.id))}>
                    {p.mode === 'add' ? <Plus size={12} /> : <Minus size={12} />} {p.tag.name} <X size={12} />
                  </Chip>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted">Search a category, then + to add it to every video or − to take it off. Videos keep their other categories.</p>
            )}
            <button
              disabled={!picked.length || bulk.isPending}
              onClick={() =>
                bulk.mutate(
                  { ...target, add, remove },
                  {
                    onSuccess: (r) => {
                      setChanged(r.scenes)
                      onDone?.(r.scenes)
                    },
                  },
                )
              }
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold hover:bg-accent-hover disabled:bg-raised disabled:text-muted touch:py-3"
            >
              {bulk.isPending && <Spinner className="size-3 border" />} Apply to {videos}
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}
