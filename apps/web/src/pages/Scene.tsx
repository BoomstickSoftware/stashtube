import type { JSX } from 'react'
import clsx from 'clsx'
import type { SceneCard as Scene } from '@flix/shared'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { Droplet, Ellipsis, ExternalLink, FolderOpen, ListVideo, Scissors } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AddFilterButton } from '../components/AddFilter'
import { CastLine } from '../components/CastLine'
import { CardMenu } from '../components/CardMenu'
import { PlayerSlot } from '../components/NowPlaying'
import { Moments } from '../components/Moments'
import { EditableTitle, IdentifyStatus, TagEditor } from '../components/SceneEditor'
import { useIdentify } from '../lib/identify'
import { FavoriteSceneButton, PlaylistMenu } from '../components/PlaylistMenu'
import { SceneCard } from '../components/SceneCard'
import { Avatar, ErrorBox, ListSkeleton, Spinner, Stars, Switch } from '../components/ui'
import { cachedCard, useAddO, usePlaylist, useRateScene, useReelsEnabled, useRelated, useScene, useSettings, useSceneEdits } from '../lib/api'
import { ClipSheet } from '../components/ClipSheet'
import { bytes, date, duration, resolution } from '../lib/format'
import { useMediaQuery } from '../lib/hooks'
import { upNext, useUpNext, withQueued } from '../lib/upNext'
import { nowPlaying } from '../lib/nowPlaying'
import { rememberScene } from '../lib/recent'
import { guardWrite } from '../lib/privacy'
import { asBool, useStored } from '../lib/storage'
import { sized, srcSet } from '@flix/shared'

const route = getRouteApi('/scene/$id')

