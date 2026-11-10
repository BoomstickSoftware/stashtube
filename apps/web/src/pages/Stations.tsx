import type { SavedStation, SceneQuery, StationPreview, StationResume } from '@flix/shared'
import type { JSX } from 'react'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { Check, History, ListFilter, Pencil, Play, Plus, Radio, Shuffle, Sparkles, Star, Trash2, Users, Waypoints } from 'lucide-react'
import { useEffect, useState } from 'react'
import { QuerySummary } from '../components/QuerySummary'
import { Bone, ErrorBox } from '../components/ui'
import { useMediaQuery } from '../lib/hooks'
import { previewFor, useStationMutations, useStationPreviews, useStationResumes, useStations } from '../lib/api'
import { duration as fmt } from '../lib/format'
import { stationKey, stationQuery } from '../lib/station'
import { useLastList, useLastScene } from '../lib/recent'
import { filterTotal } from '../lib/filters'
import { sized, srcSet } from '@flix/shared'
import { CARD_SIZES } from '../lib/media'

// Ready-made stations: one click or tap, nothing to set up.
const quick: { name: string; query: SceneQuery; icon: typeof Radio }[] = [
  { name: 'Everything', query: {}, icon: Radio },
  { name: 'Unwatched', query: { unwatched: true }, icon: Sparkles },
  { name: 'Performers I follow', query: { favorites: true }, icon: Users },
  { name: 'Top rated', query: { minRating: 4 }, icon: Star },
]
const quickQueries = quick.map((q) => q.query)

const ROTATE_MS = 4000

export function Stations(): JSX.Element {
  const { data, error, isLoading } = useStations()
  const { data: resumes } = useStationResumes()
  const { data: previews, isPending: previewsPending } = useStationPreviews(quickQueries)
  const resumeFor = (key: string) => resumes?.find((r) => r.key === key)
  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Radio size={22} className="text-accent" /> Stations
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Endless play. Start one from the list or the video you were just on, pick a ready-made one, or make your own; Save a
            station you like to keep it here.
          </p>
        </div>
        <Link
          to="/stations/new"
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          <Plus size={16} /> New station
        </Link>
      </section>

      <StartFrom />

      <section>
        <h2 className="mb-3 text-lg font-bold">Your stations</h2>
        {error ? (
          <ErrorBox error={error} />
        ) : isLoading ? (
          <div role="status" aria-label="Loading" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 3 }, (_, i) => (
              <StationCardSkeleton key={i} />
            ))}
          </div>
        ) : !data?.length ? (
          <div className="rounded-2xl bg-surface p-6 text-sm text-muted ring-1 ring-line">
            None saved yet. Choose <b>New station</b>, or open a station and choose <b>Save station</b> next to its name.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {data.map((s, i) => (
              <StationCard key={s.id} station={s} preview={previewFor(previews, s)} pending={previewsPending} resume={resumeFor(stationKey(s))} offset={i} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Quick start</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quick.map((q, i) => (
            <QuickCard key={q.name} {...q} preview={previewFor(previews, q)} pending={previewsPending} resume={resumeFor(stationKey({ query: q.query }))} offset={i + 1} />
          ))}
        </div>
      </section>
    </div>
  )
}

// A station from where you just were (lib/recent): the last list, with its filters, and a drift
// from the last video opened. These replaced the Station chips on lists, the video page's Related
// and Home's rows (decisions/five-tab-navigation, 2026-11-09).
function StartFrom() {
  const last = useLastList()
  // an unfiltered list is the Everything quick start below
  const list = last && (filterTotal(last) > 0 || last.vault) ? last : null
  const scene = useLastScene()
  if (!list && !scene) return null
  const card = 'flex min-w-0 items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line hover:bg-raised touch:min-h-14'
  const icon = 'flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/90 text-white'
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">Start from</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {list && (
          <Link to="/station" search={stationQuery(list)} className={card}>
            <span className={icon}>
              <ListFilter size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">The list you were on</span>
              <span className="block truncate text-xs text-muted">
                <QuerySummary query={list} />
              </span>
            </span>
          </Link>
        )}
        {scene && (
          <Link to="/station" search={{ from: scene.id }} className={card}>
            <span className={icon}>
              <Waypoints size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Drift from the last video</span>
              <span className="block truncate text-xs text-muted">{scene.title}</span>
            </span>
          </Link>
        )}
      </div>
    </section>
  )
}

