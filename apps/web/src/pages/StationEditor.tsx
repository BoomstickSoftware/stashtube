import type { SceneQuery, StationMode } from '@flix/shared'
import type { JSX } from 'react'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { ArrowLeft, Play, Radio } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { FilterPanel } from '../components/Filters'
import { SceneBrowser } from '../components/SceneBrowser'
import { ErrorBox, Segmented, Spinner } from '../components/ui'
import { useStationMutations, useStations } from '../lib/api'
import { stationQuery, windows } from '../lib/station'

// /stations/new and /stations/<id>/edit: name a station, pick how it plays, and set its
// filters with the Browse filter bar; the grid below shows what it will play.
export function StationEditor(): JSX.Element {
  const params = useParams({ strict: false }) as { id?: string }
  const id = params.id ? Number(params.id) : undefined
  const stations = useStations()
  const saved = id ? stations.data?.find((s) => s.id === id) : undefined
  if (id && stations.isPending) return <Spinner className="mx-auto mt-24" />
  if (id && stations.error) return <ErrorBox error={stations.error} />
  if (id && !saved) return <div className="py-24 text-center text-muted">That station no longer exists.</div>
  return (
    <Editor
      key={id ?? 'new'}
      id={id}
      initial={saved ? { name: saved.name, mode: saved.mode, window: saved.window, query: saved.query, from: saved.from } : undefined}
    />
  )
}

function Editor({
  id,
  initial,
}: {
  id?: number
  initial?: { name: string; mode: StationMode; window: number; query: SceneQuery; from?: string }
}) {
  const navigate = useNavigate()
  const query = useSearch({ strict: false }) as SceneQuery
  const { add, update } = useStationMutations()
  const [name, setName] = useState(initial?.name ?? '')
  const [mode, setMode] = useState<StationMode>(initial?.mode ?? 'full')
  const [secs, setSecs] = useState(initial?.window ?? 60)
  // Editing: the station's filters go into the URL once, when the page opens.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !initial || Object.keys(initial.query).length === 0) return
    seeded.current = true
    if (Object.values(query).every((v) => v === undefined)) navigate({ to: '.', search: initial.query, replace: true })
  }, [initial, query, navigate])

  const setFilters = (patch: Partial<SceneQuery>) =>
    navigate({ to: '.', search: (prev) => ({ ...(prev as SceneQuery), ...patch }), replace: true })
  const drifting = !!initial?.from
  const busy = add.isPending || update.isPending
  const save = (thenPlay: boolean) => {
    const body = { name: name.trim(), mode, window: secs, query: drifting ? initial!.query : stationQuery(query) }
    if (!body.name) return
    const done = (sid: number) => navigate(thenPlay ? { to: '/station', search: { id: sid } } : { to: '/stations' })
    if (id) update.mutate({ id, ...body }, { onSuccess: () => done(id) })
    else add.mutate(body, { onSuccess: (r) => done(r.id) })
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Link to="/stations" className="rounded-full p-2 text-muted hover:bg-raised hover:text-fg" aria-label="Back to stations">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Radio size={22} className="text-accent" /> {id ? 'Edit station' : 'New station'}
        </h1>
      </div>
      <form
        className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line"
        onSubmit={(e) => {
          e.preventDefault()
          save(false)
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={!id}
          maxLength={80}
          placeholder="Name this station"
          className="h-10 w-full min-w-0 rounded-full bg-raised px-4 text-base outline-none placeholder:text-muted focus:ring-1 focus:ring-accent sm:w-72 sm:text-sm"
        />
        <Segmented
          label="Plays"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'full', label: 'Full videos' },
            { value: 'moments', label: 'Moments' },
          ]}
        />
        {mode === 'moments' && <Segmented label="Moment length" value={secs} onChange={setSecs} options={windows.map((w) => ({ value: w, label: `${w}s` }))} />}
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="flex-1 rounded-full bg-raised px-4 py-2 text-sm font-semibold hover:bg-line disabled:opacity-40 sm:flex-none"
          >
            {id ? 'Save' : 'Create'}
          </button>
          <button
            type="button"
            disabled={!name.trim() || busy}
            onClick={() => save(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40 sm:flex-none"
          >
            <Play size={14} className="fill-current" /> {id ? 'Save and play' : 'Create and play'}
          </button>
        </div>
        {(add.error || update.error) && <ErrorBox error={add.error ?? update.error} />}
      </form>
      {drifting ? (
        <div className="rounded-2xl bg-surface p-6 text-sm text-muted ring-1 ring-line">
          This station drifts through videos like the one it started from, so it has no filters to set.
        </div>
      ) : (
        <>
          <section className="mb-8 rounded-2xl bg-surface p-4 ring-1 ring-line sm:p-6">
            <h2 className="mb-1 text-lg font-bold">What it plays</h2>
            <p className="mb-5 text-sm text-muted">Everything that matches, shuffled. With no filters it plays the whole library.</p>
            <FilterPanel query={query} onChange={setFilters} />
          </section>
          <h2 className="mb-2 text-lg font-bold">Preview</h2>
          <SceneBrowser query={query} onChange={setFilters} defaultSort="random" forStation />
        </>
      )}
    </div>
  )
}
