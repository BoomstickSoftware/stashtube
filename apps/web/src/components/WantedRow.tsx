import type { WantedScene } from '@flix/shared'
import clsx from 'clsx'
import { Check, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { useGetScene, useWanted } from '../lib/api'
import { Button } from './ui'
import { date as fmtDate } from '../lib/format'
import { showToast } from '../lib/toast'

// A shelf of scenes Whisparr knows about but has not downloaded. Each card has one action,
// Get, which asks the server to fetch that one scene; nothing here acts on a whole performer
// or studio (the library policy).
export function WantedRow({ title, items, hint, more }: { title: ReactNode; items: WantedScene[]; hint?: string; more?: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  const page = (dir: number) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' })
  }
  if (!items.length) return null
  return (
    <section className="group/row">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
        {hint && <span className="hidden text-sm text-muted sm:inline">{hint}</span>}
      </div>
      <div className="relative -mx-4 sm:-mx-6">
        <div ref={scroller} className="no-scrollbar flex snap-x gap-4 overflow-x-auto scroll-smooth px-4 pb-2 sm:px-6">
          {items.map((w) => (
            <WantedCard key={w.stashdbId ?? w.whisparrId} scene={w} className="w-[66vw] shrink-0 snap-start sm:w-[260px]" />
          ))}
          {more && <div className="flex w-[40vw] shrink-0 snap-start items-center justify-center sm:w-[160px]">{more}</div>}
        </div>
        <button
          onClick={() => page(-1)}
          aria-label="Scroll left"
          className="absolute top-[calc((min(66vw,260px)*9/16)/2)] left-2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/80 opacity-0 ring-1 ring-white/10 transition group-hover/row:opacity-100 hover:bg-accent sm:flex"
        >
          <ChevronLeft />
        </button>
        <button
          onClick={() => page(1)}
          aria-label="Scroll right"
          className="absolute top-[calc((min(66vw,260px)*9/16)/2)] right-2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/80 opacity-0 ring-1 ring-white/10 transition group-hover/row:opacity-100 hover:bg-accent sm:flex"
        >
          <ChevronRight />
        </button>
      </div>
    </section>
  )
}

const STATE: Record<Exclude<WantedScene['state'], 'available' | 'remote'>, { label: string; icon: ReactNode; tone: string }> = {
  grabbed: { label: 'Grabbed', icon: <Loader2 size={13} className="animate-spin" />, tone: 'bg-accent/20 text-accent' },
  downloading: { label: 'Downloading', icon: <Download size={13} />, tone: 'bg-accent/20 text-accent' },
  downloaded: { label: 'In library', icon: <Check size={13} />, tone: 'bg-green-500/20 text-green-300' },
}

function WantedCard({ scene: w, className }: { scene: WantedScene; className?: string }) {
  const getScene = useGetScene()
  const meta = [fmtDate(w.date), w.studio, w.runtime ? `${w.runtime} min` : null].filter(Boolean).join(' · ')
  const busy = getScene.isPending
  const state = busy ? 'grabbed' : w.state
  const canGet = state === 'available' || state === 'remote'
  return (
    <article className={clsx('flex flex-col gap-2', className)}>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-surface ring-1 ring-white/5">
        {w.image ? (
          <img src={w.image} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted">No cover</div>
        )}
        {w.state === 'remote' && <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase ring-1 ring-white/10">StashDB</span>}
        <div className="absolute right-2 bottom-2">
          {canGet ? (
            <button
              type="button"
              onClick={() => {
                getScene.mutate(w, {
                  onSuccess: () => showToast(`Getting “${w.title}”`),
                  onError: (e) => showToast(e instanceof Error ? e.message : 'Whisparr refused'),
                })
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/80 px-3 py-1.5 text-xs font-semibold text-fg ring-1 ring-white/15 hover:bg-accent touch:py-2"
            >
              <Download size={14} /> Get
            </button>
          ) : (
            <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur', STATE[state].tone)}>
              {STATE[state].icon} {STATE[state].label}
            </span>
          )}
        </div>
      </div>
      <div className="min-w-0 px-0.5">
        <div className="line-clamp-2 text-sm leading-snug font-semibold">{w.title}</div>
        {meta && <div className="truncate text-xs text-muted">{meta}</div>}
        {w.performers.length > 0 && <div className="truncate text-xs text-muted">{w.performers.join(', ')}</div>}
      </div>
    </article>
  )
}

// The row for a performer or studio page: their scenes that are not in the library, from
// StashDB's catalogue (pages) or, without it, Whisparr's list.
export function WantedShelf({ kind, id }: { kind: 'performer' | 'studio'; id: string }) {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = useWanted(kind, id)
  const items = data?.pages.flatMap((p) => p.items) ?? []
  if (!items.length) return null
  const source = data?.pages[0]?.source === 'stashdb' ? 'StashDB' : 'Whisparr'
  return (
    <WantedRow
      title="Not in your library yet"
      hint={`${items.length}${hasNextPage ? '+' : ''} on ${source} · Get fetches one scene`}
      items={items}
      more={
        hasNextPage ? (
          <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Loading…' : 'Show more'}
          </Button>
        ) : null
      }
    />
  )
}
