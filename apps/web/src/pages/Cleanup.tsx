import type { SceneQuery } from '@flix/shared'
import { useState, type JSX } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { Copy, EyeOff, Trash2 } from 'lucide-react'
import { sized } from '@flix/shared'
import { DeleteScenesDialog } from '../components/DeleteScenes'
import { SceneBrowser } from '../components/SceneBrowser'
import { Button, Chip, Empty } from '../components/ui'
import { useFeatures, useHiddenScenes, useKeepScene } from '../lib/api'

const route = getRouteApi('/cleanup')

// Ready-made lists of likely deletions. Each sets cleanup filters on the list below; the
// filter bar narrows further (search by performer, studio or tag). Cards select on click or tap.
const lists: { label: string; hint: string; query: SceneQuery }[] = [
  { label: 'Below 720p', hint: 'SD and low-resolution files', query: { maxHeight: 720 } },
  { label: 'Never watched', hint: 'added 30+ days ago, never played', query: { unwatched: true, olderDays: 30 } },
  { label: 'Rated ★2 or less', hint: 'rated, at most two stars', query: { maxRating: 2 } },
  { label: 'Not on StashDB', hint: 'no StashDB match: often mislabelled', query: { unmatched: true } },
]
const cleared: SceneQuery = { maxHeight: undefined, maxRating: undefined, unmatched: undefined, olderDays: undefined, duplicates: undefined, unwatched: undefined }

export function Cleanup(): JSX.Element {
  const query = route.useSearch()
  const navigate = route.useNavigate()
  const { data: features } = useFeatures()
  const onChange = (patch: Partial<SceneQuery>) => navigate({ to: '.', search: (prev: SceneQuery) => ({ ...prev, ...patch }), replace: true })
  const active = lists.findIndex((l) => Object.entries(l.query).every(([k, v]) => query[k as keyof SceneQuery] === v))

  return (
    <div>
      <section className="mb-4">
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Trash2 size={26} className="text-red-400" /> Clean up
        </h1>
        <p className="mt-1 text-sm text-muted">
          Pick a list or filter, select videos, then Delete.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {lists.map((l, i) => (
            <Chip key={l.label} tone={active === i ? 'active' : 'default'} onClick={() => onChange(active === i ? cleared : { ...cleared, ...l.query })}>
              <span title={l.hint}>{l.label}</span>
            </Chip>
          ))}
          <Link
            to="/duplicates"
            title="the same video more than once, side by side, the worse copy pre-selected"
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-[13px] whitespace-nowrap text-amber-300 ring-1 ring-amber-500/30 transition-colors hover:bg-amber-500/25"
          >
            <Copy size={13} /> Duplicates
          </Link>
        </div>
      </section>
      {features?.deleteScenes && <NotInterested />}
      {features && !features.deleteScenes ? (
        <Empty>Deleting needs Whisparr: set WHISPARR_URL and WHISPARR_API_KEY on the server.</Empty>
      ) : (
        <SceneBrowser query={query} onChange={onChange} base={{ unblocked: true }} defaultSort="created_at" alwaysSelecting />
      )}
    </div>
  )
}

// Videos marked "Not interested" before it meant delete (2026-11-09,
// decisions/hide-means-delete-block-or-unlist): delete them, or Keep one to take the mark off.
// Gone once the list is empty.
function NotInterested() {
  const { data } = useHiddenScenes()
  const keep = useKeepScene()
  const [deleting, setDeleting] = useState(false)
  if (!data?.length) return null
  return (
    <section className="mb-6 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="flex items-center gap-2 font-bold">
        <EyeOff size={18} className="text-red-400" /> Marked “Not interested” ({data.length})
      </h2>
      <p className="mt-1 max-w-xl text-sm text-muted">
        Not interested now deletes. These were marked before that and are back in your lists: delete them, or keep the ones you want.
      </p>
      <ul className="mt-3 max-w-xl divide-y divide-line">
        {data.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-2">
            <Link to="/scene/$id" params={{ id: s.id }} className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-raised">
              <img src={sized(s.screenshot, 320)} alt="" loading="lazy" className="size-full object-cover" />
            </Link>
            <Link to="/scene/$id" params={{ id: s.id }} className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{s.title}</div>
              <div className="truncate text-xs text-muted">{[s.studio?.name, s.performers.map((p) => p.name).join(', ')].filter(Boolean).join(' · ')}</div>
            </Link>
            <Button onClick={() => keep.mutate({ id: s.id })} disabled={keep.isPending}>
              Keep
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="danger" onClick={() => setDeleting(true)} className="mt-3">
        <Trash2 size={16} /> Delete all {data.length}…
      </Button>
      {deleting && <DeleteScenesDialog scenes={data.map((s) => ({ id: s.id, title: s.title, size: s.size }))} onClose={() => setDeleting(false)} onDeleted={() => {}} />}
    </section>
  )
}
