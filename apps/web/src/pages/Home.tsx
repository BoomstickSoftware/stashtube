import type { JSX } from 'react'
import { Link } from '@tanstack/react-router'
import type { HomeRow, SceneCard, StationResume } from '@flix/shared'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, History, Pencil, Play, Radio, Shuffle, X } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PreviewVideo } from '../components/PreviewVideo'
import { Row } from '../components/Row'
import { SceneCardSkeleton } from '../components/SceneCard'
import { Empty, ErrorBox } from '../components/ui'
import { WantedRow } from '../components/WantedRow'
import { useMediaQuery } from '../lib/hooks'
import { useMoreFeatured, homeSeed, markHomeSeen, shuffleSeed, useHome, useRowMutations, useStationResumes, useWhisparrNew } from '../lib/api'
import { QuerySummary } from '../components/QuerySummary'
import { stationSearchFor } from '../lib/station'
import { duration } from '../lib/format'
import { sized, srcSet } from '@flix/shared'

export function Home(): JSX.Element {
  // The server's Featured row (and so the hero) keeps its order while the seed holds
  // (lib/api/home.ts); Shuffle draws a new one.
  const [seed, setSeed] = useState(homeSeed)
  // Leaving Home or the app notes the time, so a quick return keeps this feed; coming back to
  // the foreground after longer brings the next seed (lib/api/home.ts).
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) markHomeSeen()
      else setSeed(homeSeed())
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      markHomeSeen()
    }
  }, [])
  const { data, error, isLoading } = useHome(seed)
  // Hero: the Featured row in score order, then (Hero fetches it) the same ranking further
  // down, twenty at a time; without a Featured row (no library yet), a shuffle of everything
  // on the page. It moves on by itself, by arrow, or by a swipe, and wraps around only when
  // the ranking runs out. The current pick holds while the feed refreshes in the
  // background, as long as the video is still on the page.
  const featuredRow = (data ?? []).find((r) => r.key === 'featured')
  const order = useMemo(() => {
    const featured = (data ?? []).find((r) => r.key === 'featured')
    if (featured) return featured.items
    const unique = [...new Map((data ?? []).flatMap((r) => r.items).map((s) => [s.id, s])).values()]
    const rank = (id: string) => Math.sin(Number(id) * 12.9898 + hash(seed) * 78.233) // seeded shuffle
    return unique.sort((a, b) => rank(a.id) - rank(b.id))
  }, [data, seed])
  if (error) return <ErrorBox error={error} />
  if (isLoading)
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <SceneCardSkeleton key={i} />
        ))}
      </div>
    )
  if (!data?.length) return <Empty>Your library is empty.</Empty>

  // "Pick up a station" follows Featured (desktop audit, item 13): the first row under the hero
  // is something to browse, not a two-tile strip, so Featured shows above the fold at 900 px.
  // Without a Featured row it leads, as it did before.
  return (
    <div className="space-y-10">
      <Hero order={order} seed={seed} more={!!featuredRow} />
      {!featuredRow && <PickUpStations cover={order.at(-1)} />}
      {data.map((r) =>
        r.savedId ? (
          <PinnedRow key={r.key} row={r} order={data.filter((x) => x.savedId).map((x) => x.savedId!)} />
        ) : r.key === 'featured' ? (
          <Fragment key={r.key}>
            <Row
              title={r.title}
              items={r.items}
              actions={
                <button className="rounded-full p-1.5 text-muted hover:bg-raised hover:text-fg" title="Shuffle" aria-label="Shuffle the featured picks" onClick={() => setSeed(shuffleSeed())}>
                  <Shuffle size={15} />
                </button>
              }
            />
            <PickUpStations cover={order.at(-1)} />
          </Fragment>
        ) : (
          <Row key={r.key} title={r.title} browse={r.browse} from={r.from} items={r.items} />
        ),
      )}
      <NotDownloaded />
    </div>
  )
}

