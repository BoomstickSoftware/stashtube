// A search over Stash's categories with an action per result (+, or + and −). The Cast categories
// are left out: flix files them itself and its sync puts a hand edit back (wiki features/cast).
import type { TagCard } from '@flix/shared'
import { Minus, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useTags } from '../lib/api'
import { useDebounced } from '../lib/hooks'
import { Spinner } from './ui'

const ownedByFlix = (name: string) => name === 'Cast' || name.startsWith('Cast: ')

export function CategorySearch({
  skip,
  onPick,
  remove = false,
}: {
  skip: (id: string) => boolean // already picked
  onPick: (tag: Pick<TagCard, 'id' | 'name'>, mode: 'add' | 'remove') => void
  remove?: boolean // offer − as well as +
}) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 150)
  const { data: found, isFetching } = useTags({ q: dq || undefined, unblocked: true }, dq.length >= 2)
  const pick = (t: Pick<TagCard, 'id' | 'name'>, mode: 'add' | 'remove') => {
    onPick({ id: t.id, name: t.name }, mode)
    setQ('')
  }
  return (
    <>
      <label className="flex items-center gap-2 rounded-lg bg-raised px-3 py-2 focus-within:ring-1 focus-within:ring-accent">
        <Search size={14} className="text-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a category…" className="w-full bg-transparent text-base outline-none sm:text-sm" />
        {isFetching && <Spinner className="size-3 border" />}
      </label>
      {dq.length >= 2 && q.trim().length >= 2 && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg bg-bg/40 py-1 ring-1 ring-line">
          {found?.items
            .filter((t) => !ownedByFlix(t.name) && !skip(t.id))
            .map((t) => (
              <div key={t.id} className="flex items-center gap-1 py-0.5 pr-1 pl-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="mr-1 text-xs text-muted tabular-nums">{t.sceneCount}</span>
                <button onClick={() => pick(t, 'add')} className="rounded-md p-2 text-accent hover:bg-accent/15 touch:p-3.5" aria-label={`Add ${t.name}`}>
                  <Plus size={16} />
                </button>
                {remove && (
                  <button onClick={() => pick(t, 'remove')} className="rounded-md p-2 text-red-400 hover:bg-red-500/15 touch:p-3.5" aria-label={`Remove ${t.name}`}>
                    <Minus size={16} />
                  </button>
                )}
              </div>
            ))}
          {found && !found.items.length && <div className="px-3 py-2 text-sm text-muted">No category by that name</div>}
        </div>
      )}
    </>
  )
}
