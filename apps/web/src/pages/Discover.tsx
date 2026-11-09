import type { DiscoverEntity, DiscoverSort, WaitingScene } from '@flix/shared'
import { sized } from '@flix/shared'
import { getRouteApi, Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { Ban, Building2, Download, Hourglass, Plus, RefreshCw, Search, Sparkles, Tags, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { Sheet } from '../components/Sheet'
import { Avatar, Button, Chip, Empty, ErrorBox, Sentinel, Spinner } from '../components/ui'
import { WantedCard } from '../components/WantedRow'
import { canGetState } from '../lib/wanted'
import { useCancelQueued, useDiscover, useDiscoverNames, useGetMany, useGiveUp, useRunDiscovery, useSearchAgain, useStashDbOn, useWaiting } from '../lib/api'
import { date as fmtDate } from '../lib/format'
import { showToast } from '../lib/toast'
import type { DiscoverSearch } from '../routes/discover'

const route = getRouteApi('/discover')
const GRID_SIZES = '(min-width: 1536px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw'
const SORTS: [DiscoverSort, string][] = [
  ['date', 'Newest'],
  ['added', 'Just added'],
  ['trending', 'Trending'],
]
type Kind = DiscoverEntity['kind']
const KINDS: { kind: Kind; key: 'performers' | 'studios' | 'tags'; label: string; icon: typeof Users }[] = [
  { kind: 'performer', key: 'performers', label: 'Performer', icon: Users },
  { kind: 'studio', key: 'studios', label: 'Studio', icon: Building2 },
  { kind: 'tag', key: 'tags', label: 'Category', icon: Tags },
]
const ids = (v?: string) => (v ? v.split(',').filter(Boolean) : [])

// StashDB, browsed through flix's mirror: filter by performers, studios and categories or search
// by words, pick scenes, and Get them; the server fetches one scene every few seconds. The second
// tab lists what was fetched and is still waiting for a release, and what is queued.
export function Discover(): JSX.Element {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const on = useStashDbOn()
  const waiting = useWaiting()
  const set = useCallback((patch: Partial<DiscoverSearch>) => navigate({ to: '.', search: (prev: DiscoverSearch) => ({ ...prev, ...patch }), replace: true }), [navigate])
  const nWaiting = waiting.data?.length ?? 0
  return (
    <div className="pb-28">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Discover</h1>
        <div role="tablist" className="ml-auto flex rounded-full bg-raised p-0.5 text-sm">
          {(
            [
              [undefined, 'StashDB'],
              ['waiting', `Waiting${nWaiting ? ` · ${nWaiting}` : ''}`],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={label}
              role="tab"
              aria-selected={search.tab === tab}
              onClick={() => set({ tab })}
              className={clsx('rounded-full px-3 py-1.5 touch:min-h-11', search.tab === tab ? 'bg-white text-black' : 'text-muted hover:text-fg')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {search.tab === 'waiting' ? <Waiting /> : on ? <Catalog search={search} set={set} /> : <Empty>StashDB is not configured on the server.</Empty>}
    </div>
  )
}

function Catalog({ search, set }: { search: DiscoverSearch; set: (p: Partial<DiscoverSearch>) => void }) {
  const filters = useMemo(
    () => ({ q: search.q, performers: ids(search.performers), studios: ids(search.studios), tags: ids(search.tags), sort: search.sort, fresh: search.fresh, unblocked: search.unblocked }),
    [search.q, search.performers, search.studios, search.tags, search.sort, search.fresh, search.unblocked],
  )
  const { data, error, isPending, hasNextPage, fetchNextPage, isFetchingNextPage } = useDiscover(filters)
  // The box follows the URL when it changes elsewhere (back button); typing updates the URL later.
  const [text, setText] = useState(search.q ?? '')
  const [shownQ, setShownQ] = useState(search.q)
  if (shownQ !== search.q) {
    setShownQ(search.q)
    if (text.trim() !== (search.q ?? '')) setText(search.q ?? '') // keep a trailing space being typed
  }
  useEffect(() => {
    const t = setTimeout(() => text.trim() !== (search.q ?? '') && set({ q: text.trim() || undefined }), 500)
    return () => clearTimeout(t)
  }, [text, search.q, set])
  const [picker, setPicker] = useState<Kind | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const getMany = useGetMany()
  const loadMore = useCallback(() => hasNextPage && !isFetchingNextPage && fetchNextPage(), [hasNextPage, isFetchingNextPage, fetchNextPage])

  const items = data?.pages.flatMap((p) => p.items) ?? []
  const first = data?.pages[0]
  const selected = first?.selected ?? []
  const hidden = data?.pages.reduce((n, p) => n + p.hidden, 0) ?? 0
  const vr = data?.pages.reduce((n, p) => n + (p.vr ?? 0), 0) ?? 0
  const inMotion = data?.pages.reduce((n, p) => n + (p.inMotion ?? 0), 0) ?? 0
  const sort = search.sort ?? 'date'
  const hasFilter = filters.performers.length + filters.studios.length + filters.tags.length > 0 || !!filters.q

  const addEntity = (e: DiscoverEntity) => {
    const k = KINDS.find((x) => x.kind === e.kind)!.key
    const cur = ids(search[k])
    if (!cur.includes(e.id)) set({ [k]: [...cur, e.id].slice(0, 10).join(',') })
    setPicker(null)
  }
  const removeEntity = (e: DiscoverEntity) => {
    const k = KINDS.find((x) => x.kind === e.kind)!.key
    set({ [k]: ids(search[k]).filter((x) => x !== e.id).join(',') || undefined })
  }
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else if (n.size < 200) n.add(id)
      return n
    })
  const fetchable = items.filter((w) => canGetState(w.state) && w.stashdbId)
  // "All" leaves out scenes deleted before; a tap on one still picks it.
  const allPick = fetchable.filter((w) => !w.deletedBefore)
  const stopSelecting = () => {
    setSelecting(false)
    setPicked(new Set())
  }
  const submit = () =>
    getMany.mutate([...picked], {
      onSuccess: ({ queued }) => {
        showToast(queued ? `Queued ${queued} scene${queued === 1 ? '' : 's'}; flix fetches one every few seconds` : 'Already queued')
        stopSelecting()
      },
    })

  return (
    <>
      <label className="relative mb-3 block">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          type="search"
          enterKeyHint="search"
          placeholder="Search StashDB scenes"
          className="w-full rounded-full bg-raised py-2.5 pr-4 pl-10 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/60"
        />
      </label>

      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {selected.map((e) => (
          <Chip key={`${e.kind}:${e.id}`} tone="include" onClick={() => removeEntity(e)}>
            {e.name}
            <X size={14} aria-label="Remove" />
          </Chip>
        ))}
        {KINDS.map(({ kind, label, icon: Icon }) => (
          <Chip key={kind} onClick={() => setPicker(kind)}>
            <Plus size={14} />
            <Icon size={14} /> {label}
          </Chip>
        ))}
      </div>

      {selected.length === 1 && <EntityCard e={selected[0]} />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {SORTS.map(([s, label]) => (
          <Chip key={s} tone={sort === s ? 'active' : 'default'} onClick={() => set({ sort: s === 'date' ? undefined : s })}>
            {label}
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <Chip tone={search.fresh ? 'include' : 'default'} onClick={() => set({ fresh: search.fresh ? undefined : true })}>
          Not in motion
        </Chip>
        <Chip tone={search.unblocked ? 'include' : 'default'} onClick={() => set({ unblocked: search.unblocked ? undefined : true })}>
          Show blocked & VR
        </Chip>
        {fetchable.length > 0 && (
          <Button className="ml-auto" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            {selecting ? 'Cancel' : 'Select'}
          </Button>
        )}
      </div>

      {!hasFilter && sort === 'date' && <p className="mb-4 text-sm text-muted">Everything new on StashDB. Add a performer, studio or category, or search, to narrow it.</p>}
      {error ? (
        <ErrorBox error={error} />
      ) : isPending ? (
        <Spinner className="mx-auto my-16" />
      ) : !items.length ? (
        <Empty>Nothing on StashDB matches.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 2xl:grid-cols-5">
            {items.map((w) => (
              <WantedCard
                key={w.stashdbId ?? w.whisparrId}
                scene={w}
                sizes={GRID_SIZES}
                selecting={selecting}
                selected={!!w.stashdbId && picked.has(w.stashdbId)}
                onToggle={() => w.stashdbId && toggle(w.stashdbId)}
              />
            ))}
          </div>
          <Sentinel onVisible={loadMore} disabled={!hasNextPage} />
          {isFetchingNextPage && <Spinner className="mx-auto my-6" />}
          <p className="mt-6 text-center text-xs text-muted">
            {first?.count ? `${first.count.toLocaleString()} scenes` : null}
            {first?.source === 'mirror' ? ' · from flix’s copy of StashDB' : ' · asked StashDB (cached a day)'}
            {hidden ? ` · ${hidden} blocked left out` : ''}
            {vr ? ` · ${vr} VR left out (Settings)` : ''}
            {inMotion ? ` · ${inMotion} owned or on the way left out` : ''}
          </p>
        </>
      )}

      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 flex justify-center px-4 lg:bottom-6">
          <div className="flex w-full max-w-md items-center gap-2 rounded-full bg-black/90 p-2 ring-1 ring-white/15 backdrop-blur">
            <button
              type="button"
              className="rounded-full px-3 py-2 text-sm text-muted hover:text-fg"
              onClick={() => setPicked(new Set(allPick.slice(0, 200).map((w) => w.stashdbId!)))}
            >
              All {Math.min(allPick.length, 200)}
            </button>
            <button
              type="button"
              disabled={!picked.size || getMany.isPending}
              onClick={submit}
              className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Download size={16} /> Get {picked.size || ''}
            </button>
          </div>
        </div>
      )}

      {picker && <Picker kind={picker} onPick={addEntity} onClose={() => setPicker(null)} />}
    </>
  )
}

function EntityCard({ e }: { e: DiscoverEntity }) {
  const lib = e.libraryId && e.kind !== 'tag' ? (e.kind === 'performer' ? `/performer/${e.libraryId}` : `/studio/${e.libraryId}`) : e.libraryId ? `/tag/${e.libraryId}` : null
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-white/5">
      {e.kind === 'performer' ? (
        <Avatar src={e.image} name={e.name} className="size-14 shrink-0" sizes="56px" />
      ) : e.image ? (
        <img src={sized(e.image, 320)} alt="" className="h-12 w-20 shrink-0 rounded-lg bg-white/5 object-contain p-1" />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">
          {e.name}
          {e.disambiguation && <span className="font-normal text-muted"> ({e.disambiguation})</span>}
        </div>
        <div className="truncate text-xs text-muted">{[e.parent, e.sceneCount != null ? `${e.sceneCount.toLocaleString()} scenes on StashDB` : null].filter(Boolean).join(' · ')}</div>
      </div>
      {lib && (
        <Link to={lib} className="shrink-0 rounded-full bg-raised px-3 py-2 text-sm hover:bg-line">
          In library
        </Link>
      )}
    </div>
  )
}

function Picker({ kind, onPick, onClose }: { kind: Kind; onPick: (e: DiscoverEntity) => void; onClose: () => void }) {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 400)
    return () => clearTimeout(t)
  }, [term])
  const { data, isFetching, error } = useDiscoverNames(kind, debounced)
  const label = KINDS.find((k) => k.kind === kind)!.label.toLowerCase()
  return (
    <Sheet title={`Add a ${label}`} onClose={onClose}>
      <div className="min-h-[40dvh] p-4">
      <input
        autoFocus
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        type="search"
        placeholder={`Search StashDB for a ${label}`}
        className="mb-3 w-full rounded-full bg-raised px-4 py-2.5 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/60"
      />
      {error ? <ErrorBox error={error} /> : null}
      {isFetching && <Spinner className="mx-auto my-4" />}
      <ul className="max-h-[55vh] overflow-y-auto">
        {data?.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e)} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-raised">
              {kind === 'tag' ? <Tags size={20} className="shrink-0 text-muted" /> : <Avatar src={e.image} name={e.name} className="size-10 shrink-0" sizes="40px" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {e.name}
                  {e.disambiguation && <span className="text-muted"> ({e.disambiguation})</span>}
                </span>
                <span className="block truncate text-xs text-muted">
                  {[e.parent, e.sceneCount != null ? `${e.sceneCount.toLocaleString()} scenes` : null, e.libraryId ? 'in library' : null].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {debounced.trim().length >= 2 && !isFetching && data?.length === 0 && <p className="py-4 text-center text-sm text-muted">No {label} by that name.</p>}
      </div>
    </Sheet>
  )
}

// What was fetched and still has no file, and what is still queued.
function Waiting() {
  const { data, error, isPending } = useWaiting()
  const run = useRunDiscovery()
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted">Whisparr watches new postings for these; flix searches each again weekly.</p>
        <Button
          disabled={run.isPending}
          onClick={() => run.mutate(undefined, { onSuccess: (r) => showToast(r && typeof r === 'object' && 'queued' in r ? `Found ${(r as { queued: number }).queued} new releases from who you follow` : 'Looked for new releases') })}
        >
          <Sparkles size={16} /> {run.isPending ? 'Looking…' : 'Find new releases'}
        </Button>
      </div>
      {error ? <ErrorBox error={error} /> : isPending ? <Spinner className="mx-auto my-16" /> : !data?.length ? <Empty>Nothing is waiting.</Empty> : (
        <ul className="divide-y divide-white/5">
          {data.map((w) => (
            <WaitingRow key={w.scene.stashdbId ?? w.scene.whisparrId} w={w} />
          ))}
        </ul>
      )}
    </>
  )
}

function WaitingRow({ w }: { w: WaitingScene }) {
  const again = useSearchAgain()
  const giveUp = useGiveUp()
  const cancel = useCancelQueued()
  const s = w.scene
  const queued = s.state === 'queued'
  const status = queued
    ? w.error
      ? `Queue failed: ${w.error}`
      : `Queued ${fmtDate(w.since.slice(0, 10))}`
    : [s.state === 'downloading' ? 'Downloading' : s.state === 'grabbed' ? 'Grabbed' : 'Waiting', `since ${fmtDate(w.since.slice(0, 10))}`, w.searchedAt ? `searched ${fmtDate(w.searchedAt.slice(0, 10))}` : null]
        .filter(Boolean)
        .join(' · ')
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-surface sm:w-36">
        {s.image && <img src={sized(s.image, 320)} alt="" loading="lazy" className="size-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm font-semibold">{s.title}</div>
        <div className="truncate text-xs text-muted">{[fmtDate(s.date), s.studio].filter(Boolean).join(' · ')}</div>
        <div className={clsx('truncate text-xs', w.error ? 'text-red-300' : 'text-muted')}>
          {queued ? null : <Hourglass size={11} className="mr-1 inline" />}
          {status}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
        {queued ? (
          <IconButton label="Remove from the queue" onClick={() => s.stashdbId && cancel.mutate(s.stashdbId)} disabled={cancel.isPending}>
            <X size={18} />
          </IconButton>
        ) : (
          s.whisparrId !== null && (
            <>
              <IconButton label="Search again" onClick={() => again.mutate(s.whisparrId!, { onSuccess: () => showToast('Searching again') })} disabled={again.isPending}>
                <RefreshCw size={18} />
              </IconButton>
              <IconButton label="Give up: stop looking for it" onClick={() => giveUp.mutate(s.whisparrId!, { onSuccess: () => showToast('Stopped looking for it') })} disabled={giveUp.isPending}>
                <Ban size={18} />
              </IconButton>
            </>
          )
        )}
      </div>
    </li>
  )
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: JSX.Element }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="flex size-11 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-fg disabled:opacity-40">
      {children}
    </button>
  )
}