// The shape of a saved station's card while the list loads: picture, name, summary, two chips.
function StationCardSkeleton() {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <Bone className="aspect-video rounded-none" />
      <div className="p-3 pb-1">
        <Bone className="h-5 w-2/3" />
        <Bone className="mt-2 h-3 w-full" />
      </div>
      <div className="flex gap-1.5 px-3 pt-2 pb-3">
        <Bone className="h-7 w-20 rounded-full" />
        <Bone className="h-7 w-24 rounded-full" />
      </div>
    </div>
  )
}

// A station's picture: cycles through screenshots of what it plays, crossfading, with how many
// videos it has. `offset` staggers the cards so they do not all change at once. Under the
// pictures sits a neutral block: pulsing until the previews and the first picture have arrived
// (so the card never paints blank), a still Radio mark when the station has no cover at all.
function Preview({
  data,
  cover,
  pending,
  offset,
  className,
  children,
}: {
  data?: StationPreview
  cover?: string | null
  pending?: boolean // the previews request is still out
  offset: number
  className?: string
  children?: React.ReactNode
}) {
  const still = useMediaQuery('(prefers-reduced-motion: reduce)')
  const covers = [...new Set([...(cover ? [cover] : []), ...(data?.items.map((s) => s.screenshot) ?? [])])]
  const [i, setI] = useState(0)
  const [loaded, setLoaded] = useState(false)
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
  const waiting = !covers.length ? !!pending : !loaded
  return (
    <div className={clsx('relative overflow-hidden bg-surface', className)}>
      {waiting ? (
        <div role="status" aria-label="Loading" className="absolute inset-0 animate-pulse bg-raised motion-reduce:animate-none" />
      ) : (
        !covers.length && (
          <div aria-hidden className="absolute inset-0 flex items-center justify-center text-muted">
            <Radio size={32} strokeWidth={1.5} />
          </div>
        )
      )}
      {covers.map(
        (src, k) =>
          // the current one and the next (so it has loaded before it fades in)
          (k === at || k === (at + 1) % covers.length) && (
            <img
              key={src}
              src={sized(src, 640)}
              srcSet={srcSet(src)}
              sizes={CARD_SIZES}
              alt=""
              decoding="async"
              onLoad={k === at ? () => setLoaded(true) : undefined}
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
function StationCard({
  station: s,
  preview,
  pending,
  resume,
  offset,
}: {
  station: SavedStation
  preview?: StationPreview
  pending: boolean
  resume?: StationResume
  offset: number
}) {
  const { update, remove } = useStationMutations()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const btn = 'rounded-full p-2 text-muted hover:bg-raised hover:text-fg'
  return (
    <div className="group min-w-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <Link to="/station" search={resume ? { id: s.id, start: 'resume' } : { id: s.id }} className="block">
        <Preview data={preview} cover={s.cover} pending={pending} offset={offset} className="aspect-video">
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

function QuickCard({
  name,
  query,
  icon: Icon,
  preview,
  pending,
  resume,
  offset,
}: {
  name: string
  query: SceneQuery
  icon: typeof Radio
  preview?: StationPreview
  pending: boolean
  resume?: StationResume
  offset: number
}) {
  return (
    <div className="group min-w-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <Link to="/station" search={resume ? { ...query, start: 'resume' } : query} className="block">
        <Preview data={preview} pending={pending} offset={offset} className="aspect-video">
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
