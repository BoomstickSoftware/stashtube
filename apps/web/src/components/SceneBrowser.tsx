import type { SceneQuery, SceneSort } from '@flix/shared'
import { sceneSorts } from '@flix/shared'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { ArrowDownWideNarrow, CheckCheck, CheckSquare, Pin, Radio, Shuffle, SlidersHorizontal } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useRowMutations, useScenes } from '../lib/api'
import { rowTitle, useQueryParts } from '../lib/describe'
import { withBase } from '../lib/query'
import { stationQuery } from '../lib/station'
import { ActiveFilters, FilterDialog } from './Filters'
import { filterTotal } from '../lib/filters'
import { BulkBar } from './Bulk'
import { SceneCard, SceneCardSkeleton } from './SceneCard'
import { Chip, Empty, ErrorBox, Sentinel, Spinner } from './ui'
import { useClickOutside } from '../lib/hooks'

type Patch = Partial<SceneQuery>

// Scene grid with tube-style filters. `query` is the user's filter state (kept in the
// URL by the page); `base` is fixed by the page, e.g. the performer being viewed.
export function SceneBrowser({
  query,
  onChange,
  base = {},
  defaultSort = 'date',
  alwaysSelecting = false,
  forStation = false,
}: {
  query: SceneQuery
  onChange: (patch: Patch) => void
  base?: SceneQuery
  defaultSort?: SceneSort
  alwaysSelecting?: boolean // cleanup: cards toggle selection from the start, and stay selectable after a bulk action
  forStation?: boolean // the station editor: just the grid (its filters are edited above it)
}) {
  const effective = useMemo(() => withBase(query, base, defaultSort), [query, base, defaultSort])

  const { data, error, isLoading, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useScenes(effective)
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const scenes = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total
  const [selecting, setSelecting] = useState(alwaysSelecting)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (!n.delete(id)) n.add(id)
      return n
    })
  const stopSelecting = () => {
    setSelecting(alwaysSelecting)
    setSelected(new Set())
  }

  return (
    <div>
      {forStation ? (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted">
          {total === undefined ? '…' : `${total.toLocaleString()} video${total === 1 ? '' : 's'} match`}
          {isFetching && !isFetchingNextPage && <Spinner className="size-3 border" />}
        </div>
      ) : (
        <FilterBar
          query={query}
          effective={effective}
          countQuery={(d) => withBase({ ...query, ...d }, base, defaultSort)}
          onChange={onChange}
          total={total}
          busy={isFetching && !isFetchingNextPage}
          defaultSort={defaultSort}
          selecting={selecting}
          onSelecting={alwaysSelecting ? undefined : () => (selecting ? stopSelecting() : setSelecting(true))}
          onSelectAll={selecting ? () => setSelected(new Set(scenes.map((s) => s.id))) : undefined}
        />
      )}
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Grid>
          {Array.from({ length: 12 }, (_, i) => (
            <SceneCardSkeleton key={i} />
          ))}
        </Grid>
      ) : scenes.length === 0 ? (
        <Empty>Nothing matches these filters.</Empty>
      ) : (
        <>
          <Grid>
            {scenes.map((s) => (
              <SceneCard
                key={s.id}
                scene={s}
                select={selecting ? { selected: selected.has(s.id), onToggle: () => toggle(s.id) } : undefined}
              />
            ))}
          </Grid>
          <Sentinel onVisible={loadMore} disabled={!hasNextPage} />
          {isFetchingNextPage && <Spinner className="mx-auto my-8" />}
        </>
      )}
      {selecting && (
        <BulkBar ids={[...selected]} titleOf={(id) => scenes.find((s) => s.id === id)?.title ?? `Scene ${id}`} onClear={stopSelecting} />
      )}
    </div>
  )
}

export function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {children}
    </div>
  )
}

