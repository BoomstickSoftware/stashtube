import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearch } from '../lib/api'
import { duration } from '../lib/format'
import { Avatar } from './ui'
import { useClickOutside, useDebounced } from '../lib/hooks'

type Hit =
  | { kind: 'scene'; id: string; label: string; sub: string; image: string | null }
  | { kind: 'performer' | 'studio'; id: string; label: string; sub: string; image: string | null }
  | { kind: 'tag'; id: string; label: string; sub: string; image: null }
  | { kind: 'query'; id: string; label: string; sub: string; image: null }

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
      ...data.tags.map((t) => ({ kind: 'tag' as const, id: t.id, label: t.name, sub: `Tag · ${t.sceneCount} videos`, image: null })),
      ...data.scenes.map((s) => ({ kind: 'scene' as const, id: s.id, label: s.title, sub: [s.studio?.name, duration(s.durationSec)].filter(Boolean).join(' · '), image: s.screenshot })),
    ]
  }, [data, dq])


  const go = (h: Hit | undefined) => {
    setOpen(false)
    input.current?.blur()
    onDone?.()
    if (!h || h.kind === 'query') {
      if (q.trim()) navigate({ to: '/browse', search: { q: q.trim() } })
      return
    }
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
              setActive((a) => Math.min(hits.length - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            } else if (e.key === 'Enter') {
              go(hits[active])
            } else if (e.key === 'Escape') {
              setOpen(false)
              input.current?.blur()
            }
          }}
          placeholder="Search videos, performers, studios, tags"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
        {q && (
          <button onClick={() => setQ('')} className="text-muted hover:text-fg" aria-label="Clear">
            <X size={16} />
          </button>
        )}
        <kbd className="hidden rounded border border-line px-1.5 text-[11px] text-muted md:block">/</kbd>
      </div>
      {open && hits.length > 0 && (
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
                  {h.image && <img src={h.image} alt="" className="size-full object-cover" />}
                </span>
              ) : h.kind === 'performer' ? (
                <Avatar src={h.image} name={h.label} className="size-9 shrink-0 rounded-full" />
              ) : h.kind === 'studio' ? (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white p-1">
                  {h.image ? <img src={h.image} alt="" className="max-h-full max-w-full object-contain" /> : null}
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
        </div>
      )}
    </div>
  )
}
