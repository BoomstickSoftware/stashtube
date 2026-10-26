import type { JSX } from 'react'
import { Link } from '@tanstack/react-router'
import type { HomeRow, SceneCard } from '@flix/shared'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Pencil, Play, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Row } from '../components/Row'
import { SceneCardSkeleton } from '../components/SceneCard'
import { Empty, ErrorBox } from '../components/ui'
import { useHome, useRowMutations } from '../lib/api'
import { duration } from '../lib/format'

export function Home(): JSX.Element {
  const { data, error, isLoading } = useHome()
  // Hero: a random video from everything on the page, new on each visit (no extra request).
  const hero = useMemo(() => {
    const all = [...new Map((data ?? []).flatMap((r) => r.items).map((s) => [s.id, s])).values()]
    return all.length ? all[Math.floor(Math.random() * all.length)] : undefined
  }, [data])
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
      {hero && (
        <section className="relative -mx-4 -mt-6 overflow-hidden sm:-mx-6">
          <img src={hero.screenshot} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-2xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
          <div className="relative mx-auto grid max-w-[1920px] items-center gap-6 px-4 py-8 sm:px-6 md:grid-cols-[1.4fr_1fr] md:py-12">
            <HeroMedia scene={hero} />
            <div>
              <div className="text-xs font-bold tracking-widest text-accent uppercase">
                Tonight’s pick
              </div>
              <h1 className="mt-2 text-2xl leading-tight font-black tracking-tight sm:text-4xl">{hero.title}</h1>
              <div className="mt-3 text-sm text-white/70">
                {[hero.studio?.name, hero.performers.map((p) => p.name).slice(0, 3).join(', '), duration(hero.durationSec)]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <Link
                to="/scene/$id"
                params={{ id: hero.id }}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-black transition hover:bg-accent hover:text-white"
              >
                <Play size={18} className="fill-current" />
                {hero.resumeTime > 0 ? `Resume from ${duration(hero.resumeTime)}` : 'Play'}
              </Link>
            </div>
          </div>
        </section>
      )}
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
function HeroMedia({ scene }: { scene: SceneCard }) {
  const [hovering, setHovering] = useState(false)
  const [ready, setReady] = useState(false)
  return (
    <Link
      to="/scene/$id"
      params={{ id: scene.id }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        setHovering(false)
        setReady(false)
      }}
      className="group relative aspect-video overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10"
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
