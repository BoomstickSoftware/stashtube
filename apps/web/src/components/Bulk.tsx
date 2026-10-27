import { Heart, ListPlus, Plus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useBulk, usePlaylists } from '../lib/api'
import { useClickOutside } from './ui'

// Bottom bar while videos are selected in a grid.
export function BulkBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  const bulk = useBulk()
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
      <div className="flex items-center gap-1 rounded-full bg-surface py-1.5 pr-1.5 pl-5 shadow-2xl ring-1 ring-line">
        <span className="mr-2 text-sm font-semibold tabular-nums">{done ?? `${ids.length} selected`}</span>
        <button
          onClick={() => bulk.favorite.mutate(ids, { onSuccess: () => finish('Added to Favorites') })}
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm hover:bg-raised"
        >
          <Heart size={16} /> Favorite
        </button>
        <div ref={ref} className="relative">
          <button onClick={() => setMenu((v) => !v)} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm hover:bg-raised">
            <ListPlus size={16} /> Add to playlist
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
        <button onClick={onClear} className="rounded-full p-2 text-muted hover:bg-raised hover:text-fg" aria-label="Clear selection">
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