// Recent releases from favourite performers that Whisparr knows and the library lacks. Only
// with Whisparr configured, and only when there are a few, like the other rows.
function NotDownloaded() {
  const { data } = useWhisparrNew()
  if (!data || data.length < 3) return null
  return <WantedRow title="New from performers you follow, not downloaded" hint="Get downloads one scene" items={data} />
}

const HERO_EVERY = 12_000 // ms a pick stays up before the next one

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 1000, 7) / 1000

// One tap into a station of the whole library in a fresh random order, then the stations left
// part-way, most recent first (tap one to pick it up where it was). The shuffle card is always
// there, so the row shows even with nothing in progress. `cover`: a picture for it from the
// feed (the last Featured pick, so not the hero's).
function PickUpStations({ cover }: { cover?: SceneCard }) {
  const { data: resumes, isLoading } = useStationResumes()
  const recent = (resumes ?? []).slice(0, 6)
  // the row arrives after the feed paints; hold its height so the rows below do not jump
  if (isLoading && !resumes) return <section aria-hidden className="h-[calc(62vw*9/16+4.75rem)] sm:h-[calc(260px*9/16+4.75rem)]" />
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">{recent.length ? 'Pick up a station' : 'Stations'}</h2>
        <Link to="/stations" className="text-sm text-muted hover:text-accent">
          All stations
        </Link>
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scroll-pl-4 sm:-mx-6 sm:px-6 sm:scroll-pl-6">
        <ShuffleCard cover={cover} />
        {recent.map((r) => (
          <ResumeCard key={r.key} resume={r} />
        ))}
      </div>
    </section>
  )
}

// The whole library as a station, shuffled with a fresh seed on every start (the Stations page's
// "Everything" quick start, without its resume).
function ShuffleCard({ cover }: { cover?: SceneCard }) {
  return (
    <Link to="/station" search={{}} className="group w-[62vw] shrink-0 snap-start sm:w-[260px]">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-surface ring-1 ring-white/5">
        {cover && <img src={sized(cover.screenshot, 640)} alt="" loading="lazy" className="size-full object-cover opacity-60 transition-transform duration-500 group-hover:scale-[1.03]" />}
        <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/70 via-black/30 to-transparent">
          <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-black shadow-xl transition-transform group-hover:scale-105">
            <Shuffle size={20} />
          </span>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold">
        <Radio size={13} className="shrink-0 text-accent" />
        <span className="truncate">Shuffle everything</span>
      </div>
    </Link>
  )
}

