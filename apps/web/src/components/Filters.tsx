import type { SceneFacets, SceneQuery } from '@flix/shared'
import { CastFilter } from './CastFilter'
import clsx from 'clsx'
import { Building2, Check, EyeOff, Minus, Plus, Search, SlidersHorizontal, Tag, Type, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFacets, useSceneCount, useSearch, useTags } from '../lib/api'
import { lengths, useQueryParts } from '../lib/describe'
import { addToQuery, clearAll, type FilterKind, filtersOf, filterTotal, hasFilter } from '../lib/filters'
import { idList, toggleId } from '../lib/query'
import { PeopleControls } from './People'
import { Avatar, Spinner, Switch } from './ui'
import { useDebounced } from '../lib/hooks'

// Filters for any list of videos (and a station's), in one place: a search box that finds
// performers, studios, tags and title words; the filters in play as removable chips; and plain
// choices for the rest. On a list it opens as a dialog (a sheet on phones) and applies on
// "Show N videos"; the station editor shows it inline and applies as you go.

type Patch = Partial<SceneQuery>

const csv = (v?: string) => (v ? v.split(',').filter(Boolean) : [])

// --- the filters in play, as chips ---------------------------------------------------------

// Removable chips for the filters in play. An excluded tag is struck through.
export function ActiveFilters({ query, onChange, className }: { query: SceneQuery; onChange: (p: Patch) => void; className?: string }) {
  const active = useQueryParts(query)
  if (!active.length) return null
  return (
    <div className={clsx('flex flex-wrap items-center gap-1.5', className)}>
      {active.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => onChange(a.clear)}
          title="Remove"
          className={clsx(
            'inline-flex max-w-full items-center gap-1 rounded-full py-1 pr-2 pl-3 text-[13px] transition-colors',
            a.tone === 'include' && 'bg-accent/15 text-accent ring-1 ring-accent/40 hover:bg-accent/25',
            a.tone === 'exclude' && 'bg-red-500/10 text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/20',
            a.tone === 'plain' && 'bg-raised text-fg ring-1 ring-line hover:bg-line',
          )}
        >
          {a.tone === 'exclude' && <span className="text-[11px] font-semibold uppercase opacity-80">Not</span>}
          <span className="truncate">{a.label}</span>
          <X size={13} className="shrink-0 opacity-70" />
        </button>
      ))}
      {active.length > 1 && (
        <button type="button" onClick={() => onChange(clearAll)} className="px-2 text-xs text-muted hover:text-fg">
          Clear all
        </button>
      )}
    </div>
  )
}

// --- the editor ----------------------------------------------------------------------------

