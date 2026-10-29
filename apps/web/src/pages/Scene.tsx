import type { JSX } from 'react'
import type { SceneCard as Scene } from '@flix/shared'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import { Droplet, ExternalLink, FolderOpen, ListVideo, Radio, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AddFilterButton } from '../components/AddFilter'
import { DeleteScenesDialog } from '../components/DeleteScenes'
import { Player } from '../components/Player'
import { Chapters, EditableTitle, IdentifyButton, TagEditor } from '../components/SceneEditor'
import { FavoriteSceneButton, PlaylistMenu } from '../components/PlaylistMenu'
import { Avatar, ErrorBox, Spinner, Stars } from '../components/ui'
import { useAddO, useFeatures, usePlaylist, useRateScene, useRelated, useScene, useSettings } from '../lib/api'
import { bytes, date, duration, resolution } from '../lib/format'

const route = getRouteApi('/scene/$id')

// Keyed by id so per-video state (countdown, expanded details) starts fresh.
export function ScenePage(): JSX.Element {
  const { id } = route.useParams()
  return <SceneView key={id} id={id} />
}

function SceneView({ id }: { id: string }) {
  const { playlist: playlistId, t, play } = route.useSearch()
  const { data: settings, isLoading: settingsLoading } = useSettings()
  const navigate = useNavigate()
  const { data: scene, error, isLoading } = useScene(id)
  const related = useRelated(id)
  const playlist = usePlaylist(playlistId)
  const rate = useRateScene()
  const addO = useAddO()
  const { data: features } = useFeatures()
  const [deleting, setDeleting] = useState(false)
  const [theater, setTheater] = useState(() => localStorage.getItem('flix.theater') === '1')
  const [autoplay, setAutoplay] = useState(() => localStorage.getItem('flix.autoplay') !== '0')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  const queue: Scene[] = useMemo(() => {
    if (playlist.data) {
      const i = playlist.data.items.findIndex((s) => s.id === id)
      return playlist.data.items.slice(i + 1)
    }
    return related.data ?? []
  }, [playlist.data, related.data, id])
  const next = queue[0]

  const goNext = useCallback(() => {
    setCountdown(null)
    if (next) navigate({ to: '/scene/$id', params: { id: next.id }, search: { ...(playlistId ? { playlist: playlistId } : {}), play: true } })
  }, [next, navigate, playlistId])

  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      goNext()
      return
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, goNext])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [id])

  if (error) return <ErrorBox error={error} />
  // settings first: whether the video starts by itself depends on them
  if (isLoading || !scene || settingsLoading) return <Spinner className="mx-auto mt-32" />

  const toggleTheater = () => {
    setTheater((v) => {
      localStorage.setItem('flix.theater', v ? '0' : '1')
      return !v
    })
  }

  const player = (
    <div className="relative">
      <Player
        key={scene.id}
        scene={scene}
        theater={theater}
        onTheater={toggleTheater}
        startAt={t}
        autoStart={!!play || !!settings?.playOnOpen}
        onNext={next ? goNext : undefined}
        onEnded={() => autoplay && next && setCountdown(5)}
      />
      {countdown !== null && next && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-80 max-w-[90%] text-center">
            <div className="text-sm text-muted">Up next in {countdown}</div>
            <img src={next.screenshot} alt="" className="mt-3 hidden aspect-video w-full rounded-xl object-cover sm:block" />
            <div className="mt-3 line-clamp-2 font-semibold">{next.title}</div>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => setCountdown(null)} className="rounded-full bg-raised px-5 py-2 text-sm hover:bg-line">
                Cancel
              </button>
              <button onClick={goNext} className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-accent hover:text-white">
                Play now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const res = resolution(scene.height)

  const info = (
    <div className="mt-4">
      <EditableTitle scene={scene} />
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        {scene.studio && (
          <div className="flex min-w-0 items-center gap-2">
            <Link to="/studio/$id" params={{ id: scene.studio.id }} className="flex min-w-0 items-center gap-2.5">
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-1">
                {scene.studio.image && <img src={scene.studio.image} alt="" className="max-h-full max-w-full object-contain" />}
              </div>
              <div className="font-semibold break-words hover:text-accent">{scene.studio.name}</div>
            </Link>
            <AddFilterButton kind="studio" id={scene.studio.id} name={scene.studio.name} />
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-full bg-raised px-2 py-1">
            <Stars value={scene.rating} onChange={(rating) => rate.mutate({ id: scene.id, rating })} />
          </div>
          <button
            onClick={() => addO.mutate(scene.id)}
            title="O counter"
            className="inline-flex items-center gap-1.5 rounded-full bg-raised px-4 py-2 text-sm hover:bg-line"
          >
            <Droplet size={17} className={scene.oCount ? 'fill-sky-400 text-sky-400' : ''} /> {scene.oCount}
          </button>
          <FavoriteSceneButton sceneId={scene.id} variant="button" />
          {features?.deleteScenes && (
            <button
              onClick={() => setDeleting(true)}
              title="Delete video"
              className="inline-flex items-center gap-1.5 rounded-full bg-raised px-4 py-2 text-sm text-red-400 hover:bg-red-500/15"
            >
              <Trash2 size={17} /> Delete
            </button>
          )}
          <PlaylistMenu sceneId={scene.id} />
        </div>
      </div>

      {scene.performers.length > 0 && (
        <div className="no-scrollbar mt-5 flex gap-4 overflow-x-auto pb-1">
          {scene.performers.map((p) => (
            <div key={p.id} className="relative shrink-0">
              <Link to="/performer/$id" params={{ id: p.id }} className="group flex w-20 flex-col items-center text-center">
                <Avatar src={p.image} name={p.name} className="size-20 rounded-full object-top ring-2 ring-transparent transition group-hover:ring-accent" />
                <span className="mt-1.5 line-clamp-2 text-xs font-medium group-hover:text-accent">{p.name}</span>
              </Link>
              <AddFilterButton kind="performer" id={p.id} name={p.name} className="absolute top-0 right-0 shadow-lg" />
            </div>
          ))}
        </div>
      )}

      <Chapters
        scene={scene}
        onSeek={(t) => {
          const v = document.querySelector<HTMLVideoElement>('main video[poster]') // the player; card previews have no poster
          if (v) v.currentTime = t
        }}
      />

      <div className="mt-5 rounded-2xl bg-surface p-4 text-sm">
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-medium">
          {date(scene.date) && <span>{date(scene.date)}</span>}
          <span>{duration(scene.durationSec)}</span>
          {res && <span>{res}</span>}
          {scene.playCount > 0 && <span>{scene.playCount} views</span>}
          {scene.code && <span className="text-muted">{scene.code}</span>}
        </div>
        {scene.details && <p className="mt-2 whitespace-pre-line text-white/80">{scene.details}</p>}
        {scene.director && <div className="mt-2 text-xs text-muted">Director: {scene.director}</div>}
        <TagEditor scene={scene} />
        {/* File path, format and source links: only wanted for technical reasons, so folded. */}
        {(scene.file || scene.urls.length > 0) && (
          <>
            <button onClick={() => setShowDetails((v) => !v)} className="mt-3 text-xs font-semibold text-muted hover:text-fg">
              {showDetails ? 'Hide file and links' : 'File and links'}
            </button>
            {showDetails && (
              <div className="mt-2 space-y-1 text-xs text-muted">
                {scene.file && (
                  <>
                    <div className="flex items-center gap-1.5 break-all">
                      <FolderOpen size={13} className="shrink-0" /> {scene.file.path}
                    </div>
                    <div>
                      {scene.file.container} · {scene.file.videoCodec} / {scene.file.audioCodec} · {scene.width}×{scene.height} ·{' '}
                      {scene.file.framerate?.toFixed(2)} fps · {(scene.file.bitrate / 1e6).toFixed(1)} Mbps · {bytes(scene.file.size)}
                    </div>
                  </>
                )}
                {scene.urls.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 break-all hover:text-fg">
                    <ExternalLink size={12} className="shrink-0" /> {u}
                  </a>
                ))}
              </div>
            )}
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <IdentifyButton scene={scene} />
        </div>
        {deleting && (
          <DeleteScenesDialog
            scenes={[{ id: scene.id, title: scene.title }]}
            onClose={() => setDeleting(false)}
            onDeleted={() => (window.history.length > 1 ? window.history.back() : navigate({ to: '/' }))}
          />
        )}
      </div>
    </div>
  )

  const sidebar = (
    <aside>
      {playlist.data && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-surface p-4">
          <ListVideo size={18} className="text-accent" />
          <Link to="/playlist/$id" params={{ id: String(playlist.data.id) }} className="font-semibold hover:text-accent">
            {playlist.data.name}
          </Link>
          <span className="text-xs text-muted">
            {playlist.data.items.findIndex((s) => s.id === id) + 1} / {playlist.data.items.length}
          </span>
        </div>
      )}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">{playlist.data ? 'Up next' : 'Related'}</h2>
        <Link
          to="/station"
          search={{ from: scene.id }}
          className="mr-auto ml-3 inline-flex items-center gap-1 rounded-full bg-raised px-2.5 py-1 text-xs font-medium hover:bg-line"
          title="Endless play drifting through related videos"
        >
          <Radio size={13} /> Station
        </Link>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          Autoplay
          <button
            role="switch"
            aria-checked={autoplay}
            onClick={() => {
              localStorage.setItem('flix.autoplay', autoplay ? '0' : '1')
              setAutoplay(!autoplay)
            }}
            className={clsx('relative h-5 w-9 rounded-full transition-colors', autoplay ? 'bg-accent' : 'bg-line')}
          >
            <span className={clsx('absolute top-0.5 size-4 rounded-full bg-white transition-all', autoplay ? 'left-4.5' : 'left-0.5')} />
          </button>
        </label>
      </div>
      <div className="space-y-3">
        {related.isLoading && !playlist.data && <Spinner className="mx-auto my-8" />}
        {queue.map((s) => (
          <UpNextItem key={s.id} scene={s} playlist={playlistId} />
        ))}
      </div>
    </aside>
  )

  if (theater) {
    return (
      <div>
        <div className="-mx-4 -mt-6 bg-black sm:-mx-6">{player}</div>
        <div className="mx-auto grid max-w-[1700px] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
          {info}
          <div className="mt-4">{sidebar}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0">
        {player}
        {info}
      </div>
      {sidebar}
    </div>
  )
}

function UpNextItem({ scene, playlist }: { scene: Scene; playlist?: number }) {
  return (
    <Link
      to="/scene/$id"
      params={{ id: scene.id }}
      search={{ ...(playlist ? { playlist } : {}), play: true }}
      className="group flex gap-3 rounded-xl p-1 hover:bg-surface"
    >
      <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-surface">
        <img src={scene.screenshot} alt="" loading="lazy" className="size-full object-cover" />
        <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[11px] tabular-nums">{duration(scene.durationSec)}</span>
        {scene.resumeTime > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
            <div className="h-full bg-accent" style={{ width: `${(scene.resumeTime / scene.durationSec) * 100}%` }} />
          </div>
        )}
      </div>
      <div className="min-w-0 py-0.5">
        <div className="line-clamp-2 text-sm leading-snug font-semibold group-hover:text-white">{scene.title}</div>
        <div className="mt-1 truncate text-xs text-muted">{scene.studio?.name}</div>
        <div className="truncate text-xs text-muted">{scene.performers.map((p) => p.name).slice(0, 3).join(', ')}</div>
      </div>
    </Link>
  )
}