function ResumeCard({ resume: r }: { resume: StationResume }) {
  const search = stationSearchFor(r.key)
  const label = r.name ?? (search.from ? 'Like a video' : <QuerySummary query={search} empty="Everything" />)
  return (
    <Link to="/station" search={{ ...search, start: 'resume' }} className="group w-[62vw] shrink-0 snap-start sm:w-[260px]">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-surface ring-1 ring-white/5">
        <img src={sized(r.scene.screenshot, 640)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-black shadow-xl">
            <Play size={20} className="ml-0.5 fill-current" />
          </span>
        </span>
        <span className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-full bg-black/75 px-2.5 py-1 text-[11px] backdrop-blur">
          <History size={12} className="shrink-0 text-accent" />
          <span className="truncate">{r.scene.title}</span>
          <span className="ml-auto shrink-0 text-white/70 tabular-nums">{duration(r.seconds)}</span>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold">
        <Radio size={13} className="shrink-0 text-accent" />
        <span className="truncate">{label}</span>
      </div>
    </Link>
  )
}

// The hero carousel: arrows, a sideways swipe, or the timer move it. The timer waits while
// the pointer is over it, a preview is playing, or the tab is in the background.
// Owns which pick is up, so its timer re-renders nothing but itself (Home holds ~260 cards).
// `more`: the picks are a ranking that continues below the row, fetched as the end nears.
function Hero({ order, seed, more }: { order: SceneCard[]; seed: string; more: boolean }) {
  const [heroId, setHeroId] = useState<string>()
  const atInRow = Math.max(0, order.findIndex((s) => s.id === heroId))
  const pages = useMoreFeatured(seed, order.length, more && atInRow >= order.length - 4)
  // The row, then the fetched pages with anything already shown left out. A page that adds
  // nothing new (an older server, a ranking that repeats) ends the paging, or the hero would
  // ask for the next page forever.
  const { picks, stalled } = useMemo(() => {
    const seen = new Set(order.map((s) => s.id))
    const picks = [...order]
    let stalled = false
    for (const page of pages.data?.pages ?? []) {
      const fresh = page.filter((s) => !seen.has(s.id) && !!seen.add(s.id))
      picks.push(...fresh)
      stalled = fresh.length === 0
    }
    return { picks, stalled }
  }, [order, pages.data])
  const at = Math.max(0, picks.findIndex((s) => s.id === heroId))
  const scene = picks[at]
  const count = picks.length
  const nearEnd = more && at >= picks.length - 4
  const { hasNextPage, isFetching, fetchNextPage } = pages
  useEffect(() => {
    if (nearEnd && hasNextPage && !isFetching && !stalled) fetchNextPage()
  }, [nearEnd, hasNextPage, isFetching, stalled, fetchNextPage])
  const onStep = useCallback((d: number) => setHeroId(picks[(at + d + picks.length) % picks.length]?.id), [picks, at])
  const [hovering, setHovering] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const still = useMediaQuery('(prefers-reduced-motion: reduce)') // no auto-advance either
  const paused = hovering || previewing || count < 2 || still
  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => document.visibilityState === 'visible' && onStep(1), HERO_EVERY)
    return () => clearTimeout(t)
  }, [paused, scene?.id, onStep])
  const swipe = useRef<{ x: number; y: number } | null>(null)
  if (!scene) return null
  const arrow =
    'absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/10 backdrop-blur transition hover:bg-accent [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/hero:opacity-100'
  return (
    <section
      className="group/hero relative -mx-4 -mt-6 touch-pan-y overflow-hidden sm:-mx-6"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovering(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHovering(false)}
      onPointerDown={(e) => e.pointerType !== 'mouse' && (swipe.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        const s = swipe.current
        swipe.current = null
        if (!s) return
        const dx = e.clientX - s.x
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) onStep(dx < 0 ? 1 : -1)
      }}
      onPointerCancel={() => (swipe.current = null)}
    >
      <div key={scene.id} className="animate-fade-in">
        <img src={sized(scene.screenshot, 320)} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-2xl" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <div className="relative mx-auto grid max-w-[1920px] grid-cols-1 items-center gap-6 px-4 py-8 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:py-12">
          {/* Sized by the viewport, not the title next to it: 16:9, no taller than ~half the
              screen, so every pick takes the same space and the carousel never jumps. */}
          <div className="relative mx-auto w-full max-w-[calc(55svh*16/9)]">
            <HeroMedia scene={scene} onPreview={setPreviewing} />
            {count > 1 && (
              <>
                <button onClick={() => onStep(-1)} className={clsx(arrow, 'left-2')} aria-label="Previous pick">
                  <ChevronLeft size={22} />
                </button>
                <button onClick={() => onStep(1)} className={clsx(arrow, 'right-2')} aria-label="Next pick">
                  <ChevronRight size={22} />
                </button>
              </>
            )}
          </div>
          <div>
            <div className="text-xs font-bold tracking-widest text-accent uppercase">Tonight’s pick</div>
            <h1 className="mt-2 line-clamp-2 min-h-[2lh] text-2xl leading-tight font-black tracking-tight [overflow-wrap:anywhere] sm:text-4xl">{scene.title}</h1>
            <div className="mt-3 truncate text-sm text-white/70">
              {[
                scene.studio?.name,
                scene.performers
                  .map((p) => p.name)
                  .slice(0, 3)
                  .join(', '),
                duration(scene.durationSec),
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <Link
              to="/scene/$id"
              params={{ id: scene.id }}
              search={{ play: true }}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-black transition hover:bg-accent hover:text-white"
            >
              <Play size={18} className="fill-current" />
              {scene.resumeTime > 0 ? `Resume from ${duration(scene.resumeTime)}` : 'Play'}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

// A row pinned from Browse: rename, move, unpin in place.
function PinnedRow({ row, order }: { row: HomeRow; order: number[] }) {
  const m = useRowMutations()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(row.title)
  const id = row.savedId!
  const i = order.indexOf(id)
  const move = (d: number) => {
    const next = [...order]
    next.splice(i + d, 0, next.splice(i, 1)[0])
    m.reorder.mutate(next)
  }
  const btn = 'rounded-full p-1.5 text-muted hover:bg-raised hover:text-fg disabled:opacity-30'
  const heading = editing ? (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim()) m.rename.mutate({ id, title: title.trim() }, { onSuccess: () => setEditing(false) })
      }}
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => setEditing(false)}
        maxLength={80}
        className="rounded-lg bg-raised px-2 py-1 text-lg font-bold outline-none focus:ring-1 focus:ring-accent"
      />
    </form>
  ) : (
    row.title
  )
  return (
    <Row
      title={heading}
      browse={row.browse}
      items={row.items}
      actions={
        <>
          <button className={btn} title="Rename" onClick={() => setEditing(true)}>
            <Pencil size={15} />
          </button>
          <button className={btn} title="Move up" disabled={i === 0} onClick={() => move(-1)}>
            <ArrowUp size={15} />
          </button>
          <button className={btn} title="Move down" disabled={i === order.length - 1} onClick={() => move(1)}>
            <ArrowDown size={15} />
          </button>
          <button className={btn} title="Unpin" onClick={() => m.unpin.mutate(id)}>
            <X size={15} />
          </button>
        </>
      }
    />
  )
}

