import type { SavedStation, SceneQuery, StationPreview, StationResume } from '@flix/shared'
import type { JSX } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import { History, ListFilter, MoreHorizontal, Pencil, Play, Plus, Radio, Shuffle, SlidersHorizontal, Sparkles, Star, Trash2, Users, Waypoints } from 'lucide-react'
import { useEffect, useState } from 'react'
import { QuerySummary } from '../components/QuerySummary'
import { ActionSheet, RenameSheet, type SheetAction } from '../components/Sheet'
import { Bone, ErrorBox, IconButton, UndoButton } from '../components/ui'
import { showToast } from '../lib/toast'
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
            Endless play from a list you define.
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

      {/* every way to start without saving anything, in one place: the ready-made stations, then
          one from where you just were */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Quick start</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quick.map((q, i) => (
            <QuickCard key={q.name} {...q} preview={previewFor(previews, q)} pending={previewsPending} resume={resumeFor(stationKey({ query: q.query }))} offset={i + 1} />
          ))}
        </div>
        <StartFrom />
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
    <>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
    </>
  )
}

// The shape of a saved station's card while the list loads: picture, name, summary, two chips.
function StationCardSkeleton() {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <Bone className="aspect-video rounded-none" />
      <div className="p-3">
        <Bone className="h-5 w-2/3" />
        <Bone className="mt-2 h-3 w-full" />
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

// The ways to start a station other than the tap on its picture, for its "⋯" sheet: the tap
// resumes when there is a place to resume, so a fresh shuffle is always offered here.
type StartSearch = { id?: number; start?: 'resume' } & SceneQuery
function startActions(search: StartSearch, resume: StationResume | undefined, go: (search: StartSearch) => void): SheetAction[] {
  return [
    ...(resume ? [{ icon: <History size={16} />, label: 'Resume', hint: `From ${fmt(resume.seconds)} into the last video`, run: () => go({ ...search, start: 'resume' }) }] : []),
    { icon: <Shuffle size={16} />, label: resume ? 'Start over, shuffled' : 'Shuffle', hint: 'A fresh random order', run: () => go(search) },
    ...(search.unwatched ? [] : [{ icon: <Sparkles size={16} />, label: 'Unwatched only', hint: 'Videos never watched', run: () => go({ ...search, unwatched: true }) }]),
  ]
}

// One tap on the picture picks up where the station was left (or starts it). Everything else
// (a fresh shuffle, unwatched only, rename, edit, delete) is in the "⋯" sheet; _until 2026-11-10_
// the card carried two start chips, a pencil, a bin and a tap-to-rename title.
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
  const { update, removeLater } = useStationMutations()
  const navigate = useNavigate()
  const [menu, setMenu] = useState<'actions' | 'rename' | null>(null)
  const go = (search: StartSearch) => navigate({ to: '/station', search })
  return (
    <div className="group min-w-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <Link to="/station" search={resume ? { id: s.id, start: 'resume' } : { id: s.id }} className="press press-soft block">
        <Preview data={preview} cover={s.cover} pending={pending} offset={offset} className="aspect-video">
          <PlayBadge />
          <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold backdrop-blur">
            {s.mode === 'moments' ? `Moments · ${s.window}s` : 'Full videos'}
          </span>
          {resume && <ResumePill resume={resume} />}
        </Preview>
      </Link>
      <div className="flex items-center gap-1 py-2 pr-1 pl-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{s.name}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-muted">{s.from ? 'Drifts through videos like one scene' : <QuerySummary query={s.query} />}</div>
        </div>
        <IconButton label={`More for ${s.name}`} onClick={() => setMenu('actions')}>
          <MoreHorizontal size={18} />
        </IconButton>
      </div>
      {menu === 'actions' && (
        <ActionSheet
          title={s.name}
          onClose={() => setMenu(null)}
          actions={[
            ...startActions({ id: s.id }, resume, go),
            { icon: <Pencil size={16} />, label: 'Rename', run: () => setMenu('rename') },
            { icon: <SlidersHorizontal size={16} />, label: 'Edit filters and settings', run: () => navigate({ to: '/stations/$id/edit', params: { id: String(s.id) } }) },
            {
              icon: <Trash2 size={16} />,
              label: 'Delete station',
              tone: 'danger',
              run: () => {
                const undo = removeLater(s.id)
                showToast('Station deleted', <UndoButton onClick={undo} />, 6000)
              },
            },
          ]}
        />
      )}
      {menu === 'rename' && <RenameSheet title="Rename station" value={s.name} onSave={(name) => update.mutate({ id: s.id, name })} onClose={() => setMenu(null)} />}
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
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  return (
    <div className="group relative min-w-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <Link to="/station" search={resume ? { ...query, start: 'resume' } : query} className="press press-soft block">
        <Preview data={preview} pending={pending} offset={offset} className="aspect-video">
          <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <span className="absolute right-11 bottom-2 left-2 flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/90 text-white">
              <Icon size={15} />
            </span>
            <span className="line-clamp-2 text-sm leading-tight font-semibold">{name}</span>
          </span>
          {resume && (
            <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] backdrop-blur">
              <History size={11} className="text-accent" /> {fmt(resume.seconds)}
            </span>
          )}
        </Preview>
      </Link>
      {/* over the picture's corner, outside the link: the other ways to start this one */}
      <IconButton label={`More for ${name}`} tone="fg" onClick={() => setMenu(true)} className="absolute right-0.5 bottom-0.5 hover:bg-white/15">
        <MoreHorizontal size={18} />
      </IconButton>
      {menu && <ActionSheet title={name} onClose={() => setMenu(false)} actions={startActions(query, resume, (search) => navigate({ to: '/station', search }))} />}
    </div>
  )
}