// Beside the video (lg and up) the Related list stops here, about where the title and actions
// end, and the rest becomes a "More like this" grid under both columns: 24 compact rows ran two
// screens past the details with the left side empty. A playlist's Up next keeps its full order.
const SIDEBAR_MAX = 8

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
  const [oTapped, setOTapped] = useState(false)
  const addO = useAddO()
  const edits = useSceneEdits(id)
  const identify = useIdentify(id)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [clipping, setClipping] = useState(false)
  const reelsOn = useReelsEnabled()
  const [theater, setTheater] = useStored('flix.theater', asBool(false))
  const [autoplay, setAutoplay] = useStored('flix.autoplay', asBool(true))
  const [countdown, setCountdown] = useState<number | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const toggleTheater = useCallback(() => setTheater((v) => !v), [setTheater])
  const sideBySide = useMediaQuery('(min-width: 1024px)') // the lg two-column layout
  // On a finger screen the "+" filter badges become "Filter" chips: a bare "+" reads as
  // "follow" and its title never shows (phone audit, item 7).
  const touch = useMediaQuery('(pointer: coarse)')

  const rest: Scene[] = useMemo(() => {
    if (playlist.data) {
      const i = playlist.data.items.findIndex((s) => s.id === id)
      return playlist.data.items.slice(i + 1)
    }
    return related.data ?? []
  }, [playlist.data, related.data, id])
  // anything lined up with "Play next" goes first; opening a video takes it off that list
  const queued = useUpNext()
  const queue = useMemo(() => withQueued(queued, rest, id), [queued, rest, id])
  const nQueued = queued.filter((q) => q.id !== id).length
  useEffect(() => upNext.remove(id), [id])
  const next = queue[0]
  const capped = sideBySide && !playlist.data
  const listed = capped ? queue.slice(0, SIDEBAR_MAX) : queue
  const overflow = capped ? queue.slice(SIDEBAR_MAX) : []

  const goNext = useCallback(() => {
    setCountdown(null)
    if (next) navigate({ to: '/scene/$id', params: { id: next.id }, search: { ...(playlistId ? { playlist: playlistId } : {}), play: true } })
  }, [next, navigate, playlistId])

  useEffect(() => {
    if (countdown === null) return
    const timer = setTimeout(() => (countdown <= 1 ? goNext() : setCountdown(countdown - 1)), 1000)
    return () => clearTimeout(timer)
  }, [countdown, goNext])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [id])

  // The video itself lives in Layout's host (lib/nowPlaying.ts): this page opens it, keeps
  // its handlers current, and on leaving lets it dock or stop.
  const autoStart = !!play || !!settings?.playOnOpen
  useEffect(() => {
    if (scene && settings) nowPlaying.open(scene, { startAt: t, autoStart, theater })
  }, [scene, settings, t, autoStart, theater])
  useEffect(() => nowPlaying.setTheater(theater), [theater])
  // the Stations tab offers "Drift from" the last video opened (lib/recent)
  useEffect(() => {
    if (scene) rememberScene({ id: scene.id, title: scene.title })
  }, [scene])
  useEffect(() => {
    nowPlaying.setHandlers({
      onNext: next ? goNext : undefined,
      onEnded: () => autoplay && next && setCountdown(5),
      onTheater: toggleTheater,
    })
  }, [next, goNext, autoplay, toggleTheater])
  useEffect(() => () => nowPlaying.leave(id), [id])

  if (error) return <ErrorBox error={error} />
  // settings first: whether the video starts by itself depends on them
  if (isLoading || !scene || settingsLoading) return <ScenePlaceholder id={id} theater={theater} />

  const player = (
    <PlayerSlot theater={theater}>
      {countdown !== null && next && (
        <div className="absolute inset-0 z-[35] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-80 max-w-[90%] text-center">
            <div className="text-sm text-muted">Up next in {countdown}</div>
            <img src={sized(next.screenshot, 640)} alt="" className="mt-3 hidden aspect-video w-full rounded-xl object-cover sm:block" />
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
    </PlayerSlot>
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
                {scene.studio.image && <img src={sized(scene.studio.image, 320)} alt="" className="max-h-full max-w-full object-contain" />}
              </div>
              <div className="font-semibold break-words hover:text-accent">{scene.studio.name}</div>
            </Link>
            <AddFilterButton kind="studio" id={scene.studio.id} name={scene.studio.name} variant={touch ? 'chip' : 'icon'} />
          </div>
        )}
        {/* with a mouse: one row of pills. Under a finger: the stars on a line of their own, then four
            equal buttons, so the row never wraps unevenly and every target is 44 px */}
        <div className="ml-auto flex flex-wrap items-center gap-2 touch:ml-0 touch:grid touch:w-full touch:grid-cols-4 touch:[&>button]:min-h-11 touch:[&>button]:w-full touch:[&>button]:justify-center touch:[&>button]:gap-1.5 touch:[&>button]:px-2 touch:[&>div>button]:min-h-11 touch:[&>div>button]:w-full touch:[&>div>button]:justify-center touch:[&>div>button]:gap-1.5 touch:[&>div>button]:px-2">
          <div className="flex items-center rounded-full bg-raised px-2 py-1 touch:col-span-4 touch:justify-center">
            <Stars value={scene.rating} onChange={(rating) => guardWrite(() => rate.mutate({ id: scene.id, rating }))} />
          </div>
          <button
            onClick={() =>
              guardWrite(() => {
                setOTapped(true)
                addO.mutate(scene.id)
                // the moment matters as much as the count: mark it, once the video has been playing
                const t = nowPlaying.time()
                if (t > 3) edits.addMarker.mutate({ seconds: Math.round(t * 10) / 10, title: 'O' })
              })
            }
            title="Count an O here (adds a marker)"
            className="inline-flex items-center gap-1.5 rounded-full bg-raised px-4 py-2 text-sm hover:bg-line"
          >
            <Droplet key={scene.oCount} size={17} className={scene.oCount ? clsx('fill-sky-400 text-sky-400', oTapped && 'animate-pop') : ''} /> {scene.oCount}
          </button>
          <FavoriteSceneButton sceneId={scene.id} variant="button" />
          <PlaylistMenu sceneId={scene.id} />
          {reelsOn && (
            <button onClick={() => setClipping(true)} title="Mark a range and add it to a reel" className="inline-flex items-center gap-1.5 rounded-full bg-raised px-4 py-2 text-sm hover:bg-line">
              <Scissors size={17} /> Clip
            </button>
          )}
          {/* the rest (Mark as watched, Remove from Continue, Unlist, Identify, Delete) in the
              same menu a card's "⋯" opens */}
          <button
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setMenu({ x: r.left, y: r.bottom + 6 })
            }}
            title="More actions"
            aria-label="More actions"
            aria-haspopup="menu"
            className={clsx('inline-flex items-center rounded-full px-3 py-2 hover:bg-line touch:min-h-11 touch:px-3.5', scene.unlisted ? 'bg-white text-black hover:bg-white/80' : 'bg-raised')}
          >
            <Ellipsis size={18} />
          </button>
        </div>
        {scene.unlistedVia.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            Unlisted through{' '}
            {scene.unlistedVia.map((r, i) => (
              <span key={r.id}>
                {i > 0 && ', '}
                <b className="font-semibold text-fg/90">{r.name}</b>
              </span>
            ))}
            : kept off Home and recommendations, listed in the{' '}
            <Link to="/vault" className="underline decoration-line underline-offset-2 hover:text-accent">
              Vault
            </Link>
            .
          </p>
        )}
      </div>

      {scene.performers.length > 0 && (
        <div className="no-scrollbar mt-5 flex gap-4 overflow-x-auto pb-1">
          {scene.performers.map((p) => (
            <div key={p.id} className={clsx('relative flex shrink-0 flex-col items-center', touch ? 'w-24' : 'w-20')}>
              <Link to="/performer/$id" params={{ id: p.id }} className="group flex w-20 flex-col items-center text-center">
                <Avatar src={p.image} name={p.name} className="size-20 rounded-full object-top ring-2 ring-transparent transition group-hover:ring-accent" />
                <span className="mt-1.5 line-clamp-2 text-xs font-medium group-hover:text-accent">{p.name}</span>
              </Link>
              {touch ? (
                <AddFilterButton kind="performer" id={p.id} name={p.name} variant="chip" className="mt-1" />
              ) : (
                <AddFilterButton kind="performer" id={p.id} name={p.name} className="absolute top-0 right-0 shadow-lg" />
              )}
            </div>
          ))}
        </div>
      )}

      <Moments scene={scene} onSeek={(t) => nowPlaying.seek(t)} />

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
        <CastLine scene={scene} />
        <TagEditor scene={scene} />
        {/* File path, format and source links: only wanted for technical reasons, so folded. */}
        {(scene.file || scene.urls.length > 0) && (
          <>
            <button onClick={() => setShowDetails((v) => !v)} className="mt-3 text-xs font-semibold text-muted hover:text-fg">
              {showDetails ? 'Hide file and links' : 'Show file and links'}
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
        <IdentifyStatus identify={identify} />
        {clipping && <ClipSheet scene={scene} onClose={() => setClipping(false)} />}
      {menu && (
          <CardMenu
            scene={scene}
            at={menu}
            onClose={() => setMenu(null)}
            page={{ unlisted: scene.unlisted, identify, onDeleted: () => (window.history.length > 1 ? window.history.back() : navigate({ to: '/' })) }}
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
        <h2 className="mr-auto font-bold">{playlist.data || nQueued > 0 ? 'Up next' : 'Related'}</h2>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          Autoplay
          <Switch size="sm" on={autoplay} onChange={setAutoplay} />
        </label>
      </div>
      <div className="space-y-3">
        {related.isLoading && !playlist.data && <ListSkeleton rows={6} thumb="w-40" />}
        {listed.map((s, i) => (
          <UpNextItem key={s.id} scene={s} playlist={playlistId} queued={i < nQueued} />
        ))}
      </div>
    </aside>
  )

  const more = overflow.length > 0 && (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-bold tracking-tight sm:text-xl">More like this</h2>
      <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {overflow.map((s) => (
          <SceneCard key={s.id} scene={s} />
        ))}
      </div>
    </section>
  )

  if (theater) {
    return (
      <div>
        <div className="-mx-4 -mt-6 bg-black sm:-mx-6">{player}</div>
        <div className="mx-auto max-w-[1700px]">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
            {info}
            <div className="mt-4">{sidebar}</div>
          </div>
          {more}
        </div>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-[1800px]">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          {player}
          {info}
        </div>
        {sidebar}
      </div>
      {more}
    </div>
  )
}

function UpNextItem({ scene, playlist, queued }: { scene: Scene; playlist?: number; queued?: boolean }) {
  return (
    <Link
      to="/scene/$id"
      params={{ id: scene.id }}
      search={{ ...(playlist ? { playlist } : {}), play: true }}
      className="group flex gap-3 rounded-xl p-1 hover:bg-surface"
    >
      <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-surface">
        <img src={sized(scene.screenshot, 320)} alt="" loading="lazy" className="size-full object-cover" />
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
        {queued && <div className="mt-1 text-micro font-semibold text-accent">Queued</div>}
      </div>
    </Link>
  )
}

// While the full record loads: the card a list already had (screenshot, title, who), in the
// player's place, so a tap shows the video's picture at once rather than a blank spinner.
function ScenePlaceholder({ id, theater }: { id: string; theater: boolean }): JSX.Element {
  const card = cachedCard(id)
  if (!card) return <Spinner className="mx-auto mt-32" />
  const picture = (
    <div className={clsx('vt-media relative aspect-video overflow-hidden bg-black', theater ? 'max-h-[calc(100dvh-8rem)] w-full' : 'rounded-2xl')}>
      <img src={sized(card.screenshot, 960)} srcSet={srcSet(card.screenshot)} sizes="(min-width: 1024px) 70vw, 100vw" alt="" className="size-full object-contain opacity-80" />
      <Spinner className="absolute inset-0 m-auto size-10" />
    </div>
  )
  const info = (
    <div className="mt-4 min-w-0">
      <h1 className="text-xl font-bold sm:text-2xl">{card.title}</h1>
      {card.performers.length > 0 && <div className="mt-1 text-muted">{card.performers.map((p) => p.name).join(', ')}</div>}
    </div>
  )
  // the same frames as the page itself, so nothing moves when the video arrives
  if (theater)
    return (
      <div>
        <div className="-mx-4 -mt-6 bg-black sm:-mx-6">{picture}</div>
        <div className="mx-auto max-w-[1700px]">{info}</div>
      </div>
    )
  return (
    <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0">
        {picture}
        {info}
      </div>
    </div>
  )
}
