import { Minus, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useTags } from '../lib/api'
import { useDebounced } from './ui'

// Searchable tag list with include / exclude actions per row.
export function TagPicker({
  included,
  excluded,
  onInclude,
  onExclude,
  autoFocus,
}: {
  included: string[]
  excluded: string[]
  onInclude: (id: string) => void
  onExclude: (id: string) => void
  autoFocus?: boolean
}) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 150)
  const { data } = useTags({ q: dq || undefined, sort: dq ? undefined : 'scenes_count' })
  const tags = data?.items.slice(0, dq ? 30 : 60) ?? []
  return (
    <div className="w-80 max-w-[calc(100vw-2rem)]">
      <label className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Search size={16} className="text-muted" />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a tag…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </label>
      <div className="max-h-80 overflow-y-auto py-1">
        {tags.map((t) => {
          const inc = included.includes(t.id)
          const exc = excluded.includes(t.id)
          return (
            <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5">
              <span className={inc ? 'text-accent' : exc ? 'text-red-400 line-through' : ''}>{t.name}</span>
              <span className="text-xs text-muted">{t.sceneCount}</span>
              <span className="ml-auto flex gap-1">
                <button
                  title="Must have"
                  onClick={() => onInclude(t.id)}
                  className={`rounded-full p-1 ${inc ? 'bg-accent text-white' : 'text-muted hover:bg-white/10 hover:text-fg'}`}
                >
                  <Plus size={14} />
                </button>
                <button
                  title="Must not have"
                  onClick={() => onExclude(t.id)}
                  className={`rounded-full p-1 ${exc ? 'bg-red-500 text-white' : 'text-muted hover:bg-white/10 hover:text-fg'}`}
                >
                  <Minus size={14} />
                </button>
              </span>
            </div>
          )
        })}
        {!tags.length && <div className="px-3 py-6 text-center text-sm text-muted">No tags</div>}
      </div>
    </div>
  )
}