// `scope` is the query whose contents are counted (the filters plus what the page fixes, like the
// performer being viewed); it defaults to the filters themselves.
export function FilterPanel({ query: q, scope, onChange }: { query: SceneQuery; scope?: SceneQuery; onChange: (p: Patch) => void }) {
  const { data: facets } = useFacets(scope ?? q)
  const opt = facets?.options
  return (
    <div className="space-y-6">
      <Section title="Your filters" aside={facets && `${facets.total.toLocaleString()} video${facets.total === 1 ? '' : 's'} match`}>
        {filterTotal(q) ? (
          <ActiveFilters query={q} onChange={onChange} />
        ) : (
          <p className="text-sm text-muted">None yet, so every video is in. Search below, or pick from the choices.</p>
        )}
      </Section>
      {/* the quick choices first: on a phone the tag cloud below is tall */}
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <Choice
          title="Watched"
          options={[
            ['Any', !q.unwatched && !q.inProgress, { unwatched: undefined, inProgress: undefined }, opt?.watched.any],
            ['Unwatched', !!q.unwatched, { unwatched: true, inProgress: undefined }, opt?.watched.unwatched],
            ['In progress', !!q.inProgress, { inProgress: true, unwatched: undefined }, opt?.watched.inProgress],
          ]}
          onChange={onChange}
        />
        <Choice
          title="Rating"
          options={[
            ['Any', !q.minRating, { minRating: undefined }, opt?.rating.any],
            ['★ 3+', q.minRating === 3, { minRating: 3 }, opt?.rating['3']],
            ['★ 4+', q.minRating === 4, { minRating: 4 }, opt?.rating['4']],
            ['★ 4.5+', q.minRating === 4.5, { minRating: 4.5 }, opt?.rating['4.5']],
          ]}
          onChange={onChange}
        />
        <Choice
          title="Quality"
          options={[
            ['Any', !q.minHeight, { minHeight: undefined }, opt?.quality.any],
            ['720p+', q.minHeight === 720, { minHeight: 720 }, opt?.quality['720']],
            ['1080p+', q.minHeight === 1080, { minHeight: 1080 }, opt?.quality['1080']],
            ['4K', q.minHeight === 2160, { minHeight: 2160 }, opt?.quality['2160']],
          ]}
          onChange={onChange}
        />
        <Choice
          title="Length"
          options={[
            ['Any', !q.minDuration && !q.maxDuration, { minDuration: undefined, maxDuration: undefined }, opt?.length.any],
            ...lengths.map(
              (l): [string, boolean, Patch, number | undefined] => [
                l.label,
                q.minDuration === l.min && q.maxDuration === l.max,
                { minDuration: l.min, maxDuration: l.max },
                opt?.length[l.key],
              ],
            ),
          ]}
          onChange={onChange}
        />
      </div>
      <FinderSection query={q} onChange={onChange} facets={facets} />
      <Section title="Performers">
        <Toggle on={!!q.favorites} onChange={(v) => onChange({ favorites: v || undefined })}>
          Only videos with a performer I follow
        </Toggle>
        <div className="mt-4">
          <PeopleControls
            value={{ minAge: q.minAge, maxAge: q.maxAge, ethnicities: csv(q.ethnicities).length ? csv(q.ethnicities) : undefined }}
            onChange={(v) => onChange({ minAge: v.minAge, maxAge: v.maxAge, ethnicities: v.ethnicities?.join(',') || undefined })}
          />
          <p className="mt-2 text-xs text-muted">
            Age and ethnicity need one performer who matches both, and replace your Settings defaults here.
          </p>
        </div>
      </Section>
      <Section title="Cast">
        <CastFilter query={q} onChange={onChange} />
      </Section>
      <Section title="Blocked">
        <Toggle on={!!q.unblocked} onChange={(v) => onChange({ unblocked: v || undefined })}>
          <EyeOff size={14} className="inline align-[-2px]" /> Include videos from blocked performers, studios and categories
        </Toggle>
      </Section>
    </div>
  )
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-baseline gap-2 text-xs font-semibold tracking-wider text-muted uppercase">
        {title}
        {aside && <span className="ml-auto font-normal tracking-normal normal-case tabular-nums">{aside}</span>}
      </h3>
      {children}
    </section>
  )
}

// One choice from a few (a segmented control that wraps on narrow screens).
// Each option shows how many videos it would leave (from the facets); one that would leave none is dimmed.
function Choice({ title, options, onChange }: { title: string; options: [string, boolean, Patch, number | undefined][]; onChange: (p: Patch) => void }) {
  return (
    <Section title={title}>
      <div role="radiogroup" aria-label={title} className="flex flex-wrap gap-1.5">
        {options.map(([label, on, patch, n]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(patch)}
            className={clsx(
              'inline-flex items-baseline gap-1.5 rounded-full px-3 py-1.5 text-[13px] touch:py-2',
              on ? 'bg-white font-medium text-black' : 'bg-raised hover:bg-line',
              !on && n === 0 && 'opacity-40',
            )}
          >
            {label}
            {n !== undefined && <span className={clsx('text-[11px] tabular-nums', on ? 'text-black/60' : 'text-muted')}>{n.toLocaleString()}</span>}
          </button>
        ))}
      </div>
    </Section>
  )
}

function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex w-full cursor-pointer items-center gap-3 text-left text-sm">
      <Switch on={on} onChange={onChange} />
      <span>{children}</span>
    </label>
  )
}

