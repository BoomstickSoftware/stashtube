import type { SceneQuery, SceneSort } from '@flix/shared'
import { sceneSorts } from '@flix/shared'
import { ArrowDownWideNarrow, CheckCheck, CheckSquare, EyeOff, Pin, Shuffle, SlidersHorizontal, Tag, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { usePerformer, useRowMutations, useScenes, useStudio, useTags } from '../lib/api'
import { idList, toggleId } from '../lib/query'
import { addToQuery } from '../lib/filters'
import { FilterSearch } from './AddFilter'
import { BulkBar } from './Bulk'
import { SceneCard, SceneCardSkeleton } from './SceneCard'
import { TagPicker } from './TagPicker'
import { Chip, Empty, ErrorBox, Sentinel, Spinner, useClickOutside } from './ui'

type Patch = Partial<SceneQuery>

// Scene grid with tube-style filters. `query` is the user's filter state (kept in the
// URL by the page); `base` is fixed by the page, e.g. the performer being viewed.
export function SceneBrowser({
  query,
  onChange,
  base = {},
  defaultSort = 'date',
  alwaysSelecting = false,
}: {
  query: SceneQuery
  onChange: (patch: Patch) => void
  base?: SceneQuery
  defaultSort?: SceneSort
  alwaysSelecting?: boolean // cleanup: cards toggle selection from the start, and stay selectable after a bulk action
}) {
  const effective = useMemo(() => {
    const q: SceneQuery = { ...query, sort: query.sort ?? (query.q ? undefined : defaultSort) }
    for (const [k, v] of Object.entries(base)) {
      if (k === 'tags' || k === 'performers' || k === 'studios') {
        const merged = [...new Set([...idList(v as string), ...idList(q[k])])]
        q[k] = merged.join(',')
      } else (q as Record<string, unknown>)[k] = v
    }
    if (q.sort === 'random' && !q.seed) q.seed = 1
    return q
  }, [query, base, defaultSort])

  const { data, error, isLoading, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useScenes(effective)
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const scenes = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total
  const [selecting, setSelecting] = useState(alwaysSelecting)
  const [selected, setSelected] = useState<string[]>([])
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const stopSelecting = () => {
    setSelecting(alwaysSelecting)
    setSelected([])
  }

  return (
    <div>
      <FilterBar
        query={query}
        effective={effective}
        onChange={onChange}
        total={total}
        busy={isFetching && !isFetchingNextPage}
        defaultSort={defaultSort}
        selecting={selecting}
        onSelecting={alwaysSelecting ? undefined : () => (selecting ? stopSelecting() : setSelecting(true))}
        onSelectAll={selecting ? () => setSelected(scenes.map((s) => s.id)) : undefined}
      />
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
                select={selecting ? { selected: selected.includes(s.id), onToggle: () => toggle(s.id) } : undefined}
              />
            ))}
          </Grid>
          <Sentinel onVisible={loadMore} disabled={!hasNextPage} />
          {isFetchingNextPage && <Spinner className="mx-auto my-8" />}
        </>
      )}
      {selecting && (
        <BulkBar ids={selected} titleOf={(id) => scenes.find((s) => s.id === id)?.title ?? `Scene ${id}`} onClear={stopSelecting} />
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

const durations: { label: string; min?: number; max?: number }[] = [
  { label: '< 15 min', max: 15 },
  { label: '15–40 min', min: 15, max: 40 },
  { label: '40+ min', min: 40 },
]

function FilterBar({
  query,
  effective,
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
  onChange: (p: Patch) => void
  total?: number
  busy: boolean
  defaultSort: SceneSort
  selecting: boolean
  onSelecting?: () => void // undefined: selection is always on
  onSelectAll?: () => void // selects every loaded video
}) {
  const [picker, setPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  useClickOutside(pickerRef, () => setPicker(false), picker)
  const { data: allTags } = useTags({ sort: 'name' })
  const tagName = useMemo(() => new Map(allTags?.items.map((t) => [t.id, t.name])), [allTags])

  const included = idList(query.tags)
  const excluded = idList(query.xtags)
  const sort = query.sort ?? defaultSort
  const durationKey = durations.findIndex((d) => d.min === query.minDuration && d.max === query.maxDuration)
  const cleanup = cleanupChips(query)
  const anyFilter =
    included.length || excluded.length || query.performers || query.studios || query.minRating || query.minHeight ||
    query.minDuration || query.maxDuration || query.unwatched || query.favorites || query.unblocked || query.q ||
    cleanup.length

  return (
    <div className="sticky top-16 z-20 -mx-4 mb-6 border-b border-white/5 bg-bg/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
        <label className="relative flex shrink-0 items-center gap-2 rounded-full bg-raised py-1.5 pr-3 pl-3 text-[13px] hover:bg-line">
          <ArrowDownWideNarrow size={15} className="text-muted" />
          <select
            value={sort}
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
        <span className="mx-1 h-5 w-px shrink-0 bg-line" />
        <Chip tone={query.unwatched ? 'active' : 'default'} onClick={() => onChange({ unwatched: !query.unwatched || undefined })}>
          Unwatched
        </Chip>
        <Chip tone={query.favorites ? 'active' : 'default'} onClick={() => onChange({ favorites: !query.favorites || undefined })}>
          Favourites
        </Chip>
        <Chip tone={query.minRating === 4 ? 'active' : 'default'} onClick={() => onChange({ minRating: query.minRating === 4 ? undefined : 4 })}>
          ★ 4+
        </Chip>
        <Chip tone={query.minHeight === 1080 ? 'active' : 'default'} onClick={() => onChange({ minHeight: query.minHeight === 1080 ? undefined : 1080 })}>
          1080p+
        </Chip>
        <Chip tone={query.minHeight === 2160 ? 'active' : 'default'} onClick={() => onChange({ minHeight: query.minHeight === 2160 ? undefined : 2160 })}>
          4K
        </Chip>
        {durations.map((d, i) => (
          <Chip
            key={d.label}
            tone={durationKey === i ? 'active' : 'default'}
            onClick={() =>
              onChange(durationKey === i ? { minDuration: undefined, maxDuration: undefined } : { minDuration: d.min, maxDuration: d.max })
            }
          >
            {d.label}
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-line" />
        <FilterSearch query={query} onAdd={(kind, id) => onChange(addToQuery(query, kind, id))} />
        <div ref={pickerRef} className="relative shrink-0">
          <Chip tone={picker ? 'active' : 'default'} onClick={() => setPicker((v) => !v)}>
            <Tag size={14} /> Tags
          </Chip>
          {picker && (
            <div className="fixed top-32 left-4 z-50 overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-line sm:absolute sm:top-10 sm:left-0">
              <TagPicker
                autoFocus
                included={included}
                excluded={excluded}
                onInclude={(id) =>
                  onChange({ tags: toggleId(query.tags, id), xtags: excluded.includes(id) ? toggleId(query.xtags, id) : query.xtags })
                }
                onExclude={(id) =>
                  onChange({ xtags: toggleId(query.xtags, id), tags: included.includes(id) ? toggleId(query.tags, id) : query.tags })
                }
              />
            </div>
          )}
        </div>
        <Chip tone={query.unblocked ? 'active' : 'default'} onClick={() => onChange({ unblocked: !query.unblocked || undefined })}>
          <EyeOff size={14} /> {query.unblocked ? 'Showing blocked' : 'Blocked hidden'}
        </Chip>
        <span className="mx-1 h-5 w-px shrink-0 bg-line" />
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
        <PinButton query={effective} describe={() => describe(effective, tagName)} />
      </div>

      {(included.length > 0 || excluded.length > 0 || query.performers || query.studios || query.q || cleanup.length > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {cleanup.map((c) => (
            <Chip key={c.label} tone="include" onClick={() => onChange(c.clear)}>
              {c.label} <X size={13} />
            </Chip>
          ))}
          {query.q && (
            <Chip tone="active" onClick={() => onChange({ q: undefined })}>
              “{query.q}” <X size={13} />
            </Chip>
          )}
          {idList(query.performers).map((id) => (
            <PerformerChip key={id} id={id} onRemove={() => onChange({ performers: toggleId(query.performers, id) })} />
          ))}
          {idList(query.studios).map((id) => (
            <StudioChip key={id} id={id} onRemove={() => onChange({ studios: toggleId(query.studios, id) })} />
          ))}
          {included.map((id) => (
            <Chip key={id} tone="include" onClick={() => onChange({ tags: toggleId(query.tags, id) })}>
              {tagName.get(id) ?? `#${id}`} <X size={13} />
            </Chip>
          ))}
          {excluded.map((id) => (
            <Chip key={id} tone="exclude" onClick={() => onChange({ xtags: toggleId(query.xtags, id) })}>
              {tagName.get(id) ?? `#${id}`} <X size={13} />
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal size={12} />
          {total === undefined ? '…' : `${total.toLocaleString()} video${total === 1 ? '' : 's'}`}
        </span>
        {busy && <Spinner className="size-3 border" />}
        {anyFilter ? (
          <button
            className="hover:text-fg"
            onClick={() =>
              onChange({
                q: undefined, tags: undefined, xtags: undefined, performers: undefined, studios: undefined,
                minRating: undefined, minHeight: undefined, minDuration: undefined, maxDuration: undefined,
                unwatched: undefined, favorites: undefined, unblocked: undefined,
                maxHeight: undefined, maxRating: undefined, unmatched: undefined, olderDays: undefined, duplicates: undefined,
              })
            }
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  )
}

// Chips for the cleanup filters (set by the Cleanup page's lists), each removable.
function cleanupChips(q: SceneQuery): { label: string; clear: Patch }[] {
  const out: { label: string; clear: Patch }[] = []
  if (q.maxHeight) out.push({ label: `Below ${q.maxHeight >= 2160 ? '4K' : `${q.maxHeight}p`}`, clear: { maxHeight: undefined } })
  if (q.maxRating) out.push({ label: `Rated ★${q.maxRating} or less`, clear: { maxRating: undefined } })
  if (q.unmatched) out.push({ label: 'Not on StashDB', clear: { unmatched: undefined } })
  if (q.olderDays) out.push({ label: `Added ${q.olderDays}+ days ago`, clear: { olderDays: undefined } })
  if (q.duplicates) out.push({ label: 'Possible duplicates', clear: { duplicates: undefined } })
  return out
}

function PerformerChip({ id, onRemove }: { id: string; onRemove: () => void }) {
  const { data } = usePerformer(id)
  return (
    <Chip tone="include" onClick={onRemove}>
      {data?.name ?? '…'} <X size={13} />
    </Chip>
  )
}

function StudioChip({ id, onRemove }: { id: string; onRemove: () => void }) {
  const { data } = useStudio(id)
  return (
    <Chip tone="include" onClick={onRemove}>
      {data?.name ?? '…'} <X size={13} />
    </Chip>
  )
}

// A readable default title for a pinned row, from the filters in play.
function describe(q: SceneQuery, tagName: Map<string, string>): string {
  const parts: string[] = []
  if (q.q) parts.push(`“${q.q}”`)
  idList(q.tags).forEach((t) => parts.push(tagName.get(t) ?? `#${t}`))
  idList(q.xtags).forEach((t) => parts.push(`no ${tagName.get(t) ?? `#${t}`}`))
  if (q.minHeight) parts.push(q.minHeight >= 2160 ? '4K' : `${q.minHeight}p+`)
  if (q.minRating) parts.push(`★${q.minRating}+`)
  if (q.unwatched) parts.push('unwatched')
  if (q.favorites) parts.push('favourites')
  if (q.minDuration || q.maxDuration) parts.push(`${q.minDuration ?? 0}–${q.maxDuration ?? '∞'} min`)
  cleanupChips(q).forEach((c) => parts.push(c.label.toLowerCase()))
  const sort = q.sort && q.sort !== 'date' ? sceneSorts[q.sort] : null
  const title = parts.join(' · ') || sort || 'My row'
  return title.length > 80 ? `${title.slice(0, 77)}…` : title
}

function PinButton({ query, describe }: { query: SceneQuery; describe: () => string }) {
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
