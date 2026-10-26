import type { JSX } from 'react'
// Index pages: performers, studios, tags.
import { performerSorts, type PerformerGender, type PerformerSort, type TagTile } from '@flix/shared'
import { getRouteApi, Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { Heart, Search, Star } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Avatar, Chip, Empty, ErrorBox, Sentinel, Spinner, useDebounced } from '../components/ui'
import { useFavoritePerformer, usePerformers, useSettings, useStudios, useTagTiles, useUpdateSettings } from '../lib/api'

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
  const { data: settings } = useSettings()
  const saveSettings = useUpdateSettings()
  const gender = settings?.performerGender ?? 'women'
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
        <GenderSwitch value={gender} onChange={(g) => saveSettings.mutate({ performerGender: g })} />
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
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
                <Avatar src={p.image} name={p.name} className="aspect-[3/4] w-full object-top text-4xl transition-transform duration-500 group-hover:scale-105" />
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

// Remembered by flix (settings), so the list opens the same way next time; search
// suggestions follow it too.
function GenderSwitch({ value, onChange }: { value: PerformerGender; onChange: (g: PerformerGender) => void }) {
  return (
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
  )
}

export function Studios(): JSX.Element {
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 200)
  const { data, error, isLoading } = useStudios({ q: dq || undefined })
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-4 text-2xl font-black">Studios</h1>
        <Filter value={q} onChange={setQ} placeholder="Filter studios" />
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Spinner className="mx-auto mt-24" />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
          {data?.items.map((s) => (
            <Link key={s.id} to="/studio/$id" params={{ id: s.id }} className="group rounded-2xl bg-surface p-3 ring-1 ring-white/5 transition hover:bg-raised">
              <div className="flex aspect-[2/1] items-center justify-center rounded-xl p-4">
                {s.image ? <img src={s.image} alt={s.name} loading="lazy" className="max-h-full max-w-full object-contain" /> : <span className="text-lg font-black">{s.name}</span>}
              </div>
              <div className="mt-2.5 flex items-center gap-2 px-1">
                <span className="truncate font-semibold">{s.name}</span>
                {s.favorite && <Heart size={14} className="shrink-0 fill-accent text-accent" />}
                <span className="ml-auto shrink-0 text-xs text-muted">{s.sceneCount}</span>
              </div>
              {s.parent && <div className="truncate px-1 text-xs text-muted">{s.parent.name}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function Tags(): JSX.Element {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'popular' | 'name'>('popular')
  const { data, error, isLoading } = useTagTiles()
  const tiles = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = (data ?? []).filter((t) => !needle || t.name.toLowerCase().includes(needle))
    return sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list
  }, [data, q, sort])
  // Big tiles for the categories that matter; the long tail as a compact grid.
  const FEATURED = 24
  const featured = sort === 'popular' && !q ? tiles.slice(0, FEATURED) : []
  const rest = featured.length ? tiles.slice(FEATURED) : tiles

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-4 text-2xl font-black">Categories</h1>
        <Filter value={q} onChange={setQ} placeholder="Filter tags" />
        <Chip tone={sort === 'popular' ? 'active' : 'default'} onClick={() => setSort('popular')}>
          Popular
        </Chip>
        <Chip tone={sort === 'name' ? 'active' : 'default'} onClick={() => setSort('name')}>
          A–Z
        </Chip>
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Spinner className="mx-auto mt-24" />
      ) : !tiles.length ? (
        <Empty>No tags match.</Empty>
      ) : (
        <>
          {featured.length > 0 && (
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {featured.map((t) => (
                <TagTileCard key={t.id} tile={t} big />
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
            {rest.map((t) => (
              <TagTileCard key={t.id} tile={t} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TagTileCard({ tile, big }: { tile: TagTile; big?: boolean }) {
  return (
    <Link
      to="/tag/$id"
      params={{ id: tile.id }}
      className={clsx('group relative block overflow-hidden rounded-xl bg-surface ring-1 ring-white/5', big ? 'aspect-video' : 'aspect-[16/7]')}
    >
      {tile.image && (
        <img
          src={tile.image}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover opacity-70 transition duration-500 group-hover:scale-105 group-hover:opacity-90"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      <div className={clsx('absolute inset-x-0 bottom-0', big ? 'p-3' : 'px-2.5 py-1.5')}>
        <div className={clsx('truncate font-bold', big ? 'text-base' : 'text-[13px]')}>{tile.name}</div>
        <div className="text-[11px] text-white/70">{tile.sceneCount} videos</div>
      </div>
    </Link>
  )
}