// One search box for everything that can be a filter. Before typing: popular tags to pick.
// With facets, each result says how many of the videos already selected it covers ("12 here"), the
// ones that cover some come first, and the rest are dimmed: adding them would leave nothing. Studios
// are any-of, so once one is picked another widens the set, and they keep their library counts.
function FinderSection({ query: q, onChange, facets }: { query: SceneQuery; onChange: (p: Patch) => void; facets?: SceneFacets }) {
  const [text, setText] = useState('')
  const term = useDebounced(text.trim(), 150)
  const searching = term.length >= 2
  const { data: found, isFetching } = useSearch(searching ? term : '')
  const { data: tagHits } = useTags({ q: term }, searching)
  const { data: popular } = useTags({ sort: 'scenes_count' })
  const add = (kind: FilterKind, id: string) => {
    onChange(addToQuery(q, kind, id))
    setText('')
  }
  const toggleTag = (id: string, mode: 'tags' | 'xtags') => {
    const other = mode === 'tags' ? 'xtags' : 'tags'
    onChange({ [mode]: toggleId(q[mode], id), [other]: idList(q[other]).includes(id) ? toggleId(q[other], id) : q[other] })
  }
  const here = (map: Record<string, number> | undefined, id: string) => (facets && map ? (map[id] ?? 0) : undefined)
  const byHere = <T extends { id: string }>(items: T[], map?: Record<string, number>) =>
    facets && map ? [...items].sort((a, b) => Number((map[b.id] ?? 0) > 0) - Number((map[a.id] ?? 0) > 0)) : items
  const studiosWiden = idList(q.studios).length > 0
  const performers = byHere(found?.performers ?? [], facets?.performers).slice(0, 6)
  const studios = byHere(found?.studios ?? [], studiosWiden ? undefined : facets?.studios).slice(0, 4)
  const tags = byHere(tagHits?.items ?? [], facets?.tags).slice(0, 10)
  // before typing: the tags most common in the selected videos (the whole library with no filters)
  const suggested = useMemo(() => {
    const list = popular?.items ?? []
    if (!facets) return list.slice(0, 24).map((t) => ({ ...t, n: t.sceneCount }))
    return list
      .map((t) => ({ ...t, n: facets.tags[t.id] ?? 0 }))
      .filter((t) => t.n > 0 && !idList(q.xtags).includes(t.id))
      .sort((a, b) => Number(idList(q.tags).includes(b.id)) - Number(idList(q.tags).includes(a.id)) || b.n - a.n)
      .slice(0, 24)
  }, [popular, facets, q.tags, q.xtags])
  const row = 'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-raised'

  return (
    <Section title="Find">
      <label className="flex h-11 items-center gap-2 rounded-full bg-raised px-4 ring-1 ring-line focus-within:ring-accent/60">
        <Search size={16} className="shrink-0 text-muted" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              e.preventDefault()
              onChange({ q: text.trim() })
              setText('')
            }
          }}
          placeholder="Performer, studio, category or words in the title"
          className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm"
        />
        {isFetching && searching && <Spinner className="size-4 border-2" />}
        {text && (
          <button type="button" onClick={() => setText('')} aria-label="Clear search" className="text-muted hover:text-fg">
            <X size={16} />
          </button>
        )}
      </label>

      {searching ? (
        <div className="mt-2 space-y-3">
          <button type="button" className={row} onClick={() => (onChange({ q: term }), setText(''))}>
            <Icon><Type size={15} /></Icon>
            <span className="min-w-0 flex-1 truncate text-sm">
              Titles containing <b>“{term}”</b>
            </span>
          </button>
          {performers.length > 0 && (
            <Group label="Performers">
              {performers.map((p) => {
                const on = hasFilter(q, 'performer', p.id)
                const n = here(facets?.performers, p.id)
                return (
                  <button key={p.id} type="button" className={clsx(row, !on && n === 0 && 'opacity-45')} onClick={() => (on ? onChange({ performers: toggleId(q.performers, p.id) }) : add('performer', p.id))}>
                    <Avatar src={p.image} name={p.name} className="size-8 shrink-0 rounded-full object-top" />
                    <Name name={p.name} sub={counted(n, p.sceneCount)} />
                    <State on={on} />
                  </button>
                )
              })}
            </Group>
          )}
          {studios.length > 0 && (
            <Group label="Studios">
              {studios.map((s) => {
                const on = hasFilter(q, 'studio', s.id)
                const n = studiosWiden ? undefined : here(facets?.studios, s.id)
                return (
                  <button key={s.id} type="button" className={clsx(row, !on && n === 0 && 'opacity-45')} onClick={() => (on ? onChange({ studios: toggleId(q.studios, s.id) }) : add('studio', s.id))}>
                    <Icon><Building2 size={15} /></Icon>
                    <Name name={s.name} sub={counted(n, s.sceneCount)} />
                    <State on={on} />
                  </button>
                )
              })}
            </Group>
          )}
          {tags.length > 0 && (
            <Group label="Categories">
              {tags.map((t) => {
                const inc = idList(q.tags).includes(t.id)
                const exc = idList(q.xtags).includes(t.id)
                const n = here(facets?.tags, t.id)
                return (
                  <div key={t.id} className={clsx('flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-raised', !inc && !exc && n === 0 && 'opacity-45')}>
                    <Icon><Tag size={15} /></Icon>
                    <Name name={t.name} sub={counted(n, t.sceneCount)} />
                    <TagButton on={inc} tone="include" onClick={() => toggleTag(t.id, 'tags')} />
                    <TagButton on={exc} tone="exclude" onClick={() => toggleTag(t.id, 'xtags')} />
                  </div>
                )
              })}
            </Group>
          )}
          {found && !performers.length && !studios.length && !tags.length && (
            <p className="px-2 text-sm text-muted">No performers, studios or categories match. Search titles instead.</p>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <div className="mb-2 text-xs text-muted">
            {facets ? `Most common categories in these ${videos(facets.total)}.` : 'Popular categories.'} Pick one to require it; search a
            category to exclude it.
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggested.map((t) => {
              const on = idList(q.tags).includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id, 'tags')}
                  className={clsx(
                    'inline-flex items-center gap-1 rounded-full px-3 py-1 text-[13px] touch:py-1.5',
                    on ? 'bg-accent text-white' : 'bg-raised hover:bg-line',
                  )}
                >
                  {on ? <Check size={13} /> : <Plus size={13} className="text-muted" />}
                  {t.name}
                  {!on && <span className="text-[11px] text-muted tabular-nums">{t.n.toLocaleString()}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Section>
  )
}

const videos = (n: number) => `${n.toLocaleString()} video${n === 1 ? '' : 's'}`
// "12 here · 865 in all" while the selected set is smaller than the item's own videos.
const counted = (here: number | undefined, all: number) =>
  here === undefined || here === all
    ? videos(all)
    : here === 0
      ? `None here · ${all.toLocaleString()} in all`
      : `${here.toLocaleString()} here · ${all.toLocaleString()} in all`

const Icon = ({ children }: { children: React.ReactNode }) => (
  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-raised text-muted">{children}</span>
)
const Name = ({ name, sub }: { name: string; sub: string }) => (
  <span className="min-w-0 flex-1">
    <span className="block truncate text-sm">{name}</span>
    <span className="block truncate text-xs text-muted">{sub}</span>
  </span>
)
const State = ({ on }: { on: boolean }) =>
  on ? (
    <span className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white">
      <Check size={12} /> Added
    </span>
  ) : (
    <span className="flex items-center gap-1 rounded-full bg-raised px-2.5 py-1 text-xs ring-1 ring-line">
      <Plus size={12} /> Add
    </span>
  )

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</div>
      {children}
    </div>
  )
}

function TagButton({ on, tone, onClick }: { on: boolean; tone: 'include' | 'exclude'; onClick: () => void }) {
  const inc = tone === 'include'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={clsx(
        'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs touch:py-1.5',
        on ? (inc ? 'bg-accent font-semibold text-white' : 'bg-red-500 font-semibold text-white') : 'bg-raised ring-1 ring-line hover:bg-line',
      )}
    >
      {inc ? <Plus size={12} /> : <Minus size={12} />}
      {inc ? 'Require' : 'Exclude'}
    </button>
  )
}