// One row: Filters (opens the dialog), sort, and the list's actions; under it the filters in
// play as removable chips, and the count. Nothing here scrolls sideways, so popovers are never clipped.
// Pinned while scrolling on wider screens only: on a phone it wraps to a third of the screen.
function FilterBar({
  query,
  effective,
  countQuery,
  onChange,
  total,
  busy,
  defaultSort,
  selecting,
  onSelecting,
  onSelectAll,
}: {
  query: SceneQuery
  effective: SceneQuery
  countQuery: (draft: SceneQuery) => SceneQuery
  onChange: (p: Patch) => void
  total?: number
  busy: boolean
  defaultSort: SceneSort
  selecting: boolean
  onSelecting?: () => void // undefined: selection is always on
  onSelectAll?: () => void // selects every loaded video
}) {
  const [open, setOpen] = useState(false)
  const sort = query.sort ?? defaultSort
  const n = filterTotal(query)

  return (
    <div className="z-20 -mx-4 mb-6 border-b sm:sticky sm:top-16 border-white/5 bg-bg/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={clsx(
            'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
            n ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-white text-black hover:bg-white/90',
          )}
        >
          <SlidersHorizontal size={15} /> Filters
          {n > 0 && <span className="rounded-full bg-white/25 px-1.5 text-xs tabular-nums">{n}</span>}
        </button>
        <label className="relative flex items-center gap-2 rounded-full bg-raised py-1.5 pr-3 pl-3 text-[13px] hover:bg-line">
          <ArrowDownWideNarrow size={15} className="text-muted" />
          <select
            value={sort}
            aria-label="Sort"
            onChange={(e) => {
              const s = e.target.value as SceneSort
              onChange({ sort: s, seed: s === 'random' ? Math.floor(Math.random() * 1e6) + 1 : undefined, dir: undefined })
            }}
            className="appearance-none bg-transparent pr-1 outline-none"
          >
            {Object.entries(sceneSorts).map(([k, label]) => (
              <option key={k} value={k} className="bg-surface">
                {label}
              </option>
            ))}
          </select>
        </label>
        {sort === 'random' && (
          <Chip onClick={() => onChange({ seed: Math.floor(Math.random() * 1e6) + 1 })}>
            <Shuffle size={14} /> Reshuffle
          </Chip>
        )}
        <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {onSelecting && (
            <Chip tone={selecting ? 'active' : 'default'} onClick={onSelecting}>
              <CheckSquare size={14} /> {selecting ? 'Done' : 'Select'}
            </Chip>
          )}
          {onSelectAll && (
            <Chip onClick={onSelectAll}>
              <CheckCheck size={14} /> Select all loaded
            </Chip>
          )}
          <PinButton query={effective} />
          <Link to="/station" search={stationQuery(effective)}>
            <Chip>
              <Radio size={14} /> Station
            </Chip>
          </Link>
        </span>
      </div>

      <ActiveFilters query={query} onChange={onChange} className="mt-2.5" />

      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        {total === undefined ? '…' : `${total.toLocaleString()} video${total === 1 ? '' : 's'}`}
        {busy && <Spinner className="size-3 border" />}
      </div>

      {open && <FilterDialog query={query} countQuery={countQuery} onApply={onChange} onClose={() => setOpen(false)} />}
    </div>
  )
}

function PinButton({ query }: { query: SceneQuery }) {
  const parts = useQueryParts(query)
  const describe = () => rowTitle(query, parts)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [pinned, setPinned] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  const { pin } = useRowMutations()
  return (
    <div ref={ref} className="relative shrink-0">
      <Chip
        tone={open ? 'active' : 'default'}
        onClick={() => {
          setTitle(describe())
          setPinned(false)
          setOpen((v) => !v)
        }}
      >
        <Pin size={14} /> Pin to home
      </Chip>
      {open && (
        <form
          className="fixed top-32 right-4 z-50 w-80 rounded-2xl bg-surface p-3 shadow-2xl ring-1 ring-line sm:absolute sm:top-10 sm:right-0"
          onSubmit={(e) => {
            e.preventDefault()
            const { seed: _seed, ...q } = query // pinned random rows reshuffle daily
            pin.mutate({ title: title.trim() || describe(), query: q }, { onSuccess: () => setPinned(true) })
          }}
        >
          <div className="mb-2 text-xs text-muted">Show these filters as a row on the home page</div>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className="w-full rounded-lg bg-raised px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
          />
          <button type="submit" disabled={pinned} className="mt-2 w-full rounded-lg bg-accent py-2 text-sm font-semibold hover:bg-accent-hover disabled:bg-raised">
            {pinned ? 'Pinned ✓' : 'Pin row'}
          </button>
        </form>
      )}
    </div>
  )
}
