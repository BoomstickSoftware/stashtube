import type { JSX } from 'react'
// Index pages: performers, studios, tags.
import { type Page, performerSorts, type PerformerGender, type PerformerSort, type StudioCard, type TagTile } from '@flix/shared'
import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { Building2, ChevronDown, ChevronUp, Heart, LayoutGrid, Network, Pin, Search, Star, Table as TableIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Avatar, Chip, Empty, ErrorBox, Sentinel, Spinner } from '../components/ui'
import { useDebounced } from '../lib/hooks'
import { oneOf, useStored } from '../lib/storage'
import { useFavoritePerformer, useFavoriteStudio, useFavoriteTag, usePerformers, useStudios, useTagTiles } from '../lib/api'
import { sized, srcSet } from '@flix/shared'

function Filter({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-10 w-full max-w-xs items-center gap-2 rounded-full bg-raised px-4 ring-1 ring-white/5 focus-within:ring-accent/60">
      <Search size={16} className="text-muted" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
    </label>
  )
}

type PerfSearch = { q?: string; sort?: string; favorites?: boolean }
const perfRoute = getRouteApi('/performers')

export function Performers(): JSX.Element {
  const search = perfRoute.useSearch()
  const navigate = perfRoute.useNavigate()
  const [q, setQ] = useState(search.q ?? '')
  const dq = useDebounced(q, 200)
  const sort = (search.sort ?? 'scenes_count') as PerformerSort
  // This page's own choice, kept per browser; it steers nothing else (gender-switch-performers-page-only)
  const [gender, setGender] = useStored<PerformerGender>('flix.performers.gender', oneOf(['women', 'men', 'all'], 'women'))
  const fav = useFavoritePerformer()
  const { data, error, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = usePerformers({
    q: dq || undefined,
    sort,
    favorites: search.favorites,
    seed: sort === 'random' ? 7 : undefined,
    gender,
  })
  const more = useCallback(() => hasNextPage && !isFetchingNextPage && fetchNextPage(), [hasNextPage, isFetchingNextPage, fetchNextPage])
  const items = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-2xl font-black">Performers</h1>
        <Filter value={q} onChange={setQ} placeholder="Filter performers" />
        <GenderSwitch value={gender} onChange={setGender} />
        <div className="no-scrollbar flex gap-2 overflow-x-auto pr-8 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]">
          {Object.entries(performerSorts).map(([k, label]) => (
            <Chip key={k} tone={sort === k ? 'active' : 'default'} onClick={() => navigate({ to: ".", search: (s: PerfSearch) => ({ ...s, sort: k }), replace: true })}>
              {label}
            </Chip>
          ))}
          <Chip tone={search.favorites ? 'active' : 'default'} onClick={() => navigate({ to: ".", search: (s: PerfSearch) => ({ ...s, favorites: s.favorites ? undefined : true }), replace: true })}>
            <Heart size={13} /> Following
          </Chip>
        </div>
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Spinner className="mx-auto mt-24" />
      ) : !items.length ? (
        <Empty>No performers.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
          {items.map((p) => (
            <Link key={p.id} to="/performer/$id" params={{ id: p.id }} className="group">
              <div className="relative overflow-hidden rounded-2xl ring-1 ring-white/5">
                <Avatar src={p.image} name={p.name} sizes="(min-width: 640px) 20vw, 50vw" className="aspect-[3/4] w-full object-top text-4xl transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-10">
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="flex items-center gap-2 text-xs text-white/70">
                    {p.sceneCount} videos
                    {p.rating && (
                      <span className="flex items-center gap-0.5 text-star">
                        <Star size={11} className="fill-star" /> {p.rating}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault() // the tile is a link
                    fav.mutate({ id: p.id, favorite: !p.favorite })
                  }}
                  title={p.favorite ? 'Unfollow' : 'Follow'}
                  aria-label={p.favorite ? `Unfollow ${p.name}` : `Follow ${p.name}`}
                  aria-pressed={p.favorite}
                  className={clsx(
                    'absolute top-2 right-2 rounded-full bg-black/40 p-1.5 backdrop-blur transition hover:scale-110 hover:bg-black/60',
                    !p.favorite && '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100',
                  )}
                >
                  <Heart size={18} className={p.favorite ? 'fill-accent text-accent' : 'text-white'} />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Sentinel onVisible={more} disabled={!hasNextPage} />
      {isFetchingNextPage && <Spinner className="mx-auto my-8" />}
    </div>
  )
}

const genders: [PerformerGender, string][] = [
  ['women', 'Women'],
  ['men', 'Men'],
  ['all', 'Everyone'],
]

// Remembered by this browser (localStorage), so the list opens the same way next time. It
// filters this directory only: Home, Stats, search and the People filters show everyone
// (_until 2026-10-31 it was a flix setting they all followed_).
function GenderSwitch({ value, onChange }: { value: PerformerGender; onChange: (g: PerformerGender) => void }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div role="radiogroup" aria-label="Show performers" className="flex rounded-full bg-raised p-0.5 text-[13px]">
        {genders.map(([g, label]) => (
          <button
            key={g}
            role="radio"
            aria-checked={value === g}
            onClick={() => onChange(g)}
            className={clsx('rounded-full px-3 py-1 transition-colors', value === g ? 'bg-white text-black' : 'text-muted hover:text-fg')}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="text-[11px] leading-none text-muted">Only this page</span>
    </div>
  )
}

type StudioView = 'networks' | 'grid' | 'table'
type StudioSort = 'videos' | 'name'
interface StudioPrefs {
  view: StudioView
  sort: StudioSort
  dir: 'asc' | 'desc'
  following: boolean
}
const STUDIO_KEY = 'flix:studios'
const parseStudioPrefs = (raw: unknown): StudioPrefs => {
  const p = (raw ?? {}) as Partial<StudioPrefs>
  return {
    view: ['networks', 'grid', 'table'].includes(p.view!) ? p.view! : 'networks',
    sort: p.sort === 'name' ? 'name' : 'videos',
    dir: p.dir === 'asc' ? 'asc' : p.dir === 'desc' ? 'desc' : p.sort === 'name' ? 'asc' : 'desc',
    following: !!p.following,
  }
}

// Three views, remembered per browser. Networks: each network (a studio with sub-studios) heads
// its own row, with a tile for its combined feed first; studios without a network share one grid
// at the end (a text filter shows the flat grid). Grid and Table: every studio, sorted.
export function Studios(): JSX.Element {
  const [q, setQ] = useState('')
  const [prefs, setPrefsState] = useStored(STUDIO_KEY, parseStudioPrefs)
  const setPrefs = (patch: Partial<StudioPrefs>) => setPrefsState((p) => ({ ...p, ...patch }))
  const dq = useDebounced(q, 200)
  const fav = useFavoriteStudio()
  const qc = useQueryClient()
  const { data, error, isLoading } = useStudios({ q: dq || undefined })
  const all = useMemo(() => {
    const items = (data?.items ?? []).filter((s) => !prefs.following || s.favorite)
    const k = prefs.dir === 'asc' ? 1 : -1
    return [...items].sort((a, b) =>
      prefs.sort === 'name' ? k * a.name.localeCompare(b.name) : k * (a.sceneCount - b.sceneCount) || a.name.localeCompare(b.name),
    )
  }, [data, prefs.following, prefs.sort, prefs.dir])
  const groups = useMemo(() => {
    const items = data?.items ?? []
    const byId = new Map(items.map((s) => [s.id, s]))
    const families = new Map<string, { head: StudioCard | null; name: string; members: StudioCard[] }>()
    const solo: StudioCard[] = []
    for (const s of items) {
      const hasChildren = items.some((c) => c.parent?.id === s.id)
      if (!s.parent && !hasChildren) solo.push(s)
      if (!s.parent) continue
      const f = families.get(s.parent.id) ?? { head: byId.get(s.parent.id) ?? null, name: s.parent.name, members: [] }
      f.members.push(s)
      families.set(s.parent.id, f)
    }
    const count = (f: { head: StudioCard | null; members: StudioCard[] }) => f.head?.sceneCount ?? f.members.reduce((n, m) => n + m.sceneCount, 0)
    // Following: a network stays when its head or any member is followed, showing those only
    const keep = (s: StudioCard) => !prefs.following || s.favorite
    const shown = [...families.entries()]
      .map(([id, f]) => [id, { ...f, head: f.head && (keep(f.head) || f.members.some(keep)) ? f.head : null, members: f.members.filter(keep) }] as const)
      .filter(([, f]) => f.head || f.members.length)
    return { families: shown.sort((a, b) => count(b[1]) - count(a[1])), solo: solo.filter(keep), count }
  }, [data, prefs.following])
  const view = prefs.view === 'networks' && dq ? 'grid' : prefs.view
  const views: [StudioView, string, typeof Network][] = [
    ['networks', 'Networks', Network],
    ['grid', 'Grid', LayoutGrid],
    ['table', 'Table', TableIcon],
  ]

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-4 text-2xl font-black">Studios</h1>
        <Filter value={q} onChange={setQ} placeholder="Filter studios" />
        <div role="radiogroup" aria-label="View" className="flex rounded-full bg-raised p-0.5 text-[13px]">
          {views.map(([v, label, Icon]) => (
            <button
              key={v}
              role="radio"
              aria-checked={prefs.view === v}
              onClick={() => setPrefs({ view: v })}
              className={clsx(
                'flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors touch:py-1.5',
                prefs.view === v ? 'bg-white text-black' : 'text-muted hover:text-fg',
              )}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        {view !== 'networks' && (
          <>
            <Chip tone={prefs.sort === 'videos' ? 'active' : 'default'} onClick={() => setPrefs({ sort: 'videos', dir: 'desc' })}>
              Most videos
            </Chip>
            <Chip tone={prefs.sort === 'name' ? 'active' : 'default'} onClick={() => setPrefs({ sort: 'name', dir: 'asc' })}>
              Name
            </Chip>
          </>
        )}
        <Chip tone={prefs.following ? 'active' : 'default'} onClick={() => setPrefs({ following: !prefs.following })}>
          <Heart size={13} /> Following
        </Chip>
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Spinner className="mx-auto mt-24" />
      ) : !all.length ? (
        <Empty>{prefs.following ? 'No followed studios.' : 'No studios.'}</Empty>
      ) : view === 'networks' ? (
        <div className="space-y-10">
          {groups.families.map(([id, f]) => (
            <section key={id}>
              <h2 className="mb-3 flex items-baseline gap-2 text-lg font-bold">
                <Link to="/studio/$id" params={{ id }} className="hover:text-accent">
                  {f.name}
                </Link>
                <span className="text-sm font-normal text-muted">{groups.count(f)} videos</span>
              </h2>
              <StudioGrid>
                {f.head && <StudioTile s={f.head} label={`All of ${f.name}`} />}
                {f.members.map((s) => (
                  <StudioTile key={s.id} s={s} />
                ))}
              </StudioGrid>
            </section>
          ))}
          {groups.solo.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold">Independent</h2>
              <StudioGrid>
                {groups.solo.map((s) => (
                  <StudioTile key={s.id} s={s} />
                ))}
              </StudioGrid>
            </section>
          )}
        </div>
      ) : view === 'grid' ? (
        <StudioGrid>
          {all.map((s) => (
            <StudioTile key={s.id} s={s} showParent />
          ))}
        </StudioGrid>
      ) : (
        <StudioTable
          items={all}
          sort={prefs.sort}
          dir={prefs.dir}
          onSort={(sort) => setPrefs(sort === prefs.sort ? { dir: prefs.dir === 'asc' ? 'desc' : 'asc' } : { sort, dir: sort === 'name' ? 'asc' : 'desc' })}
          onFavorite={(s) => {
            // the hook updates the studio page's cache; the list here is patched and refetched
            qc.setQueriesData<Page<StudioCard>>({ queryKey: ['studios'] }, (d) =>
              d && { ...d, items: d.items.map((x) => (x.id === s.id ? { ...x, favorite: !s.favorite } : x)) },
            )
            fav.mutate({ id: s.id, favorite: !s.favorite }, { onSettled: () => qc.invalidateQueries({ queryKey: ['studios'] }) })
          }}
        />
      )}
    </div>
  )
}

function StudioTable({
  items,
  sort,
  dir,
  onSort,
  onFavorite,
}: {
  items: StudioCard[]
  sort: StudioSort
  dir: 'asc' | 'desc'
  onSort: (s: StudioSort) => void
  onFavorite: (s: StudioCard) => void
}) {
  const head = (key: StudioSort, label: string, className?: string) => (
    <button onClick={() => onSort(key)} className={clsx('flex items-center gap-1 hover:text-fg', sort === key && 'text-fg', className)}>
      {label}
      {sort === key && (dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
    </button>
  )
  const cols = 'grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem_2.5rem] items-center gap-3 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,14rem)_5rem_2.5rem]'
  return (
    <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-white/5">
      <div className={clsx(cols, 'border-b border-line px-3 py-2 text-xs font-semibold tracking-wider text-muted uppercase')}>
        <span />
        {head('name', 'Studio')}
        <span className="hidden sm:block">Network</span>
        {head('videos', 'Videos', 'justify-end')}
        <span />
      </div>
      {items.map((s) => (
        <div key={s.id} className={clsx(cols, 'border-b border-line/50 px-3 py-1.5 last:border-0 hover:bg-raised')}>
          <Link to="/studio/$id" params={{ id: s.id }} className="flex h-9 items-center justify-center sm:h-11">
            {s.image ? (
              <img src={sized(s.image, 320)} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
            ) : (
              <Building2 size={18} className="text-muted" />
            )}
          </Link>
          <Link to="/studio/$id" params={{ id: s.id }} className="min-w-0">
            <span className="block truncate font-semibold hover:text-accent">{s.name}</span>
            {s.parent && <span className="block truncate text-xs text-muted sm:hidden">{s.parent.name}</span>}
          </Link>
          <span className="hidden min-w-0 truncate text-sm text-muted sm:block">
            {s.parent && (
              <Link to="/studio/$id" params={{ id: s.parent.id }} className="hover:text-accent">
                {s.parent.name}
              </Link>
            )}
          </span>
          <span className="text-right text-sm text-muted tabular-nums">{s.sceneCount}</span>
          <button
            onClick={() => onFavorite(s)}
            title={s.favorite ? 'Unfollow' : 'Follow'}
            aria-label={s.favorite ? `Unfollow ${s.name}` : `Follow ${s.name}`}
            aria-pressed={s.favorite}
            className="flex size-9 items-center justify-center rounded-full hover:bg-line"
          >
            <Heart size={16} className={s.favorite ? 'fill-accent text-accent' : 'text-muted'} />
          </button>
        </div>
      ))}
    </div>
  )
}

function StudioGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">{children}</div>
}

function StudioTile({ s, label, showParent }: { s: StudioCard; label?: string; showParent?: boolean }) {
  return (
    <Link
      to="/studio/$id"
      params={{ id: s.id }}
      className={clsx('group min-w-0 rounded-2xl bg-surface p-3 ring-1 transition hover:bg-raised', label ? 'ring-accent/40' : 'ring-white/5')}
    >
      <div className="flex aspect-[2/1] items-center justify-center rounded-xl p-4">
        {s.image ? (
          <img src={sized(s.image, 320)} alt={s.name} loading="lazy" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-center text-lg font-black break-words">{s.name}</span>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-2 px-1">
        <span className="truncate font-semibold">{label ?? s.name}</span>
        {s.favorite && <Heart size={14} className="shrink-0 fill-accent text-accent" />}
        <span className="ml-auto shrink-0 text-xs text-muted">{s.sceneCount}</span>
      </div>
      {showParent && s.parent && <div className="truncate px-1 text-xs text-muted">{s.parent.name}</div>}
    </Link>
  )
}

export function Tags(): JSX.Element {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'popular' | 'name'>('popular')
  const { data, error, isLoading } = useTagTiles()
  const pin = useFavoriteTag()
  const tiles = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = (data ?? []).filter((t) => !needle || t.name.toLowerCase().includes(needle))
    return sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list
  }, [data, q, sort])
  const pinned = tiles.filter((t) => t.favorite)
  // Big tiles for the categories that matter; the long tail as a compact grid.
  const FEATURED = 24
  const featured = sort === 'popular' && !q ? tiles.filter((t) => !t.favorite).slice(0, FEATURED) : []
  const rest = featured.length ? tiles.filter((t) => !t.favorite && !featured.includes(t)) : tiles.filter((t) => !t.favorite)
  const onPin = (t: TagTile) => pin.mutate({ id: t.id, favorite: !t.favorite })

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-4 text-2xl font-black">Categories</h1>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Filter value={q} onChange={setQ} placeholder="Filter categories" />
          <Chip tone={sort === 'popular' ? 'active' : 'default'} onClick={() => setSort('popular')}>
            Popular
          </Chip>
          <Chip tone={sort === 'name' ? 'active' : 'default'} onClick={() => setSort('name')}>
            A–Z
          </Chip>
        </div>
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Spinner className="mx-auto mt-24" />
      ) : !tiles.length ? (
        <Empty>No tags match.</Empty>
      ) : (
        <>
          {pinned.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
                <Pin size={16} className="fill-accent text-accent" /> Pinned
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                {pinned.map((t) => (
                  <TagTileCard key={t.id} tile={t} big onPin={onPin} />
                ))}
              </div>
            </section>
          )}
          {featured.length > 0 && (
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {featured.map((t) => (
                <TagTileCard key={t.id} tile={t} big onPin={onPin} />
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
            {rest.map((t) => (
              <TagTileCard key={t.id} tile={t} onPin={onPin} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TagTileCard({ tile, big, onPin }: { tile: TagTile; big?: boolean; onPin: (t: TagTile) => void }) {
  return (
    <Link
      to="/tag/$id"
      params={{ id: tile.id }}
      className={clsx('group relative block overflow-hidden rounded-xl bg-surface ring-1', tile.favorite ? 'ring-accent/40' : 'ring-white/5', big ? 'aspect-video' : 'aspect-[16/7]')}
    >
      {tile.image && (
        <img
          src={sized(tile.image, 640)}
          srcSet={srcSet(tile.image)}
          sizes={big ? '(min-width: 1536px) 16vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw' : '(min-width: 1536px) 12.5vw, (min-width: 1024px) 16vw, (min-width: 640px) 25vw, 50vw'}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover opacity-70 transition duration-500 group-hover:scale-105 group-hover:opacity-90"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      <div className={clsx('absolute inset-x-0 bottom-0', big ? 'p-3' : 'px-2.5 py-1.5')}>
        <div className={clsx('truncate font-bold', big ? 'text-base' : 'text-[13px]', !big && 'pr-6 touch:pr-8')}>{tile.name}</div>
        <div className="text-[11px] text-white/70">{tile.sceneCount} videos</div>
      </div>
      <button
        onClick={(e) => {
          e.preventDefault() // the tile is a link
          onPin(tile)
        }}
        title={tile.favorite ? 'Unpin' : 'Pin to the top'}
        aria-label={tile.favorite ? `Unpin ${tile.name}` : `Pin ${tile.name}`}
        aria-pressed={tile.favorite}
        className={clsx(
          'absolute right-1.5 rounded-full bg-black/40 backdrop-blur transition hover:scale-110 hover:bg-black/60',
          big ? 'top-1.5 p-1.5' : 'top-1/2 -translate-y-1/2 p-1 touch:p-1.5',
          !tile.favorite && '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100',
        )}
      >
        <Pin size={big ? 16 : 13} className={tile.favorite ? 'fill-accent text-accent' : 'text-white'} />
      </button>
    </Link>
  )
}
