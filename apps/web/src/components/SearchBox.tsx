import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import { Clapperboard, History, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearch } from '../lib/api'
import { duration } from '../lib/format'
import { type Recent, useRecents } from '../lib/recents'
import { Avatar } from './ui'
import { useClickOutside, useDebounced } from '../lib/hooks'
import { sized } from '@flix/shared'

type Hit =
  | { kind: 'scene'; id: string; label: string; sub: string; image: string | null }
  | { kind: 'performer' | 'studio'; id: string; label: string; sub: string; image: string | null }
  | { kind: 'tag'; id: string; label: string; sub: string; image: null }
  | { kind: 'query'; id: string; label: string; sub: string; image: null }
const KIND_LABEL: Record<Recent['kind'], string> = { query: 'Search', scene: 'Video', performer: 'Performer', studio: 'Studio', tag: 'Category' }

export function SearchBox({ className, onDone, autoFocus }: { className?: string; onDone?: () => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const dq = useDebounced(q.trim(), 150)
  const { data } = useSearch(dq)
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  // an empty box offers what was searched for or opened from here before
  const { recents, add, remove, clear } = useRecents()
  const showRecents = !q.trim() && recents.length > 0

  // "/" focuses search from anywhere.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target as HTMLElement).closest('input, textarea, select')) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const hits = useMemo<Hit[]>(() => {
    if (!dq || dq.length < 2 || !data) return []
    return [
      { kind: 'query', id: dq, label: `Search “${dq}”`, sub: 'All videos', image: null },
      ...data.performers.map((p) => ({ kind: 'performer' as const, id: p.id, label: p.name, sub: `Performer · ${p.sceneCount} videos`, image: p.image })),
      ...data.studios.map((s) => ({ kind: 'studio' as const, id: s.id, label: s.name, sub: `Studio · ${s.sceneCount} videos`, image: s.image })),
      ...data.tags.map((t) => ({ kind: 'tag' as const, id: t.id, label: t.name, sub: `Category · ${t.sceneCount} videos`, image: null })),
      ...data.scenes.map((s) => ({ kind: 'scene' as const, id: s.id, label: s.title, sub: [s.studio?.name, duration(s.durationSec)].filter(Boolean).join(' · '), image: s.screenshot })),
    ]
  }, [data, dq])


  const go = (h: Pick<Hit, 'kind' | 'id' | 'label'> | undefined, recent = false) => {
    setOpen(false)
    input.current?.blur()
    onDone?.()
    if (!h || h.kind === 'query') {
      const text = (recent && h ? h.id : q).trim()
      if (!text) return
      add({ kind: 'query', id: text, label: text })
      navigate({ to: '/browse', search: { q: text } })
      return
    }
    add({ kind: h.kind, id: h.id, label: h.label })
    setQ('')
    if (h.kind === 'scene') navigate({ to: '/scene/$id', params: { id: h.id } })
    if (h.kind === 'performer') navigate({ to: '/performer/$id', params: { id: h.id } })
    if (h.kind === 'studio') navigate({ to: '/studio/$id', params: { id: h.id } })
    if (h.kind === 'tag') navigate({ to: '/tag/$id', params: { id: h.id } })
  }

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <div className="flex h-10 items-center gap-2 rounded-full bg-raised px-4 ring-1 ring-white/5 focus-within:bg-surface focus-within:ring-accent/60">
        <Search size={17} className="shrink-0 text-muted" />
        <input
          ref={input}
          autoFocus={autoFocus}
          enterKeyHint="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min((showRecents ? recents.length : hits.length) - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            } else if (e.key === 'Enter') {
              if (showRecents) go(recents[active], true)
              else go(hits[active])
            } else if (e.key === 'Escape') {
              setOpen(false)
              input.current?.blur()
            }
          }}
          placeholder="Search videos, performers, studios, categories"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
        {q && (
          <button onClick={() => setQ('')} className="-m-2 rounded-full p-2 text-muted hover:text-fg touch:-m-3 touch:p-3" aria-label="Clear">
            <X size={16} />
          </button>
        )}
        <kbd className="hidden rounded border border-line px-1.5 text-[11px] text-muted md:block">/</kbd>
      </div>
      {open && showRecents && (
        <div className="absolute inset-x-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-2xl bg-surface py-2 shadow-2xl ring-1 ring-line">
          <div className="flex items-center px-4 pb-1">
            <span className="text-micro font-semibold tracking-wider text-muted uppercase">Recent</span>
            <button onClick={clear} className="-my-1 ml-auto rounded-full px-2 py-1 text-xs text-muted hover:text-fg touch:min-h-9">
              Clear
            </button>
          </div>
          {recents.map((r, i) => (
            <div key={`${r.kind}-${r.id}`} onMouseEnter={() => setActive(i)} className={clsx('flex items-center', i === active && 'bg-white/5')}>
              <button onClick={() => go(r, true)} className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-3 text-left">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-raised text-muted">
                  {r.kind === 'query' ? <History size={16} /> : r.kind === 'scene' ? <Clapperboard size={16} /> : r.kind === 'tag' ? '#' : <Search size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{r.label}</span>
                  <span className="block truncate text-xs text-muted">{KIND_LABEL[r.kind]}</span>
                </span>
              </button>
              <button onClick={() => remove(r)} className="mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-fg touch:size-11" aria-label="Remove from recent searches">
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      {open && !showRecents && hits.length > 0 && (
        <div className="absolute inset-x-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-2xl bg-surface py-2 shadow-2xl ring-1 ring-line">
          {hits.map((h, i) => (
            <button
              key={`${h.kind}-${h.id}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h)}
              className={clsx('flex w-full items-center gap-3 px-3 py-2 text-left', i === active && 'bg-white/5')}
            >
              {h.kind === 'scene' ? (
                <span className="aspect-video w-20 shrink-0 overflow-hidden rounded-md bg-raised">
                  {h.image && <img src={sized(h.image, 320)} alt="" className="size-full object-cover" />}
                </span>
              ) : h.kind === 'performer' ? (
                <Avatar src={h.image} name={h.label} className="size-9 shrink-0 rounded-full" />
              ) : h.kind === 'studio' ? (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-raised p-1 ring-1 ring-white/10">
                  {h.image ? <img src={sized(h.image, 320)} alt="" className="max-h-full max-w-full object-contain" /> : null}
                </div>
              ) : (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-raised text-muted">
                  {h.kind === 'tag' ? '#' : <Search size={16} />}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm">{h.label}</div>
                <div className="truncate text-xs text-muted">{h.sub}</div>
              </div>
            </button>
          ))}
          {hits.length === 1 && <div className="px-4 pt-1 pb-2 text-xs text-muted">No performer, studio, category or title matches. Enter searches every video.</div>}
        </div>
      )}
    </div>
  )
}
