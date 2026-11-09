import { Heart, ListPlus, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useBulk, useFeatures, usePlaylists } from '../lib/api'
import { DeleteScenesDialog } from './DeleteScenes'
import { useClickOutside } from '../lib/hooks'

// A page's own action on the selected videos, shown first in the bar; `done` is the message after.
export interface BulkAction {
  label: string
  icon: ReactNode
  run: (ids: string[]) => Promise<unknown>
  done: string
}

// Bottom bar while videos are selected in a grid.
export function BulkBar({
  ids,
  infoOf,
  onClear,
  actions = [],
}: {
  ids: string[]
  infoOf: (id: string) => { title: string; size: number }
  onClear: () => void
  actions?: BulkAction[]
}) {
  const bulk = useBulk()
  const { data: features } = useFeatures()
  const [deleting, setDeleting] = useState(false)
  const { data: playlists } = usePlaylists()
  const [menu, setMenu] = useState(false)
  const [name, setName] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setMenu(false), menu)
  const finish = (msg: string) => {
    setMenu(false)
    setDone(msg)
    setTimeout(() => {
      setDone(null)
      onClear()
    }, 1200)
  }
  if (!ids.length) return null
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6">
      <div className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-surface py-1.5 pr-1.5 pl-5 shadow-2xl ring-1 ring-line">
        <span className="mr-2 text-sm font-semibold whitespace-nowrap tabular-nums">{done ?? `${ids.length} selected`}</span>
        {actions.map((a) => (
          <button key={a.label} onClick={() => a.run(ids).then(() => finish(a.done))} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm whitespace-nowrap hover:bg-raised touch:py-3">
            {a.icon} {a.label}
          </button>
        ))}
        <button
          onClick={() => bulk.favorite.mutate(ids, { onSuccess: () => finish('Added to Favorites') })}
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm whitespace-nowrap hover:bg-raised touch:py-3"
          aria-label="Favorite"
        >
          <Heart size={16} /> <span className="max-sm:hidden">Favorite</span>
        </button>
        <div ref={ref} className="relative">
          <button onClick={() => setMenu((v) => !v)} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm whitespace-nowrap hover:bg-raised touch:py-3" aria-label="Add to playlist">
            <ListPlus size={16} /> <span className="max-sm:hidden">Add to playlist</span>
          </button>
          {menu && (
            <div className="absolute right-0 bottom-12 w-72 overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-line">
              <div className="max-h-64 overflow-y-auto py-1">
                {playlists?.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => bulk.toPlaylist.mutate({ id: p.id, sceneIds: ids }, { onSuccess: () => finish(`Added to ${p.name}`) })}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/5"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto text-xs text-muted">{p.itemCount}</span>
                  </button>
                ))}
              </div>
              <form
                className="flex items-center gap-2 border-t border-line p-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (name.trim())
                    bulk.newPlaylist.mutate({ name: name.trim(), sceneIds: ids }, { onSuccess: () => finish(`Created ${name.trim()}`) })
                }}
              >
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="New playlist"
                  className="min-w-0 flex-1 rounded-lg bg-raised px-3 py-2 text-sm outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
                />
                <button type="submit" className="rounded-lg bg-accent p-2 hover:bg-accent-hover" aria-label="Create playlist">
                  <Plus size={16} />
                </button>
              </form>
            </div>
          )}
        </div>
        {features?.deleteScenes && (
          <button onClick={() => setDeleting(true)} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm whitespace-nowrap text-red-400 hover:bg-red-500/15 touch:py-3" aria-label="Delete">
            <Trash2 size={16} /> <span className="max-sm:hidden">Delete</span>
          </button>
        )}
        <button onClick={onClear} className="rounded-full p-2 text-muted hover:bg-raised hover:text-fg" aria-label="Clear selection">
          <X size={18} />
        </button>
      </div>
      {deleting && (
        <DeleteScenesDialog scenes={ids.map((id) => ({ id, ...infoOf(id) }))} onClose={() => setDeleting(false)} onDeleted={onClear} />
      )}
    </div>
  )
}
