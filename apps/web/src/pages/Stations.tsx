import type { SavedStation, SceneQuery, StationResume } from '@flix/shared'
import type { JSX } from 'react'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { Check, History, Pencil, Play, Plus, Radio, Shuffle, Sparkles, Star, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { QuerySummary } from '../components/QuerySummary'
import { ErrorBox, Spinner, useMediaQuery } from '../components/ui'
import { useStationMutations, useStationPreview, useStationResumes, useStations } from '../lib/api'
import { duration as fmt } from '../lib/format'
import { stationKey } from '../lib/station'

// Ready-made stations: one tap, nothing to set up.
const quick: { name: string; query: SceneQuery; icon: typeof Radio }[] = [
  { name: 'Everything', query: {}, icon: Radio },
  { name: 'Unwatched', query: { unwatched: true }, icon: Sparkles },
  { name: 'Favourite performers', query: { favorites: true }, icon: Users },
  { name: 'Top rated', query: { minRating: 4 }, icon: Star },
]

const ROTATE_MS = 4000

export function Stations(): JSX.Element {
  const { data, error, isLoading } = useStations()
  const { data: resumes } = useStationResumes()
  const resumeFor = (key: string) => resumes?.find((r) => r.key === key)
  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Radio size={22} className="text-accent" /> Stations
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Endless play. Make one here, or start one from any list’s <b>Station</b> button (its filters decide what plays) or a
            video’s, then Save it to keep it here.
          </p>
        </div>
        <Link
          to="/stations/new"
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          <Plus size={16} /> New station
        </Link>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Your stations</h2>
        {error ? (
          <ErrorBox error={error} />
        ) : isLoading ? (
          <Spinner className="mx-auto my-12" />
        ) : !data?.length ? (
          <div className="rounded-2xl bg-surface p-6 text-sm text-muted ring-1 ring-line">
            None saved yet. Tap <b>New station</b>, or open a station and tap <b>Save</b> next to its name.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {data.map((s, i) => (
              <StationCard key={s.id} station={s} resume={resumeFor(stationKey(s))} offset={i} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Quick start</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quick.map((q, i) => (
            <QuickCard key={q.name} {...q} resume={resumeFor(stationKey({ query: q.query }))} offset={i + 1} />
          ))}
        </div>
      </section>
    </div>
  )
}

// A station's picture: cycles through screenshots of what it plays, crossfading, with how many
// videos it has. `offset` staggers the cards so they do not all change at once.
function Preview({
  query,
  from,
  cover,
  offset,
  className,
  children,
}: {
  query: SceneQuery
  from?: string
  cover?: string | null
  offset: number
  className?: string
  children?: React.ReactNode
}) {
  const { data } = useStationPreview(query, from)
  const still = useMediaQuery('(prefers-reduced-motion: reduce)')
  const covers = [...new Set([...(cover ? [cover] : []), ...(data?.covers ?? [])])]
  const [i, setI] = useState(0)
  useEffect(() => {
    if (still || covers.length < 2) return
    let iv: number | undefined
    const t = setTimeout(() => {
      setI((n) => n + 1)
      iv = window.setInterval(() => setI((n) => n + 1), ROTATE_MS)
    }, ROTATE_MS + (offset % 4) * 900)
    return () => {
      clearTimeout(t)
      clearInterval(iv)
    }
  }, [still, covers.length, offset])
  const at = covers.length ? i % covers.length : 0
  return (
    <div className={clsx('relative overflow-hidden bg-raised', className)}>
      {covers.map(
        (src, k) =>
          // the current one and the next (so it has loaded before it fades in)
          (k === at || k === (at + 1) % covers.length) && (
            <img
              key={src}
              src={src}
              alt=""
              className={clsx(
                'absolute inset-0 size-full object-cover transition-[opacity,scale] duration-1000 ease-in-out group-hover:scale-[1.03]',
                k === at ? 'opacity-100' : 'opacity-0',
              )}
            />
          ),
      )}
      {data && data.total !== null && (
        <span className="absolute top-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums backdrop-blur">
          {data.total.toLocaleString()} video{data.total === 1 ? '' : 's'}
        </span>
      )}
      {children}
    </div>
  )
}

function ResumePill({ resume }: { resume: StationResume }) {
  return (
    <span className="absolute inset-x-2 bottom-2 flex min-w-0 items-center gap-1.5 rounded-full bg-black/75 px-2.5 py-1 text-[11px] backdrop-blur">
      <History size={12} className="shrink-0 text-accent" />
      <span className="truncate">
        Resume <b>{resume.scene.title}</b>
      </span>
      <span className="ml-auto shrink-0 text-white/70 tabular-nums">{fmt(resume.seconds)}</span>
    </span>
  )
}

const PlayBadge = () => (
  <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:bg-transparent [@media(hover:none)]:opacity-100">
    <span className="flex size-14 items-center justify-center rounded-full bg-white/90 text-black shadow-xl">
      <Play size={24} className="ml-0.5 fill-current" />
    </span>
  </span>
)

// Tap the picture to pick up where the station was left (or start it); the buttons start a
// fresh shuffle or only unwatched videos.
function StationCard({ station: s, resume, offset }: { station: SavedStation; resume?: StationResume; offset: number }) {
  const { update, remove } = useStationMutations()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const btn = 'rounded-full p-2 text-muted hover:bg-raised hover:text-fg'
  return (
    <div className="group min-w-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <Link to="/station" search={resume ? { id: s.id, start: 'resume' } : { id: s.id }} className="block">
        <Preview query={s.query} from={s.from} cover={s.cover} offset={offset} className="aspect-video">
          <PlayBadge />
          <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold backdrop-blur">
            {s.mode === 'moments' ? `Moments · ${s.window}s` : 'Full videos'}
          </span>
          {resume && <ResumePill resume={resume} />}
        </Preview>
      </Link>
      <div className="flex items-start gap-1 p-3 pb-1">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
                if (name) update.mutate({ id: s.id, name })
                setEditing(false)
              }}
            >
              <input
                name="name"
                autoFocus
                defaultValue={s.name}
                maxLength={80}
                onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                className="w-full rounded-lg bg-raised px-2 py-1 text-base font-semibold outline-none focus:ring-1 focus:ring-accent sm:text-sm"
              />
            </form>
          ) : (
            <button className="block max-w-full truncate text-left font-semibold hover:text-accent" title="Rename" onClick={() => setEditing(true)}>
              {s.name}
            </button>
          )}
          <div className="mt-0.5 line-clamp-2 text-xs text-muted">
            {s.from ? 'Drifts through videos like one scene' : <QuerySummary query={s.query} />}
          </div>
        </div>
        <Link to="/stations/$id/edit" params={{ id: String(s.id) }} className={btn} title="Edit filters and settings" aria-label={`Edit ${s.name}`}>
          <Pencil size={15} />
        </Link>
        {confirm ? (
          <button className="rounded-full p-2 text-red-400 hover:bg-red-500/15" title="Confirm delete" onClick={() => remove.mutate(s.id)}>
            <Check size={15} />
          </button>
        ) : (
          <button className={btn} title="Delete station" onClick={() => setConfirm(true)} onBlur={() => setConfirm(false)}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
      <StartButtons search={{ id: s.id }} />
    </div>
  )
}

function StartButtons({ search }: { search: { id?: number } & SceneQuery }) {
  const chip = 'flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-xs font-medium hover:bg-line'
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-3">
      <Link to="/station" search={search} className={chip} title="A fresh shuffle">
        <Shuffle size={13} /> Shuffle
      </Link>
      {!search.unwatched && (
        <Link to="/station" search={{ ...search, unwatched: true }} className={chip} title="Only videos never watched">
          <Sparkles size={13} /> Unwatched
        </Link>
      )}
    </div>
  )
}

function QuickCard({ name, query, icon: Icon, resume, offset }: { name: string; query: SceneQuery; icon: typeof Radio; resume?: StationResume; offset: number }) {
  return (
    <div className="group min-w-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <Link to="/station" search={resume ? { ...query, start: 'resume' } : query} className="block">
        <Preview query={query} offset={offset} className="aspect-video">
          <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <span className="absolute bottom-2 left-2 flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/90 text-white">
              <Icon size={15} />
            </span>
            <span className="truncate text-sm font-semibold">{name}</span>
          </span>
          {resume && (
            <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] backdrop-blur">
              <History size={11} className="text-accent" /> {fmt(resume.seconds)}
            </span>
          )}
        </Preview>
      </Link>
      <div className="pt-2">
        <StartButtons search={query} />
      </div>
    </div>
  )
}
