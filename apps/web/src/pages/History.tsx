import type { HistoryEntry, Ref, Stats as StatsData } from '@flix/shared'
import { Link, useRouterState } from '@tanstack/react-router'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { useState, type JSX, type ReactNode } from 'react'
import { Empty, ErrorBox, Spinner } from '../components/ui'
import { useHistory, useRemoveFromHistory, useStats } from '../lib/api'
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

const dayLabel = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export function History(): JSX.Element {
  const { data, error, isLoading } = useHistory()
  const remove = useRemoveFromHistory()
  const days = new Map<string, HistoryEntry[]>()
  for (const e of data ?? []) {
    const k = dayLabel(e.playedAt)
    days.set(k, [...(days.get(k) ?? []), e])
  }
  return (
    <div className="mx-auto max-w-4xl">
      <WatchTabs />
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Spinner className="mx-auto mt-24" />
      ) : !data?.length ? (
        <Empty>Nothing watched yet.</Empty>
      ) : (
        [...days.entries()].map(([day, entries]) => (
          <section key={day} className="mb-6">
            <h2 className="mb-2 text-sm font-bold text-muted">{day}</h2>
            <div className="space-y-1">
              {entries.map((e) => (
                <div key={`${e.scene.id}-${e.playedAt}`} className="group flex items-center gap-3 rounded-xl p-1.5 hover:bg-surface">
                  <Link to="/scene/$id" params={{ id: e.scene.id }} className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg sm:w-44">
                    <img src={sized(e.scene.screenshot, 320)} alt="" loading="lazy" className="size-full object-cover" />
                    <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[11px] tabular-nums">{duration(e.scene.durationSec)}</span>
                    {e.scene.resumeTime > 0 && (
                      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
                        <div className="h-full bg-accent" style={{ width: `${(e.scene.resumeTime / e.scene.durationSec) * 100}%` }} />
                      </div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to="/scene/$id" params={{ id: e.scene.id }} className="line-clamp-2 text-sm font-semibold hover:text-accent">
                      {e.scene.title}
                    </Link>
                    <div className="truncate text-xs text-muted">
                      {[e.scene.studio?.name, e.scene.performers.map((p) => p.name).slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
                    </div>
                    <div className="text-xs text-muted/80">{new Date(e.playedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm('Remove this video from your history? Its play count and resume point are cleared too.')) remove.mutate(e.scene.id)
                    }}
                    title="Remove from history"
                    className="rounded-full p-2 text-muted opacity-100 hover:bg-raised hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

export function Stats(): JSX.Element {
  const { data: s, error, isLoading } = useStats()
  return (
    <div className="mx-auto max-w-5xl">
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
