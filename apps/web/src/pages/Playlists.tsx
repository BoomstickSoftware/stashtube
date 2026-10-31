import type { JSX } from 'react'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, GripVertical, ListVideo, Play, Plus, Radio, Shuffle, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { HeaderSkeleton } from '../components/EntityHeader'
import { Bone, Button, Empty, ErrorBox, Spinner } from '../components/ui'
import { usePlaylist, usePlaylistMutations, usePlaylists } from '../lib/api'
import { ago, duration } from '../lib/format'
import { sized, srcSet } from '@flix/shared'
import { CARD_SIZES } from '../lib/media'

export function Playlists(): JSX.Element {
  const { data, error, isLoading } = usePlaylists()
  const m = usePlaylistMutations()
  const [name, setName] = useState('')

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-4 text-2xl font-black">Playlists</h1>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) m.create.mutate({ name: name.trim() }, { onSuccess: () => setName('') })
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New playlist"
            className="h-10 rounded-full bg-raised px-4 text-sm outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
          />
          <Button type="submit" variant="accent">
            <Plus size={16} /> Create
          </Button>
        </form>
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Spinner className="mx-auto mt-24" />
      ) : !data?.length ? (
        <Empty>No playlists yet. Use “Save” on any video, or create one above.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.map((p) => (
            <Link key={p.id} to="/playlist/$id" params={{ id: String(p.id) }} className="group">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-surface ring-1 ring-white/5">
                {p.cover ? (
                  <img src={sized(p.cover, 640)} srcSet={srcSet(p.cover)} sizes={CARD_SIZES} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <ListVideo size={40} className="absolute inset-0 m-auto text-muted" />
                )}
                <div className="absolute inset-y-0 right-0 flex w-2/5 flex-col items-center justify-center gap-1 bg-black/75 backdrop-blur">
                  <span className="text-xl font-bold">{p.itemCount}</span>
                  <ListVideo size={20} />
                </div>
              </div>
              <div className="mt-2 font-semibold group-hover:text-accent">{p.name}</div>
              <div className="text-xs text-muted">Updated {ago(p.updatedAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

const route = getRouteApi('/playlist/$id')

const PLAYLIST_GRID = 'mx-auto grid max-w-[1600px] grid-cols-1 gap-8 lg:grid-cols-[360px_minmax(0,1fr)]'

// The page's frame while the list loads: the cover card's skeleton on the left, a few row
// bones on the right, in the same grid, so nothing moves when the playlist arrives
// (_a bare spinner for over 3 s until 2026-10-31_, phone audit item 11).
function PlaylistSkeleton() {
  return (
    <div className={PLAYLIST_GRID}>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <HeaderSkeleton shape="playlist" />
      </aside>
      <ol role="status" aria-label="Loading" className="space-y-1">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 p-2">
            <Bone className="h-4 w-6" />
            <Bone className="aspect-video w-24 shrink-0 rounded-lg sm:w-44" />
            <div className="min-w-0 flex-1">
              <Bone className="h-4 w-3/4" />
              <Bone className="mt-2 h-3 w-1/2" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function PlaylistPage(): JSX.Element {
  const id = Number(route.useParams().id)
  const { data: p, error, isLoading } = usePlaylist(id)
  const m = usePlaylistMutations()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [drag, setDrag] = useState<number | null>(null)

  if (error) return <ErrorBox error={error} />
  if (isLoading || !p) return <PlaylistSkeleton />

  const ids = p.items.map((s) => s.id)
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length || from === to) return
    const next = [...ids]
    next.splice(to, 0, next.splice(from, 1)[0])
    m.reorder.mutate({ id, sceneIds: next })
  }
  const total = p.items.reduce((a, s) => a + s.durationSec, 0)
  const play = (sceneId?: string) => sceneId && navigate({ to: '/scene/$id', params: { id: sceneId }, search: { playlist: id, play: true } })

  return (
    <div className={PLAYLIST_GRID}>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-accent/30 to-surface p-5">
          {p.cover && <img src={sized(p.cover, 640)} alt="" className="aspect-video w-full rounded-xl object-cover" />}
          {editing ? (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (name.trim()) m.update.mutate({ id, name: name.trim(), description: p.description }, { onSuccess: () => setEditing(false) })
              }}
            >
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-lg bg-raised px-3 py-2 outline-none focus:ring-1 focus:ring-accent" />
              <Button type="submit" variant="solid">
                Save
              </Button>
            </form>
          ) : (
            <h1
              className="mt-4 cursor-text text-2xl font-black"
              onClick={() => {
                setName(p.name)
                setEditing(true)
              }}
              title="Rename"
            >
              {p.name}
            </h1>
          )}
          <div className="mt-1 text-sm text-white/70">
            {p.items.length} videos · {duration(total)}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="solid" onClick={() => play(ids[0])} disabled={!ids.length}>
              <Play size={16} className="fill-current" /> Play all
            </Button>
            {ids.length > 0 && (
              <Link to="/station" search={{ playlist: id }}>
                <Button title="Play the list full screen, in order, like a station">
                  <Radio size={16} /> Station
                </Button>
              </Link>
            )}
            <Button
              disabled={!ids.length}
              title="Play the list in a random order; the order you set stays"
              onClick={() => navigate({ to: '/station', search: { playlist: id, shuffle: true } })}
            >
              <Shuffle size={16} /> Shuffle
            </Button>
            {!p.favorites && (
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm(`Delete “${p.name}”?`)) m.remove.mutate(id, { onSuccess: () => navigate({ to: '/playlists' }) })
                }}
              >
                <Trash2 size={16} />
              </Button>
            )}
          </div>
        </div>
      </aside>
      <div>
        {!p.items.length && <Empty>Empty playlist. Use “Save” on any video to add it.</Empty>}
        <ol className="space-y-1">
          {p.items.map((s, i) => (
            <li
              key={s.id}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag !== null) move(drag, i)
                setDrag(null)
              }}
              className={`group flex items-center gap-3 rounded-xl p-2 hover:bg-surface ${drag === i ? 'opacity-40' : ''}`}
            >
              <GripVertical size={16} className="hidden shrink-0 cursor-grab text-muted sm:block" />
              <span className="w-6 shrink-0 text-center text-sm text-muted tabular-nums">{i + 1}</span>
              <Link to="/scene/$id" params={{ id: s.id }} search={{ playlist: id }} className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg sm:w-44">
                <img src={sized(s.screenshot, 320)} alt="" loading="lazy" className="size-full object-cover" />
                <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[11px] tabular-nums">{duration(s.durationSec)}</span>
              </Link>
              <div className="min-w-0 flex-1">
                <Link to="/scene/$id" params={{ id: s.id }} search={{ playlist: id }} className="line-clamp-2 text-sm font-semibold hover:text-accent">
                  {s.title}
                </Link>
                <div className="truncate text-xs text-muted">
                  {[s.studio?.name, s.performers.map((x) => x.name).slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <button onClick={() => move(i, i - 1)} className="hidden rounded-full p-2 text-muted hover:bg-raised hover:text-fg sm:inline-flex" aria-label="Move up">
                  <ArrowUp size={16} />
                </button>
                <button onClick={() => move(i, i + 1)} className="hidden rounded-full p-2 text-muted hover:bg-raised hover:text-fg sm:inline-flex" aria-label="Move down">
                  <ArrowDown size={16} />
                </button>
                <button onClick={() => m.removeItem.mutate({ id, sceneId: s.id })} className="rounded-full p-2 text-muted hover:bg-raised hover:text-red-400" aria-label="Remove">
                  <X size={16} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
