import type { SavedStation, SceneQuery } from '@flix/shared'
import type { JSX } from 'react'
import { Link } from '@tanstack/react-router'
import { Check, Pencil, Play, Radio, Sparkles, Star, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { QuerySummary } from '../components/QuerySummary'
import { ErrorBox, Spinner } from '../components/ui'
import { useStationMutations, useStations } from '../lib/api'

// Ready-made stations: one tap, nothing to set up.
const quick: { name: string; query: SceneQuery; icon: typeof Radio }[] = [
  { name: 'Everything', query: {}, icon: Radio },
  { name: 'Unwatched', query: { unwatched: true }, icon: Sparkles },
  { name: 'Favourite performers', query: { favorites: true }, icon: Users },
  { name: 'Top rated', query: { minRating: 4 }, icon: Star },
]

export function Stations(): JSX.Element {
  const { data, error, isLoading } = useStations()
  return (
    <div className="space-y-10">
      <section>
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Radio size={22} className="text-accent" /> Stations
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Endless play. Start one from any list’s <b>Station</b> button (its filters decide what plays) or from a video’s, then
          Save it to keep it here.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Your stations</h2>
        {error ? (
          <ErrorBox error={error} />
        ) : isLoading ? (
          <Spinner className="mx-auto my-12" />
        ) : !data?.length ? (
          <div className="rounded-2xl bg-surface p-6 text-sm text-muted ring-1 ring-line">
            None saved yet. Open a station and tap <b>Save</b> next to its name.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {data.map((s) => (
              <StationCard key={s.id} station={s} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Quick start</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quick.map((q) => (
            <Link
              key={q.name}
              to="/station"
              search={q.query}
              className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line transition hover:bg-raised"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <q.icon size={18} />
              </span>
              <span className="min-w-0 font-semibold">{q.name}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function StationCard({ station: s }: { station: SavedStation }) {
  const { update, remove } = useStationMutations()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const btn = 'rounded-full p-2 text-muted hover:bg-raised hover:text-fg'
  return (
    <div className="group min-w-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <Link to="/station" search={{ id: s.id }} className="relative block aspect-video bg-raised">
        {s.cover && <img src={s.cover} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />}
        <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:bg-transparent">
          <span className="flex size-14 items-center justify-center rounded-full bg-white/90 text-black shadow-xl">
            <Play size={24} className="ml-0.5 fill-current" />
          </span>
        </span>
        <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold backdrop-blur">
          {s.mode === 'moments' ? `Moments · ${s.window}s` : 'Full videos'}
        </span>
      </Link>
      <div className="flex items-start gap-1 p-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
                if (name) update.mutate({ id: s.id, name })
                setEditing(false)
              }}
            >
              <input
                name="name"
                autoFocus
                defaultValue={s.name}
                maxLength={80}
                onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                className="w-full rounded-lg bg-raised px-2 py-1 text-base font-semibold outline-none focus:ring-1 focus:ring-accent sm:text-sm"
              />
            </form>
          ) : (
            <div className="truncate font-semibold">{s.name}</div>
          )}
          <div className="mt-0.5 line-clamp-2 text-xs text-muted">
            {s.from ? 'Drifts through videos like one scene' : <QuerySummary query={s.query} />}
          </div>
        </div>
        <button className={btn} title="Rename" onClick={() => setEditing(true)}>
          <Pencil size={15} />
        </button>
        {confirm ? (
          <button className="rounded-full p-2 text-red-400 hover:bg-red-500/15" title="Confirm delete" onClick={() => remove.mutate(s.id)}>
            <Check size={15} />
          </button>
        ) : (
          <button className={btn} title="Delete station" onClick={() => setConfirm(true)} onBlur={() => setConfirm(false)}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