// --- as a dialog ---------------------------------------------------------------------------

// Edits a copy and applies it on "Show N videos"; `countQuery` turns the copy into the query
// whose count to show (adding what the page fixes, like the performer being viewed).
export function FilterDialog({
  query,
  countQuery,
  onApply,
  onClose,
}: {
  query: SceneQuery
  countQuery: (q: SceneQuery) => SceneQuery
  onApply: (p: Patch) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<SceneQuery>(query)
  const edit = (p: Patch) => setDraft((d) => ({ ...d, ...p }))
  const { data: count, isFetching } = useSceneCount(countQuery(draft))
  const apply = () => {
    onApply(filtersOf(draft))
    onClose()
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', k)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      removeEventListener('keydown', k)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        onClick={(e) => e.stopPropagation()}
        className="flex h-[100dvh] w-full flex-col bg-surface sm:h-auto sm:max-h-[min(52rem,calc(100dvh-3rem))] sm:max-w-2xl sm:rounded-2xl sm:ring-1 sm:ring-line"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3">
          <SlidersHorizontal size={18} className="text-accent" />
          <h2 className="text-lg font-bold">Filters</h2>
          <button type="button" onClick={onClose} className="ml-auto rounded-full p-2 hover:bg-raised" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          <FilterPanel query={draft} scope={countQuery(draft)} onChange={edit} />
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <button type="button" onClick={() => setDraft((d) => ({ ...d, ...clearAll }))} className="rounded-full px-3 py-2 text-sm text-muted hover:bg-raised hover:text-fg">
            Clear all
          </button>
          <button
            type="button"
            onClick={apply}
            className="ml-auto flex min-w-44 items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            {isFetching && <Spinner className="size-4 border-2 border-white/40 border-t-white" />}
            Show {count === undefined ? '' : count.toLocaleString()} video{count === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
