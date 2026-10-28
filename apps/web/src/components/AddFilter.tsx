import type { SceneQuery } from '@flix/shared'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { Building2, Check, Plus, Search, Tag, User } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useSearch } from '../lib/api'
import { type FilterKind, filterCount, getBrowseFilters, hasFilter, toggleBrowseFilter, useBrowseFilters } from '../lib/filters'
import { showToast } from '../lib/toast'
import { Avatar, Chip, useClickOutside, useDebounced } from './ui'

// "+" next to a performer, studio or tag: adds it to the Browse filters (all must match) and
// offers to open them. A check shows it is already in; clicking again takes it out.
export function AddFilterButton({
  kind,
  id,
  name,
  className,
  variant = 'icon',
}: {
  kind: FilterKind
  id: string
  name: string
  className?: string
  variant?: 'icon' | 'button' // button: a labelled pill for page headers
}) {
  const filters = useBrowseFilters()
  const on = hasFilter(filters, kind, id)
  return (
    <button
      type="button"
      title={on ? `Remove ${name} from Browse filters` : `Add ${name} to Browse filters`}
      aria-label={on ? `Remove ${name} from Browse filters` : `Add ${name} to Browse filters`}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const added = toggleBrowseFilter(kind, id)
        const n = filterCount(getBrowseFilters())
        showToast(
          added ? `Added ${name} to filters` : `Removed ${name} from filters`,
          n > 0 && (
            <Link
              to="/browse"
              search={getBrowseFilters()}
              className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent/80"
            >
              Browse {n} filter{n === 1 ? '' : 's'}
            </Link>
          ),
        )
      }}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors',
        variant === 'icon' ? 'size-6 ring-1' : 'gap-2 px-4 py-2 text-sm font-medium',
        on
          ? 'bg-accent text-white ring-accent'
          : variant === 'icon'
            ? 'bg-raised text-muted ring-line hover:bg-line hover:text-fg'
            : 'bg-raised text-fg hover:bg-line',
        className,
      )}
    >
      {on ? <Check size={variant === 'icon' ? 13 : 16} strokeWidth={3} /> : <Plus size={variant === 'icon' ? 14 : 16} strokeWidth={2.5} />}
      {variant === 'button' && (on ? 'In filters' : 'Add to filters')}
    </button>
  )
}

type Hit = { kind: FilterKind; id: string; label: string; sub: string; image: string | null }

// Filter-bar search over performers, studios and tags; picking one adds it to this list's filters.
export function FilterSearch({ query, onAdd }: { query: SceneQuery; onAdd: (kind: FilterKind, id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 150)
  const { data } = useSearch(dq)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)

  const hits = useMemo<Hit[]>(() => {
    if (!data || dq.length < 2) return []
    return [
      ...data.performers.map((p) => ({ kind: 'performer' as const, id: p.id, label: p.name, sub: `${p.sceneCount} videos`, image: p.image })),
      ...data.studios.map((s) => ({ kind: 'studio' as const, id: s.id, label: s.name, sub: `${s.sceneCount} videos`, image: s.image })),
      ...data.tags.map((t) => ({ kind: 'tag' as const, id: t.id, label: t.name, sub: `${t.sceneCount} videos`, image: null })),
    ]
  }, [data, dq])
  const icon = { performer: User, studio: Building2, tag: Tag }

  return (
    <div ref={ref} className="relative shrink-0">
      <Chip tone={open ? 'active' : 'default'} onClick={() => setOpen((v) => !v)}>
        <Plus size={14} /> Filter
      </Chip>
      {open && (
        <div className="fixed top-32 right-4 left-4 z-50 overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-line sm:absolute sm:top-10 sm:right-auto sm:left-0 sm:w-80">
          <label className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <Search size={15} className="text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Performer, studio or tag…"
              className="w-full bg-transparent text-base outline-none sm:text-sm"
            />
          </label>
          <div className="max-h-80 overflow-y-auto py-1">
            {dq.length < 2 ? (
              <div className="px-3 py-3 text-xs text-muted">Type at least two letters. Picks stack: every one must match.</div>
            ) : hits.length === 0 ? (
              <div className="px-3 py-3 text-xs text-muted">{data ? 'Nothing found.' : 'Searching…'}</div>
            ) : (
              hits.map((h) => {
                const Icon = icon[h.kind]
                const on = hasFilter(query, h.kind, h.id)
                return (
                  <button
                    key={`${h.kind}${h.id}`}
                    disabled={on}
                    onClick={() => {
                      onAdd(h.kind, h.id)
                      setQ('')
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-raised disabled:opacity-40"
                  >
                    {h.image ? (
                      <Avatar src={h.image} name={h.label} className="size-8 shrink-0 rounded-full" />
                    ) : (
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-raised text-muted">
                        <Icon size={15} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{h.label}</span>
                      <span className="block truncate text-xs text-muted">
                        {h.kind[0]!.toUpperCase() + h.kind.slice(1)} · {h.sub}
                      </span>
                    </span>
                    {on && <Check size={15} className="text-accent" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
