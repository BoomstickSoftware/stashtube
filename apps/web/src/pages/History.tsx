import type { HistoryEntry, Ref, Stats as StatsData } from '@flix/shared'
import { Link, useRouterState } from '@tanstack/react-router'
import clsx from 'clsx'
import { Check, CheckSquare, Trash2, X } from 'lucide-react'
import { useCallback, useMemo, useState, type JSX, type ReactNode } from 'react'
import { Button, Empty, ErrorBox, Sentinel, Spinner } from '../components/ui'
import { historyKey, useHistory, useRemoveFromHistory, useRestoreHistory, useStats } from '../lib/api'
import { showToast } from '../lib/toast'
import { duration } from '../lib/format'
import { sized } from '@flix/shared'

// Continue / History / Stats share one nav item and these tabs.
export function WatchTabs() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const tabs = [
    ['/continue', 'Continue watching'],
    ['/history', 'History'],
    ['/stats', 'Stats'],
  ] as const
  return (
    <div className="mb-5 flex gap-1 border-b border-white/5">
      {tabs.map(([to, label]) => (
        <Link
          key={to}
          to={to}
          className={clsx(
            '-mb-px border-b-2 px-3 pb-2.5 text-sm font-semibold transition-colors',
            path === to ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  )
}

// `day` is YYYY-MM-DD in this browser's zone (the server groups by it)
const dayLabel = (day: string) => {
  const d = new Date(`${day}T12:00:00`)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

// One row per video per day ("3 plays · last 9:41 PM"), 40 a page as you scroll. A row's ×, or
// Select then Remove, takes those plays out of Stash at once with Undo in the toast (wiki
// features/continue-history-stats); the resume point stays.
export function History(): JSX.Element {
  const { data, error, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useHistory()
  const remove = useRemoveFromHistory()
  const restore = useRestoreHistory()
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const entries = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const total = data?.pages[0]?.total ?? 0
  const days = new Map<string, HistoryEntry[]>()
  for (const e of entries) days.set(e.day, [...(days.get(e.day) ?? []), e])
  const more = useCallback(() => void (hasNextPage && !isFetchingNextPage && fetchNextPage()), [hasNextPage, isFetchingNextPage, fetchNextPage])

  const drop = (gone: HistoryEntry[]) => {
    if (!gone.length) return
    remove.mutate(gone, {
      onSuccess: () => {
        const plays = gone.reduce((n, e) => n + e.times.length, 0)
        showToast(
          gone.length === 1 ? 'Removed from History' : `Removed ${gone.length} from History (${plays} plays)`,
          <button onClick={() => restore.mutate(gone)} className="rounded-full bg-raised px-3 py-1 text-xs font-semibold hover:bg-line">
            Undo
          </button>,
        )
      },
    })
  }
  const stopSelecting = () => {
    setSelecting(false)
    setPicked(new Set())
  }
  const toggle = (k: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  return (
    <div className="[&>*:not(:first-child)]:max-w-4xl">
      <WatchTabs />
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Spinner className="mx-auto mt-24" />
      ) : !entries.length ? (
        <Empty>Nothing watched yet.</Empty>
      ) : (
        <>
          <div className="sticky top-16 z-10 -mx-4 mb-3 flex items-center gap-2 bg-bg/85 px-4 py-2 backdrop-blur-xl sm:mx-0 sm:px-0">
            {selecting ? (
              <>
                <span className="text-sm font-semibold">{picked.size} selected</span>
                <button
                  onClick={() => setPicked(new Set(entries.map(historyKey)))}
                  className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-raised hover:text-fg touch:min-h-11"
                >
                  All loaded
                </button>
                <Button
                  variant="danger"
                  disabled={!picked.size}
                  onClick={() => {
                    drop(entries.filter((e) => picked.has(historyKey(e))))
                    stopSelecting()
                  }}
                  className="ml-auto touch:min-h-11"
                >
                  <Trash2 size={16} /> Remove
                </Button>
                <Button onClick={stopSelecting} className="touch:min-h-11">
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <span className="text-sm text-muted">{total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}</span>
                <Button onClick={() => setSelecting(true)} className="ml-auto touch:min-h-11">
                  <CheckSquare size={16} /> Select
                </Button>
              </>
            )}
          </div>
          {[...days.entries()].map(([day, list]) => (
            <section key={day} className="mb-6">
              <h2 className="mb-2 text-sm font-bold text-muted">{dayLabel(day)}</h2>
              <div className="space-y-1">
                {list.map((e) => (
                  <HistoryRow
                    key={historyKey(e)}
                    entry={e}
                    selecting={selecting}
                    picked={picked.has(historyKey(e))}
                    onToggle={() => toggle(historyKey(e))}
                    onRemove={() => drop([e])}
                  />
                ))}
              </div>
            </section>
          ))}
          <Sentinel onVisible={more} disabled={!hasNextPage} />
          {isFetchingNextPage && <Spinner className="mx-auto my-6" />}
        </>
      )}
    </div>
  )
}

function HistoryRow({ entry: e, selecting, picked, onToggle, onRemove }: { entry: HistoryEntry; selecting: boolean; picked: boolean; onToggle: () => void; onRemove: () => void }) {
  const n = e.times.length
  const thumb = (
    <>
      <img src={sized(e.scene.screenshot, 320)} alt="" loading="lazy" className="size-full object-cover" />
      <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[11px] tabular-nums">{duration(e.scene.durationSec)}</span>
      {e.scene.resumeTime > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
          <div className="h-full bg-accent" style={{ width: `${(e.scene.resumeTime / e.scene.durationSec) * 100}%` }} />
        </div>
      )}
    </>
  )
  const text = (
    <>
      <div className="line-clamp-2 text-sm font-semibold">{e.scene.title}</div>
      <div className="truncate text-xs text-muted">{[e.scene.studio?.name, e.scene.performers.map((p) => p.name).slice(0, 3).join(', ')].filter(Boolean).join(' · ')}</div>
      <div className="text-xs text-muted/80">{n > 1 ? `${n} plays · last ${clock(e.playedAt)}` : clock(e.playedAt)}</div>
    </>
  )
  if (selecting)
    return (
      <button
        onClick={onToggle}
        aria-pressed={picked}
        className={clsx('flex w-full items-center gap-3 rounded-xl p-1.5 text-left', picked ? 'bg-accent/15 ring-1 ring-accent/50' : 'hover:bg-surface')}
      >
        <span className={clsx('flex size-6 shrink-0 items-center justify-center rounded-md ring-1', picked ? 'bg-accent text-white ring-accent' : 'ring-white/30')}>
          {picked && <Check size={15} />}
        </span>
        <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg sm:w-44">{thumb}</span>
        <span className="min-w-0 flex-1">{text}</span>
      </button>
    )
  return (
    <div className="group flex items-center gap-3 rounded-xl p-1.5 hover:bg-surface">
      <Link to="/scene/$id" params={{ id: e.scene.id }} className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg sm:w-44">
        {thumb}
      </Link>
      <Link to="/scene/$id" params={{ id: e.scene.id }} className="min-w-0 flex-1 hover:[&>div:first-child]:text-accent">
        {text}
      </Link>
      <button
        onClick={onRemove}
        title={n > 1 ? `Remove these ${n} plays from History` : 'Remove from History'}
        aria-label="Remove from History"
        className="rounded-full p-2 text-muted hover:bg-raised hover:text-red-400 touch:size-11 touch:p-0 touch:flex touch:items-center touch:justify-center sm:opacity-0 sm:group-hover:opacity-100 sm:touch:opacity-100"
      >
        <X size={16} />
      </button>
    </div>
  )
}

export function Stats(): JSX.Element {
  const { data: s, error, isLoading } = useStats()
  return (
    <div className="[&>*:not(:first-child)]:max-w-5xl">
      <WatchTabs />
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading || !s ? (
        <Spinner className="mx-auto mt-24" />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Hours watched" value={s.hours.toLocaleString()} />
            <Tile label="Plays" value={s.plays.toLocaleString()} />
            <Tile label="Videos watched" value={s.scenesWatched.toLocaleString()} />
            <Tile label="O count" value={s.oCount.toLocaleString()} />
          </div>
          <PerDay data={s.perDay} />
          <div className="grid gap-6 md:grid-cols-3">
            <Ranked title="Top performers" items={s.topPerformers} link={(r) => <Link to="/performer/$id" params={{ id: r.id }} className="truncate hover:text-accent">{r.name}</Link>} />
            <Ranked title="Top studios" items={s.topStudios} link={(r) => <Link to="/studio/$id" params={{ id: r.id }} className="truncate hover:text-accent">{r.name}</Link>} />
            <Ranked title="Top tags" items={s.topTags} link={(r) => <Link to="/tag/$id" params={{ id: r.id }} className="truncate hover:text-accent">{r.name}</Link>} />
          </div>
        </div>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-white/5">
      <div className="text-3xl font-black tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  )
}

// One series, so one hue and no legend; the title names it. Bars meet the baseline,
// rounded at the data end, 2px apart; hover shows the exact day and count.
function PerDay({ data }: { data: StatsData['perDay'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.plays))
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-white/5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-bold">Plays per day, last 30 days</h2>
        <span className="text-xs text-muted tabular-nums">
          {hover !== null ? `${fmt(data[hover].date)}: ${data[hover].plays} play${data[hover].plays === 1 ? '' : 's'}` : `peak ${max}`}
        </span>
      </div>
      <div className="relative flex h-32 items-end gap-[2px] border-b border-line" onMouseLeave={() => setHover(null)} role="img" aria-label="Plays per day over the last 30 days">
        {data.map((d, i) => (
          // the hit target is the full column, wider and taller than the bar
          <div key={d.date} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div
              className={clsx('w-full rounded-t-[4px] transition-colors', hover === i ? 'bg-accent-hover' : 'bg-accent', !d.plays && 'bg-transparent')}
              style={{ height: d.plays ? `${Math.max(4, (d.plays / max) * 100)}%` : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted">
        <span>{fmt(data[0].date)}</span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.plays}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Ranked({ title, items, link }: { title: string; items: { ref: Ref; plays: number }[]; link: (r: Ref) => ReactNode }) {
  const max = Math.max(1, ...items.map((i) => i.plays))
  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-white/5">
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      {!items.length && <div className="text-sm text-muted">Nothing yet</div>}
      <ol className="space-y-2">
        {items.map((it, i) => (
          <li key={it.ref.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="w-4 text-right text-xs text-muted tabular-nums">{i + 1}</span>
              {link(it.ref)}
              <span className="ml-auto text-xs text-muted tabular-nums">{it.plays}</span>
            </div>
            <div className="mt-1 ml-6 h-1 rounded-full bg-raised">
              <div className="h-full rounded-full bg-accent/70" style={{ width: `${(it.plays / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
