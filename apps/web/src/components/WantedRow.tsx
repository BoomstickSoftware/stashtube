import type { WantedScene } from '@flix/shared'
import { sized, srcSet } from '@flix/shared'
import clsx from 'clsx'
import { Ban, Check, ChevronLeft, ChevronRight, CircleCheck, Clock, Download, GalleryHorizontalEnd, Hourglass, LayoutGrid, ListPlus, Loader2, Play } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useCallback, useRef, type ReactNode } from 'react'
import { useGetScene, useStashDbIds, useWanted } from '../lib/api'
import { asBool, oneOf, useStored } from '../lib/storage'
import { Button, Sentinel, Spinner } from './ui'
import { date as fmtDate } from '../lib/format'
import { showToast } from '../lib/toast'
import { canGetState } from '../lib/wanted'

// How wide a card shows, so the browser picks the resized cover that fits (`srcSet`).
const ROW_SIZES = '(min-width: 640px) 260px, 66vw'
const GRID_SIZES = '(min-width: 1536px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw'

// A shelf of scenes Whisparr knows about but has not downloaded. Each card has one action,
// Get, which asks the server to fetch that one scene; nothing here acts on a whole performer
// or studio (the library policy).
export function WantedRow({ title, items, hint, more, right, className }: { title: ReactNode; items: WantedScene[]; hint?: string; more?: ReactNode; right?: ReactNode; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null)
  const page = (dir: number) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' })
  }
  if (!items.length) return null
  return (
    <section className={clsx('group/row', className)}>
      <Heading title={title} hint={hint} right={right} />
      <div className="relative -mx-4 sm:-mx-6">
        <div ref={scroller} className="no-scrollbar flex snap-x gap-4 overflow-x-auto scroll-smooth px-4 pb-2 scroll-pl-4 sm:px-6 sm:scroll-pl-6">
          {items.map((w) => (
            <WantedCard key={w.stashdbId ?? w.whisparrId} scene={w} sizes={ROW_SIZES} className="w-[66vw] shrink-0 snap-start sm:w-[260px]" />
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

function Heading({ title, hint, right }: { title: ReactNode; hint?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
      {hint && <span className="min-w-0 truncate text-sm text-muted">{hint}</span>}
      {right && <div className="ml-auto shrink-0">{right}</div>}
    </div>
  )
}

// 'requested' is flix's own state: Get was pressed and Whisparr has not grabbed it yet, so the
// card no longer offers Get as if nothing had happened. 'queued' waits in flix's paced Get queue;
// 'waiting' was fetched and Whisparr has found no release yet (flix searches again weekly);
// 'owned' is in the library; 'excluded' was deleted before (Whisparr's import exclusion).
const STATE: Record<Exclude<WantedScene['state'], 'available' | 'remote'>, { label: string; icon: ReactNode; tone: string }> = {
  requested: { label: 'Requested', icon: <Clock size={13} />, tone: 'bg-white/15 text-fg/90' },
  queued: { label: 'Queued', icon: <ListPlus size={13} />, tone: 'bg-white/15 text-fg/90' },
  waiting: { label: 'Waiting', icon: <Hourglass size={13} />, tone: 'bg-amber-500/20 text-amber-200' },
  owned: { label: 'In library', icon: <Play size={13} />, tone: 'bg-green-500/20 text-green-300' },
  excluded: { label: 'Deleted before', icon: <Ban size={13} />, tone: 'bg-red-500/15 text-red-300' },
  grabbed: { label: 'Grabbed', icon: <Loader2 size={13} className="animate-spin" />, tone: 'bg-accent/20 text-accent' },
  downloading: { label: 'Downloading', icon: <Download size={13} />, tone: 'bg-accent/20 text-accent' },
  downloaded: { label: 'In library', icon: <Check size={13} />, tone: 'bg-green-500/20 text-green-300' },
}

// The cover is a StashDB image through flix's proxy (`/media/remote/…`), resized like any card.
// With `selecting`, a tap on a card that can be fetched toggles it (Discover's multi-select)
// instead of the Get button; an owned card always opens the scene.
export function WantedCard({
  scene: w,
  sizes,
  className,
  selecting,
  selected,
  onToggle,
}: {
  scene: WantedScene
  sizes: string
  className?: string
  selecting?: boolean
  selected?: boolean
  onToggle?: () => void
}) {
  const getScene = useGetScene()
  const meta = [fmtDate(w.date), w.studio, w.runtime ? `${w.runtime} min` : null].filter(Boolean).join(' · ')
  const busy = getScene.isPending
  const state = busy ? 'requested' : w.state
  const canGet = canGetState(state)
  const pickable = !!selecting && canGet
  const cover = (
      <div className={clsx('relative aspect-video overflow-hidden rounded-xl bg-surface ring-1', selected ? 'ring-2 ring-accent' : 'ring-white/5', selecting && !canGet && 'opacity-50')}>
        {w.image ? (
          <img src={sized(w.image, 640)} srcSet={srcSet(w.image)} sizes={sizes} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted">No cover</div>
        )}
        {w.state === 'remote' && <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase ring-1 ring-white/10">StashDB</span>}
        {pickable && (
          <span className={clsx('absolute top-2 right-2 flex size-7 items-center justify-center rounded-full ring-1', selected ? 'bg-accent text-white ring-accent' : 'bg-black/60 text-transparent ring-white/40')}>
            <CircleCheck size={18} />
          </span>
        )}
        <div className={clsx('absolute right-2 bottom-2', pickable && 'hidden')}>
          {canGet ? (
            <button
              type="button"
              onClick={() => {
                getScene.mutate(w, { onSuccess: () => showToast(`Getting “${w.title}”`) }) // a failure is toasted by the client
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
  )
  return (
    <article className={clsx('flex flex-col gap-2', className)}>
      {pickable ? (
        <button type="button" onClick={onToggle} aria-pressed={selected} aria-label={`Select ${w.title}`} className="block text-left">
          {cover}
        </button>
      ) : state === 'owned' && w.sceneId ? (
        <Link to="/scene/$id" params={{ id: w.sceneId }} className="block">
          {cover}
        </Link>
      ) : (
        cover
      )}
      <div className="min-w-0 px-0.5">
        <div className="line-clamp-2 text-sm leading-snug font-semibold">{w.title}</div>
        {meta && <div className="truncate text-xs text-muted">{meta}</div>}
        {w.performers.length > 0 && <div className="truncate text-xs text-muted">{w.performers.join(', ')}</div>}
      </div>
    </article>
  )
}

// How the shelf on an entity page is laid out, remembered per browser like the Studios views:
// a row that pages with "Show more" (the default), or a grid that loads the next page as the
// bottom comes into view.
const WANTED_VIEWS = ['row', 'grid'] as const
type WantedView = (typeof WANTED_VIEWS)[number]
const WANTED_VIEW_KEY = 'flix.wanted.view'
// Whether the shelf is expanded; closed by default, since the library leads the page.
const WANTED_OPEN_KEY = 'flix.wanted.open'

function ViewToggle({ view, onChange }: { view: WantedView; onChange: (v: WantedView) => void }) {
  const views: [WantedView, string, typeof LayoutGrid][] = [
    ['row', 'Row', GalleryHorizontalEnd],
    ['grid', 'Grid', LayoutGrid],
  ]
  return (
    <div role="radiogroup" aria-label="View" className="flex rounded-full bg-raised p-0.5 text-[13px]">
      {views.map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          aria-label={label}
          title={label}
          onClick={() => onChange(v)}
          className={clsx(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors touch:py-2.5 sm:px-3',
            view === v ? 'bg-white text-black' : 'text-muted hover:text-fg',
          )}
        >
          <Icon size={14} /> <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

// The shelf for a performer or studio page: their scenes that are not in the library, from
// StashDB's catalogue (pages) or, without it, Whisparr's list. It sits below the library and
// starts collapsed to its heading and count ("Not in your library yet · 24+ on StashDB"); a tap
// expands it into the Row or Grid view, and open/closed is remembered per browser. The first
// page is fetched for the count either way, but no cover is rendered while it is closed.
export function WantedShelf({ kind, id }: { kind: 'performer' | 'studio'; id: string }) {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = useWanted(kind, id)
  const [view, setView] = useStored<WantedView>(WANTED_VIEW_KEY, oneOf(WANTED_VIEWS, 'row'))
  const [open, setOpen] = useStored(WANTED_OPEN_KEY, asBool(false))
  const sdb = useStashDbIds(kind, id)
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])
  const items = data?.pages.flatMap((p) => p.items) ?? []
  if (!items.length) return null
  const source = data?.pages[0]?.source === 'stashdb' ? 'StashDB' : 'Whisparr'
  const count = `${items.length}${hasNextPage ? '+' : ''} on ${source}`
  const title = (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      className="-ml-1.5 flex min-h-11 items-center gap-1.5 rounded-lg px-1.5 text-left hover:text-accent"
    >
      <ChevronRight size={18} className={clsx('shrink-0 text-muted transition-transform', open && 'rotate-90')} />
      <span>Not in your library yet</span>
      <span className="font-normal text-muted">· {count}</span>
    </button>
  )
  if (!open) {
    return (
      <section className="mt-10">
        <Heading title={title} />
      </section>
    )
  }
  const hint = 'Get downloads one scene'
  const toggle = (
    <div className="flex items-center gap-2">
      {sdb.data?.ids[0] && (
        <Link to="/discover" search={{ [kind === 'performer' ? 'performers' : 'studios']: sdb.data.ids[0] }} className="rounded-full bg-raised px-3 py-1 text-[13px] text-muted hover:text-fg touch:py-2.5">
          Filter on StashDB
        </Link>
      )}
      <ViewToggle view={view} onChange={setView} />
    </div>
  )
  if (view === 'grid') {
    return (
      <section className="mt-10 mb-8">
        <Heading title={title} hint={hint} right={toggle} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 2xl:grid-cols-5">
          {items.map((w) => (
            <WantedCard key={w.stashdbId ?? w.whisparrId} scene={w} sizes={GRID_SIZES} />
          ))}
        </div>
        <Sentinel onVisible={loadMore} disabled={!hasNextPage} />
        {isFetchingNextPage && <Spinner className="mx-auto my-6" />}
      </section>
    )
  }
  return (
    <WantedRow
      className="mt-10"
      title={title}
      hint={hint}
      items={items}
      right={toggle}
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