const DRAG_START_PX = 10

// Still screenshot by default; the preview clip loads and fades in while hovered, or on a touch
// screen after a slight drag, like the cards (a tap still opens the video, and a full sideways
// swipe still moves the carousel on, which remounts this and ends the preview). It stops once
// the hero has mostly scrolled out of view.
function HeroMedia({ scene, onPreview }: { scene: SceneCard; onPreview: (on: boolean) => void }) {
  const [hovering, setHovering] = useState(false)
  const [ready, setReady] = useState(false)
  const touchStart = useRef<{ x: number; y: number }>(undefined)
  const dragged = useRef(false) // this touch started the preview, so its click must not open the video
  const root = useRef<HTMLAnchorElement>(null)
  const start = () => {
    setHovering(true)
    onPreview(true)
  }
  const stop = useCallback(() => {
    setHovering(false)
    setReady(false)
    onPreview(false)
  }, [onPreview])

  useEffect(() => {
    const el = root.current
    if (!hovering || !el) return
    const io = new IntersectionObserver(([entry]) => entry && entry.intersectionRatio < 0.5 && stop(), { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [hovering, stop])
  useEffect(() => stop, [stop])

  return (
    <Link
      ref={root}
      to="/scene/$id"
      params={{ id: scene.id }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && start()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && stop()}
      onTouchStart={(e) => {
        const t = e.touches[0]
        dragged.current = false
        touchStart.current = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : undefined
      }}
      onTouchMove={(e) => {
        const from = touchStart.current
        const t = e.touches[0]
        if (!from || !t || hovering) return
        if (Math.hypot(t.clientX - from.x, t.clientY - from.y) >= DRAG_START_PX) {
          touchStart.current = undefined
          dragged.current = true
          start()
        }
      }}
      onClick={(e) => {
        if (dragged.current) e.preventDefault()
      }}
      className="group relative block aspect-video w-full overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10"
    >
      <img src={sized(scene.screenshot, 960)} srcSet={srcSet(scene.screenshot)} sizes="(min-width: 768px) 55vw, 100vw" alt="" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
      {hovering && scene.preview && <PreviewVideo src={scene.preview} ready={ready} onReady={() => setReady(true)} className="duration-300" />}
    </Link>
  )
}
