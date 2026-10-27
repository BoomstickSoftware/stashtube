import type { JSX } from 'react'
import { Link } from '@tanstack/react-router'
import type { HomeRow, SceneCard } from '@flix/shared'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Pencil, Play, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Row } from '../components/Row'
import { SceneCardSkeleton } from '../components/SceneCard'
import { Empty, ErrorBox } from '../components/ui'
import { useHome, useRowMutations } from '../lib/api'
import { duration } from '../lib/format'

export function Home(): JSX.Element {
  const { data, error, isLoading } = useHome()
  // Hero: a carousel over everything on the page, in a shuffled order that is new on each
  // visit (no extra request). It moves on by itself, by arrow, or by a swipe, and wraps
  // around. The current pick holds while the feed refreshes in the background, as long as
  // the video is still on the page.
  const [seed] = useState(Math.random)
  const order = useMemo(() => {
    const unique = [...new Map((data ?? []).flatMap((r) => r.items).map((s) => [s.id, s])).values()]
    const rank = (id: string) => Math.sin(Number(id) * 12.9898 + seed * 78.233) // seeded shuffle
    return unique.sort((a, b) => rank(a.id) - rank(b.id))
  }, [data, seed])
  const [heroId, setHeroId] = useState<string>()
  const at = Math.max(0, order.findIndex((s) => s.id === heroId))
  const hero = order[at]
  const step = useCallback((d: number) => setHeroId(order[(at + d + order.length) % order.length]?.id), [order, at])
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

  return (
    <div className="space-y-10">
      {hero && <Hero scene={hero} count={order.length} onStep={step} />}
      {data.map((r) =>
        r.savedId ? (
          <PinnedRow key={r.key} row={r} order={data.filter((x) => x.savedId).map((x) => x.savedId!)} />
        ) : (
          <Row key={r.key} title={r.title} browse={r.browse} items={r.items} />
        ),
      )}
    </div>
  )
}

const HERO_EVERY = 12_000 // ms a pick stays up before the next one

// The hero carousel: arrows, a sideways swipe, or the timer move it. The timer waits while
// the pointer is over it, a preview is playing, or the tab is in the background.
function Hero({ scene, count, onStep }: { scene: SceneCard; count: number; onStep: (d: number) => void }) {
  const [hovering, setHovering] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const paused = hovering || previewing || count < 2
  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => document.visibilityState === 'visible' && onStep(1), HERO_EVERY)
    return () => clearTimeout(t)
  }, [paused, scene.id, onStep])
  const swipe = useRef<{ x: number; y: number } | null>(null)
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
        <img src={scene.screenshot} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-2xl" />
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

// Still screenshot by default; the preview clip loads and fades in only while hovered,
// like the cards (and nothing autoplays on touch screens).
function HeroMedia({ scene, onPreview }: { scene: SceneCard; onPreview: (on: boolean) => void }) {
  const [hovering, setHovering] = useState(false)
  const [ready, setReady] = useState(false)
  return (
    <Link
      to="/scene/$id"
      params={{ id: scene.id }}
      // a mouse only: on a touch screen the tap that opens the video would start it
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return
        setHovering(true)
        onPreview(true)
      }}
      onPointerLeave={() => {
        setHovering(false)
        setReady(false)
        onPreview(false)
      }}
      className="group relative block aspect-video w-full overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10"
    >
      <img src={scene.screenshot} alt="" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
      {hovering && scene.preview && (
        <video
          src={scene.preview}
          autoPlay
          muted
          loop
          playsInline
          onPlaying={() => setReady(true)}
          className={clsx('absolute inset-0 size-full object-cover transition-opacity duration-300', ready ? 'opacity-100' : 'opacity-0')}
        />
      )}
    </Link>
  )
}
