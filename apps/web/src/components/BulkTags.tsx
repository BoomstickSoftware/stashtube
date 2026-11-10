// The bulk Categories sheet: pick categories to add and to remove, then apply them to the selected
// videos (the select bar) or to every video in a list (a studio's whole library from its page).
import type { SceneQuery, TagCard } from '@flix/shared'
import { Minus, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useBulkTags } from '../lib/api'
import { CategorySearch } from './CategorySearch'
import { Sheet } from './Sheet'
import { Chip, Spinner } from './ui'

type Picked = { tag: Pick<TagCard, 'id' | 'name'>; mode: 'add' | 'remove' }

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
  const [picked, setPicked] = useState<Picked[]>([])
  const [changed, setChanged] = useState<number | null>(null)
  const pick = (tag: Picked['tag'], mode: Picked['mode']) => {
    setPicked((p) => [...p.filter((x) => x.tag.id !== tag.id), { tag, mode }])
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
            <CategorySearch remove skip={(id) => picked.some((p) => p.tag.id === id)} onPick={pick} />
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
