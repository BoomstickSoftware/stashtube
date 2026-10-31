import type { SceneCard as SceneCardType, SceneQuery, SceneSort } from '@flix/shared'
import { sceneSorts } from '@flix/shared'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { MoreHorizontal, ArrowDownWideNarrow, CheckCheck, CheckSquare, Pin, Radio, Shuffle, SlidersHorizontal, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../lib/hooks'
import { Sheet } from './Sheet'
import { useRowMutations, useScenes, useSettings } from '../lib/api'
import { rowTitle, useQueryParts } from '../lib/describe'
import { ageLabel, withBase } from '../lib/query'
import { stationQuery } from '../lib/station'
import { ActiveFilters, FilterDialog } from './Filters'
import { clearAll, filterTotal } from '../lib/filters'
import { BulkBar } from './Bulk'
import { SceneCard, SceneCardSkeleton } from './SceneCard'
import { Button, Chip, Empty, ErrorBox, Sentinel, Spinner } from './ui'
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
  cardMeta,
  omitPerformer,
}: {
  query: SceneQuery
  onChange: (patch: Patch) => void
  base?: SceneQuery
  defaultSort?: SceneSort
  alwaysSelecting?: boolean // cleanup: cards toggle selection from the start, and stay selectable after a bulk action
  forStation?: boolean // the station editor: just the grid (its filters are edited above it)
  cardMeta?: (s: SceneCardType) => string | null // one more fact per card, e.g. a performer's age at filming
  omitPerformer?: string // a performer page: leave its own name off every card
}) {
  const effective = useMemo(() => withBase(query, base, defaultSort), [query, base, defaultSort])

  const { data, error, isLoading, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useScenes(effective)
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // memoised, and the card props below are stable, so a page append re-renders only the new cards
  const scenes = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const total = data?.pages[0]?.total
  const [selecting, setSelecting] = useState(alwaysSelecting)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  // Shift+click selects from the last card clicked up to this one; Cmd/Ctrl+A selects everything loaded
  const anchor = useRef<string | null>(null)
  const toggle = useCallback(
    (id: string, range: boolean) =>
      setSelected((s) => {
        const n = new Set(s)
        const from = range ? scenes.findIndex((x) => x.id === anchor.current) : -1
        const to = scenes.findIndex((x) => x.id === id)
        if (from >= 0 && to >= 0) for (const x of scenes.slice(Math.min(from, to), Math.max(from, to) + 1)) n.add(x.id)
        else if (!n.delete(id)) n.add(id)
        anchor.current = id
        return n
      }),
    [scenes],
  )
  useEffect(() => {
    if (!selecting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'a' || !(e.metaKey || e.ctrlKey) || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      setSelected(new Set(scenes.map((x) => x.id)))
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [selecting, scenes])
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
        <Empty>
          Nothing matches these filters.
          {filterTotal(query) > 0 && (
            <div className="mt-4">
              <Button onClick={() => onChange(clearAll)}>Clear filters</Button>
            </div>
          )}
        </Empty>
      ) : (
        <>
          <Grid>
            {scenes.map((s) => (
              <SceneCard
                key={s.id}
                scene={s}
                selecting={selecting}
                selected={selecting ? selected.has(s.id) : undefined}
                onToggle={toggle}
                extra={cardMeta?.(s)}
                omitPerformer={omitPerformer}
              />
            ))}
          </Grid>
          <Sentinel onVisible={loadMore} disabled={!hasNextPage} />
          {isFetchingNextPage && <Spinner className="mx-auto my-8" />}
        </>
      )}
      {selecting && (
        <BulkBar
          ids={[...selected]}
          infoOf={(id) => {
            const s = scenes.find((x) => x.id === id)
            return { title: s?.title ?? `Scene ${id}`, size: s?.size ?? 0 }
          }}
          onClear={stopSelecting}
        />
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
  const [more, setMore] = useState(false) // the phone's "More" sheet with the list's actions
  const sort = query.sort ?? defaultSort
  const n = filterTotal(query)

  return (
    <div className="z-20 -mx-4 mb-6 border-b sm:sticky sm:top-16 border-white/5 bg-bg/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
      {/* one row on a phone (it scrolls sideways; the list's actions sit behind "More"), wrapping from sm */}
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={clsx(
            'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors touch:py-2.5',
            n ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-white text-black hover:bg-white/90',
          )}
        >
          <SlidersHorizontal size={15} /> Filters
          {n > 0 && <span className="rounded-full bg-white/25 px-1.5 text-xs tabular-nums">{n}</span>}
        </button>
        <label className="relative flex items-center gap-2 rounded-full bg-raised py-1.5 pr-3 pl-3 text-[13px] hover:bg-line focus-within:ring-1 focus-within:ring-accent touch:py-2.5">
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
        <span className="shrink-0 text-xs text-muted sm:hidden">{total === undefined ? '…' : `${total.toLocaleString()} video${total === 1 ? '' : 's'}`}</span>
        <Chip className="ml-auto shrink-0 sm:hidden" onClick={() => setMore(true)}>
          <MoreHorizontal size={14} /> More
        </Chip>
        <span className="hidden flex-wrap items-center gap-2 sm:ml-auto sm:flex">
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
      <PeopleDefaultsChip query={effective} className="mt-2.5" />

      <div className="mt-2 hidden items-center gap-2 text-xs text-muted sm:flex">
        {total === undefined ? '…' : `${total.toLocaleString()} video${total === 1 ? '' : 's'}`}
        {busy && <Spinner className="size-3 border" />}
      </div>
      {more && (
        <Sheet title="This list" onClose={() => setMore(false)}>
          <div className="flex flex-wrap gap-2 p-4">
            {onSelecting && (
              <Chip
                tone={selecting ? 'active' : 'default'}
                onClick={() => {
                  onSelecting()
                  setMore(false)
                }}
              >
                <CheckSquare size={14} /> {selecting ? 'Done' : 'Select'}
              </Chip>
            )}
            {onSelectAll && (
              <Chip
                onClick={() => {
                  onSelectAll()
                  setMore(false)
                }}
              >
                <CheckCheck size={14} /> Select all loaded
              </Chip>
            )}
            <PinButton query={effective} />
            <Link to="/station" search={stationQuery(effective)}>
              <Chip>
                <Radio size={14} /> Station
              </Chip>
            </Link>
          </div>
        </Sheet>
      )}

      {open && <FilterDialog query={query} countQuery={countQuery} onApply={onChange} onClose={() => setOpen(false)} />}
    </div>
  )
}

// Settings › Feed › Performer preferences (age, ethnicity) shorten every list without showing
// in its filters, so a short list looked unexplained; when they apply to this one, a dim chip
// says so and leads to the setting. They do not apply when the list has its own People filter
// or shows blocked videos (the server's rule, blocklist-and-exclusions).
function PeopleDefaultsChip({ query, className }: { query: SceneQuery; className?: string }) {
  const { data: settings } = useSettings()
  const p = settings?.people
  const set = !!p && !!(p.minAge || p.maxAge || p.ethnicities?.length)
  const applies = set && !(query.minAge || query.maxAge || query.ethnicities) && !query.unblocked
  if (!applies) return null
  const label = [ageLabel(p.minAge, p.maxAge), p.ethnicities?.length ? p.ethnicities.join(', ') : null].filter(Boolean).join(' · ')
  return (
    <div className={clsx('flex', className)}>
      <Link
        to="/settings"
        hash="feed"
        title="Set in Settings › Feed › Performer preferences"
        className="inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs text-muted ring-1 ring-line transition-colors hover:bg-raised hover:text-fg touch:min-h-11"
      >
        <Users size={12} className="shrink-0" />
        <span className="shrink-0">Your performer defaults</span>
        <span className="truncate opacity-80">· {label}</span>
      </Link>
    </div>
  )
}

function PinButton({ query }: { query: SceneQuery }) {
  // On touch the form is a bottom sheet on <body>: inside the filter bar, whose backdrop-filter
  // makes `fixed` relative to it, it painted behind the first card.
  const sheet = useMediaQuery('(pointer: coarse)')
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
      {open &&
        (sheet ? (
          createPortal(
            <>
              <div className="fixed inset-0 z-[65] bg-black/50" onClick={() => setOpen(false)} />
        <form
          className={clsx(
            'bg-surface shadow-2xl ring-1 ring-line',
            sheet ? 'fixed inset-x-0 bottom-0 z-[70] rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]' : 'absolute top-10 right-0 z-50 w-80 rounded-2xl p-3',
          )}
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
            </>,
            document.body,
          )
        ) : (
        <form
          className={clsx(
            'bg-surface shadow-2xl ring-1 ring-line',
            sheet ? 'fixed inset-x-0 bottom-0 z-[70] rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]' : 'absolute top-10 right-0 z-50 w-80 rounded-2xl p-3',
          )}
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
        ))}
    </div>
  )
}
