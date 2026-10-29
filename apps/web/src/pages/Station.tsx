import type { SceneCard, SceneDetail, SceneQuery } from '@flix/shared'
import type { JSX } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import {
  Bookmark,
  ExternalLink,
  Heart,
  ListVideo,
  Moon,
  Pause,
  Play,
  Radio,
  RotateCcw,
  RotateCw,
  Save,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SeekBar, type SeekPoint } from '../components/SeekBar'
import { Spinner } from '../components/ui'
import {
  get,
  saveStationResume,
  useFavoriteScenes,
  useSceneEdits,
  useSettings,
  useStationMutations,
  useStationResumes,
  useStations,
  useToggleFavoriteScene,
} from '../lib/api'
import { duration as fmt } from '../lib/format'
import { canDirectPlay } from '../lib/media'
import { attachSource, nextMarker, useFlash, usePlayerKeys, useWatchAccounting } from '../lib/playback'
import {
  loadPrefs,
  savePrefs,
  type Segment,
  segmentsFor,
  segmentsFrom,
  stationKey,
  StationQueue,
  type StationPrefs,
  stationQuery,
  windows,
} from '../lib/station'

const route = getRouteApi('/station')
const FADE_MS = 700
const HIDE_MS = 3000
const SAVE_SPOT_EVERY = 15 // seconds of play between saves of where the station is
const SEEK_STEP = 10
const UP_NEXT = 30 // scenes listed in the side panel, more on request
const SLEEP_CHOICES = [15, 30, 60] // minutes

interface Config {
  id?: number // saved station
  name?: string
  query: SceneQuery
  from?: string
  prefs: StationPrefs
  key: string // where its resume point is saved
  resume?: { sceneId: string; seconds: number } // start here
}

// /station?id=<saved station>, or ad hoc: a filter set, or from=<scene id>. unwatched=1 on a
// saved station plays only its unwatched videos; start=resume picks up where it was left.
export function Station(): JSX.Element {
  const { id, from, start, ...q } = route.useSearch()
  const stations = useStations()
  const resumes = useStationResumes()
  const wait = <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black"><Spinner /></div>
  let config: Omit<Config, 'key'>
  if (id) {
    const saved = stations.data?.find((s) => s.id === id)
    if (stations.isPending) return wait
    if (!saved) return <div className="py-24 text-center text-muted">That station no longer exists.</div>
    config = {
      id,
      name: saved.name,
      query: q.unwatched ? { ...saved.query, unwatched: true } : saved.query,
      from: saved.from,
      prefs: { mode: saved.mode, window: saved.window },
    }
  } else config = { query: stationQuery(q), from, prefs: loadPrefs() }
  const key = stationKey(config)
  if (start === 'resume' && resumes.isPending) return wait
  const r = start === 'resume' ? resumes.data?.find((x) => x.key === key) : undefined
  return (
    <StationPlayer
      key={JSON.stringify([key, start, q.unwatched])}
      config={{ ...config, key, resume: r && { sceneId: r.scene.id, seconds: r.seconds } }}
    />
  )
}

// Full-screen endless play: Skip moves to the next video. In Moments mode it fades between
// windows of each video, then on to the next. The seek bar, ±10 s and the markers work as on a
// video page; seeking in Moments mode plays a moment from there. The list shows what has played
// and what is coming, and jumps to any of it.
function StationPlayer({ config }: { config: Config }): JSX.Element {
  const navigate = useNavigate()
  const { data: settings } = useSettings()
  const { add, update } = useStationMutations()
  const [prefs, setPrefsState] = useState<StationPrefs>(config.prefs)
  const [naming, setNaming] = useState(false)
  const [scene, setScene] = useState<SceneDetail | null>(null)
  const [state, setState] = useState<'loading' | 'playing' | 'paused' | 'empty' | 'tap' | 'error'>('loading')
  const [dim, setDim] = useState(true)
  const [muted, setMuted] = useState(false)
  const [shown, setShown] = useState(true)
  const [segInfo, setSegInfo] = useState<{ i: number; n: number; segs: Segment[] }>({ i: 0, n: 1, segs: [] })
  const [time, setTime] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [dur, setDur] = useState(0)
  const [point, setPoint] = useState<SeekPoint | null>(null)
  const [flash, setFlash] = useFlash()
  const [panel, setPanel] = useState(false)
  const [sleepAt, setSleepAt] = useState<number | null>(null) // epoch ms when the station pauses itself
  const [slept, setSlept] = useState(false)
  const [now, setNow] = useState(0) // refreshed every half minute while the sleep timer runs, for its pill
  useEffect(() => {
    if (!sleepAt) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [sleepAt])
  const [list, setList] = useState<{ history: SceneCard[]; upcoming: SceneCard[]; canBack: boolean }>({ history: [], upcoming: [], canBack: false })
  const listSize = useRef(UP_NEXT)

  const video = useRef<HTMLVideoElement>(null)
  const segs = useRef<Segment[]>([])
  const segIdx = useRef(0)
  const busy = useRef(false) // a fade or scene change is running
  const prefsRef = useRef(prefs)
  const introRef = useRef<Record<string, number>>({})
  const sinceSave = useRef(0) // seconds played since the station's spot was saved
  const lastT = useRef(0)
  const [fallen, setFallen] = useState<string | null>(null) // the scene whose direct play errored: use HLS
  const hideTimer = useRef<number>(undefined)
  const [queue] = useState(() => new StationQueue(config.query, config.from))
  useEffect(() => {
    introRef.current = settings?.introSkip ?? {}
  }, [settings])

  // The scene as the rest of the app sees it, so a marker added here shows on the bar.
  const live = useQuery({ queryKey: ['scene', scene?.id], queryFn: () => get<SceneDetail>(`/scenes/${scene!.id}`), enabled: !!scene, staleTime: 60_000 })
  const markers = (live.data ?? scene)?.markers ?? []
  // Full videos count as watched in Stash (plays, history, resume point) as on the video page;
  // Moments only sample, so they leave no trace.
  const { onTimeUpdate: accountTime, flush } = useWatchAccounting(video, scene?.id, { resume: prefs.mode === 'full' })
  const edits = useSceneEdits(scene?.id ?? '')
  const favorites = useFavoriteScenes()
  const toggleFavorite = useToggleFavoriteScene()

  const skipOf = (s: SceneDetail) => (s.studio ? (introRef.current[s.studio.id] ?? 0) : 0)

  // Where the station is, saved now and then so it can be resumed.
  const spot = useRef<{ id: string; t: number } | null>(null)
  const saveSpot = useCallback(() => {
    const s = spot.current
    if (s) saveStationResume(config.key, s.id, s.t).catch(() => {})
  }, [config.key])
  useEffect(() => {
    addEventListener('pagehide', saveSpot)
    return () => {
      removeEventListener('pagehide', saveSpot)
      saveSpot()
    }
  }, [saveSpot])

  const refreshList = useCallback(() => {
    queue.upcoming(listSize.current).then(
      (upcoming) => setList({ history: [...queue.history], upcoming, canBack: queue.canGoBack }),
      () => {},
    )
  }, [queue])

  const fade = (to: 'in' | 'out') =>
    new Promise<void>((done) => {
      setDim(to === 'out')
      const v = video.current
      if (!v) return done()
      const from = v.volume
      const target = to === 'out' ? 0 : 1
      const t0 = performance.now()
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / FADE_MS)
        v.volume = from + (target - from) * k
        if (k < 1) requestAnimationFrame(step)
        else done()
      }
      requestAnimationFrame(step)
    })

  const play = useCallback(() => {
    video.current?.play().then(
      () => setState('playing'),
      (e: Error) => setState(e.name === 'NotAllowedError' ? 'tap' : 'error'),
    )
  }, [])

  // Change scene: the next one, the previous one, or one picked from the list, optionally
  // starting at a given point (a resume).
  const load = useCallback(
    async (open: () => Promise<SceneDetail | null>, at?: number) => {
      busy.current = true
      await fade('out')
      setState('loading')
      try {
        const s = await open()
        if (!s) return setState('empty')
        const skip = s.studio ? (introRef.current[s.studio.id] ?? 0) : 0
        const t = at !== undefined && at > 5 && at < s.durationSec - 15 ? at : null
        segs.current = t === null ? segmentsFor(s, prefsRef.current, skip) : segmentsFrom(s, prefsRef.current, t, skip)
        segIdx.current = 0
        setSegInfo({ i: 0, n: segs.current.length, segs: segs.current })
        setScene(s)
        refreshList()
      } catch {
        setState('error')
        busy.current = false
      }
    },
    [refreshList],
  )
  const nextScene = useCallback(() => load(() => queue.next()), [load, queue])
  const prevScene = () => list.canBack && load(() => queue.back())
  const pick = (id: string) => load(() => queue.jump(id))

  // Load each scene's source and seek to its first segment. A direct file that errors is
  // retried through Stash's HLS transcode from the same point (`fallen`).
  useEffect(() => {
    const v = video.current
    if (!scene || !v) return
    const direct = canDirectPlay(scene.playback) && fallen !== scene.id
    const start = fallen === scene.id ? lastT.current : (segs.current[0]?.start ?? 0)
    setTime(start)
    setBuffered(0)
    setDur(scene.durationSec)
    const onMeta = () => {
      setDur(v.duration || scene.durationSec)
      if (Math.abs(v.currentTime - start) > 1) v.currentTime = start
      play()
    }
    v.addEventListener('loadedmetadata', onMeta, { once: true })
    const detach = attachSource(v, direct ? scene.playback.direct : scene.playback.hls, start)
    sinceSave.current = 0
    lastT.current = start
    spot.current = { id: scene.id, t: start }
    return () => {
      detach()
      v.removeEventListener('loadedmetadata', onMeta)
    }
  }, [scene, fallen, play])
  const onError = () => {
    if (scene && canDirectPlay(scene.playback) && fallen !== scene.id) {
      lastT.current = video.current?.currentTime || lastT.current
      setFallen(scene.id)
    } else nextScene()
  }

  const resume = useRef(config.resume)
  useEffect(() => {
    const r = resume.current
    // after mount: it sets state
    const t = setTimeout(() => (r ? load(() => queue.jump(r.sceneId), r.seconds) : nextScene()))
    return () => clearTimeout(t)
  }, [load, nextScene, queue])

  const nextSegment = useCallback(async () => {
    const v = video.current!
    if (segIdx.current + 1 >= segs.current.length) return nextScene()
    busy.current = true
    await fade('out')
    segIdx.current++
    setSegInfo({ i: segIdx.current, n: segs.current.length, segs: segs.current })
    v.currentTime = segs.current[segIdx.current]!.start
    v.addEventListener(
      'seeked',
      () => {
        busy.current = false
        fade('in')
      },
      { once: true },
    )
  }, [nextScene])

  const onTime = () => {
    const v = video.current!
    const seg = segs.current[segIdx.current]
    const t = v.currentTime
    setTime(t)
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
    accountTime()
    if (t > lastT.current && t - lastT.current < 2) sinceSave.current += t - lastT.current
    lastT.current = t
    if (scene) spot.current = { id: scene.id, t }
    if (sleepAt && Date.now() >= sleepAt) {
      setSleepAt(null)
      setSlept(true)
      v.pause()
      setState('paused')
      flush()
      saveSpot()
      return
    }
    if (sinceSave.current >= SAVE_SPOT_EVERY) {
      sinceSave.current = 0
      saveSpot()
    }
    if (!busy.current && seg && seg.end < v.duration - 1 && t >= seg.end - FADE_MS / 1000) nextSegment()
  }

  // A seek the viewer chose. In Moments mode the plan restarts from there.
  const seekTo = (t: number) => {
    const v = video.current
    if (!v || !scene) return
    const to = Math.max(0, Math.min((v.duration || dur) - 0.5, t))
    v.currentTime = to
    setTime(to)
    if (prefsRef.current.mode === 'moments') {
      segs.current = segmentsFrom(scene, prefsRef.current, to, skipOf(scene))
      segIdx.current = 0
      setSegInfo({ i: 0, n: segs.current.length, segs: segs.current })
    }
    if (dim && !busy.current) fade('in')
  }
  const seekBy = (d: number) => {
    seekTo((video.current?.currentTime ?? 0) + d)
    setFlash(d > 0 ? `+${d}s` : `${d}s`)
  }
  const mark = () => {
    if (!scene) return
    edits.addMarker.mutate({ seconds: Math.round((video.current?.currentTime ?? 0) * 10) / 10, title: '' })
    setFlash('Marked')
  }
  const jumpMarker = (dir: 1 | -1) => {
    const m = nextMarker(markers, video.current?.currentTime ?? 0, dir)
    if (m) {
      seekTo(m.seconds)
      setFlash(m.title || fmt(m.seconds))
    }
  }

  const setPrefs = (p: StationPrefs) => {
    setPrefsState(p)
    prefsRef.current = p
    if (config.id) update.mutate({ id: config.id, mode: p.mode, window: p.window })
    else savePrefs(p)
    // re-plan the current video from where it is now
    const v = video.current
    if (!scene || !v) return
    const now = v.currentTime
    const ahead = segmentsFor(scene, p, skipOf(scene)).filter((s) => s.end > now + 2)
    if (!ahead.length) return void nextScene()
    segs.current = ahead
    segIdx.current = 0
    setSegInfo({ i: 0, n: ahead.length, segs: ahead })
    if (now < ahead[0]!.start) v.currentTime = ahead[0]!.start
  }

  const exit = () => (window.history.length > 1 ? window.history.back() : navigate({ to: '/' }))
  const toggle = () => {
    const v = video.current!
    if (v.paused) play()
    else {
      v.pause()
      setState('paused')
      flush()
    }
  }
  const poke = () => {
    setShown(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShown(false), HIDE_MS)
  }
  useEffect(() => () => clearTimeout(hideTimer.current), [])

  const togglePanel = () => {
    if (!panel) refreshList()
    setPanel((p) => !p)
  }

  // Keys follow the video page where they overlap (space, arrows, j/l, b, [ ], m).
  usePlayerKeys((e) => {
    if (e.key === ' ' || e.key === 'k') toggle()
    else if (e.key === 'ArrowRight') seekBy(5)
    else if (e.key === 'ArrowLeft') seekBy(-5)
    else if (e.key === 'l') seekBy(SEEK_STEP)
    else if (e.key === 'j') seekBy(-SEEK_STEP)
    else if (e.key === 'n' || e.key === 'N') nextScene()
    else if (e.key === 'p' || e.key === 'P') prevScene()
    else if (e.key === 'b') mark()
    else if (e.key === ']') jumpMarker(1)
    else if (e.key === '[') jumpMarker(-1)
    else if (e.key === 'q') togglePanel()
    else if (e.key === 'm') setMuted((m) => !m)
    else if (e.key === 'Escape') {
      if (panel) setPanel(false)
      else exit()
    } else return false
    poke()
    return true
  })

  const controlsVisible = shown || state !== 'playing' || point !== null
  const shownTime = point?.scrubbing ? point.t : time
  const btn = 'flex size-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 disabled:opacity-40'
  const small = 'flex size-10 items-center justify-center rounded-full text-white hover:bg-white/15 disabled:opacity-40'
  const fav = scene ? favorites.has(scene.id) : false

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white select-none" onPointerMove={poke} onPointerDown={poke}>
      <div className={clsx('absolute inset-0 transition-[right] duration-300', panel && 'sm:right-96', !controlsVisible && 'cursor-none')}>
        <video
          ref={video}
          playsInline
          muted={muted}
          onTimeUpdate={onTime}
          onEnded={() => {
            flush()
            nextScene()
          }}
          onPlaying={() => {
            setState('playing')
            if (busy.current || dim) {
              busy.current = false
              fade('in')
            }
          }}
          onError={onError}
          onClick={toggle}
          className={clsx('absolute inset-0 size-full object-contain transition-opacity ease-in-out', dim ? 'opacity-0' : 'opacity-100')}
          style={{ transitionDuration: `${FADE_MS}ms` }}
        />

        {slept && state === 'paused' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <Moon size={36} className="text-accent" />
            <div className="text-sm text-white/80">Sleep timer ended</div>
            <button
              onClick={() => {
                setSlept(false)
                play()
              }}
              className="rounded-full bg-white px-5 py-2.5 font-semibold text-black"
            >
              Keep going
            </button>
          </div>
        )}
        {(state === 'loading' || state === 'tap' || state === 'empty' || state === 'error') && (
          <div className="absolute inset-0 flex items-center justify-center">
            {state === 'loading' && <Spinner />}
            {state === 'tap' && (
              <button onClick={play} className="flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-black">
                <Play size={18} className="fill-current" /> Start station
              </button>
            )}
            {state === 'empty' && <div className="px-6 text-center text-white/70">Nothing matches this station’s filters.</div>}
            {state === 'error' && (
              <button onClick={() => nextScene()} className="rounded-full bg-white/10 px-5 py-2.5">
                Couldn’t load that one. Try the next
              </button>
            )}
          </div>
        )}
        {flash && (
          <div className="pointer-events-none absolute inset-0 m-auto flex h-12 w-fit items-center justify-center rounded-full bg-black/60 px-5 text-lg font-semibold">
            {flash}
          </div>
        )}

        <div
          className={clsx(
            'pointer-events-none absolute inset-0 flex flex-col justify-between transition-opacity duration-300',
            controlsVisible ? 'opacity-100' : 'opacity-0',
          )}
        >
          <div className="pointer-events-auto flex items-start gap-3 bg-gradient-to-b from-black/70 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <button onClick={exit} className={btn} aria-label="Leave station">
              <X size={22} />
            </button>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center gap-1.5 text-xs font-bold tracking-widest text-accent uppercase">
                <Radio size={13} /> {config.name ?? `Station${config.from ? ' · like a video' : ''}`}
                {config.query.unwatched && <span className="tracking-normal text-white/60 normal-case">· unwatched</span>}
                {!config.id && !naming && (
                  <button
                    onClick={() => setNaming(true)}
                    className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] tracking-normal text-white normal-case hover:bg-white/25"
                  >
                    <Save size={11} /> Save
                  </button>
                )}
              </div>
              {naming && (
                <form
                  className="mt-1.5 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
                    if (!name) return
                    add.mutate(
                      { name, query: config.query, from: config.from, mode: prefs.mode, window: prefs.window },
                      { onSuccess: ({ id }) => navigate({ to: '/station', search: { id }, replace: true }) },
                    )
                  }}
                >
                  <input
                    name="name"
                    autoFocus
                    maxLength={80}
                    placeholder="Name this station"
                    className="min-w-0 flex-1 rounded-full bg-white/15 px-3 py-1 text-base outline-none placeholder:text-white/50 focus:ring-1 focus:ring-accent sm:text-sm"
                  />
                  <button className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-black" disabled={add.isPending}>
                    Save
                  </button>
                </form>
              )}
              {scene && (
                <>
                  <div className="mt-0.5 line-clamp-2 font-semibold break-words">{scene.title}</div>
                  <div className="truncate text-sm text-white/70">
                    {[scene.studio?.name, scene.performers.map((p) => p.name).slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
                  </div>
                </>
              )}
            </div>
            {scene && (
              <button
                onClick={() =>
                  navigate({ to: '/scene/$id', params: { id: scene.id }, search: { t: Math.floor(video.current?.currentTime ?? 0) || undefined, play: true } })
                }
                className={btn}
                aria-label="Open this video here"
                title="Open this video here"
              >
                <ExternalLink size={20} />
              </button>
            )}
            <button onClick={togglePanel} className={clsx(btn, panel && '!bg-white !text-black')} aria-label="Station list (q)" title="Station list (q)">
              <ListVideo size={20} />
            </button>
          </div>

          <div className="pointer-events-auto bg-gradient-to-t from-black/80 via-black/50 to-transparent px-4 pt-10 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-5xl">
              {scene && (
                <SeekBar
                  dur={dur}
                  time={time}
                  buffered={buffered}
                  markers={markers}
                  vtt={scene.vtt}
                  spans={prefs.mode === 'moments' ? segInfo.segs : undefined}
                  onSeek={seekTo}
                  onPoint={setPoint}
                />
              )}
              <div className="mt-1 flex items-center gap-1 text-[13px] text-white/80 tabular-nums">
                {scene && (
                  <span>
                    {fmt(shownTime)} <span className="text-white/50">/ {fmt(dur)}</span>
                  </span>
                )}
                <span className="ml-auto" />
                <button onClick={mark} disabled={!scene} className={small} title="Mark this moment (b)" aria-label="Mark this moment">
                  <Bookmark size={18} />
                </button>
                <button
                  onClick={() => scene && toggleFavorite.mutate({ id: scene.id, favorite: !fav })}
                  disabled={!scene}
                  className={small}
                  title={fav ? 'Remove from Favorites' : 'Add to Favorites'}
                  aria-label={fav ? 'Remove from Favorites' : 'Add to Favorites'}
                  aria-pressed={fav}
                >
                  <Heart size={18} className={fav ? 'fill-accent text-accent' : ''} />
                </button>
              </div>
            </div>
            <div className="mx-auto mt-2 flex max-w-2xl items-center justify-center gap-2 sm:gap-3">
              <button onClick={prevScene} disabled={!list.canBack} className={btn} aria-label="Previous video (p)" title="Previous video (p)">
                <SkipBack size={20} className="fill-current" />
              </button>
              <button onClick={() => seekBy(-SEEK_STEP)} className={btn} aria-label={`Back ${SEEK_STEP} seconds (j)`} title={`Back ${SEEK_STEP} s (j)`}>
                <RotateCcw size={20} />
              </button>
              <button onClick={toggle} className={btn} aria-label={state === 'paused' ? 'Play' : 'Pause'}>
                {state === 'paused' ? <Play size={22} className="fill-current" /> : <Pause size={22} className="fill-current" />}
              </button>
              <button onClick={() => seekBy(SEEK_STEP)} className={btn} aria-label={`Forward ${SEEK_STEP} seconds (l)`} title={`Forward ${SEEK_STEP} s (l)`}>
                <RotateCw size={20} />
              </button>
              <button
                onClick={() => nextScene()}
                className="flex h-12 items-center gap-2 rounded-full bg-white px-5 font-semibold text-black hover:bg-accent hover:text-white"
                title="Next video (n)"
              >
                <SkipForward size={20} className="fill-current" /> Skip
              </button>
              <button onClick={() => setMuted((m) => !m)} className={clsx(btn, 'max-sm:hidden')} aria-label={muted ? 'Unmute' : 'Mute'}>
                {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
              </button>
            </div>
            <div className="mx-auto mt-3 flex max-w-2xl flex-wrap items-center justify-center gap-2 text-sm">
              {(['full', 'moments'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPrefs({ ...prefs, mode: m })}
                  className={clsx('rounded-full px-3 py-1', prefs.mode === m ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20')}
                >
                  {m === 'full' ? 'Full videos' : 'Moments'}
                </button>
              ))}
              {prefs.mode === 'moments' && (
                <>
                  <span className="mx-1 h-4 w-px bg-white/20" />
                  {windows.map((w) => (
                    <button
                      key={w}
                      onClick={() => setPrefs({ ...prefs, window: w })}
                      className={clsx('rounded-full px-3 py-1', prefs.window === w ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20')}
                    >
                      {w}s
                    </button>
                  ))}
                  {segInfo.n > 1 && (
                    <span className="ml-1 text-white/60 tabular-nums">
                      {segInfo.i + 1}/{segInfo.n}
                    </span>
                  )}
                </>
              )}
              <span className="mx-1 h-4 w-px bg-white/20" />
              <SleepPill
                at={sleepAt}
                now={now}
                onChange={(at) => {
                  setSleepAt(at)
                  setNow(Date.now())
                }}
              />
              <button onClick={() => setMuted((m) => !m)} className="rounded-full bg-white/10 p-1.5 sm:hidden" aria-label={muted ? 'Unmute' : 'Mute'}>
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {panel && (
        <StationList
          history={list.history}
          upcoming={list.upcoming}
          current={scene?.id}
          onPick={(id) => id !== scene?.id && pick(id)}
          onMore={() => {
            listSize.current += UP_NEXT
            refreshList()
          }}
          onClose={() => setPanel(false)}
        />
      )}
    </div>
  )
}

// Sleep timer: pauses the station after so many minutes. Tapping cycles off → 15 → 30 → 60 → off.
function SleepPill({ at, now, onChange }: { at: number | null; now: number; onChange: (at: number | null) => void }) {
  const left = at ? Math.max(1, Math.round((at - now) / 60_000)) : null
  const next = () => {
    const i = at ? SLEEP_CHOICES.findIndex((m) => m * 60_000 >= (at - Date.now()) - 1000) + 1 : 0
    const m = SLEEP_CHOICES[i]
    onChange(m ? Date.now() + m * 60_000 : null)
  }
  return (
    <button
      onClick={next}
      className={clsx('inline-flex items-center gap-1 rounded-full px-3 py-1 tabular-nums', at ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20')}
      title="Sleep timer: pause the station after a while"
      aria-label={left ? `Sleep in ${left} minutes` : 'Sleep timer off'}
    >
      <Moon size={14} /> {left ? `${left} min` : 'Sleep'}
    </button>
  )
}

// The side panel (a bottom sheet on phones): played, now playing, up next.
function StationList({
  history,
  upcoming,
  current,
  onPick,
  onMore,
  onClose,
}: {
  history: SceneCard[]
  upcoming: SceneCard[]
  current?: string
  onPick: (id: string) => void
  onMore: () => void
  onClose: () => void
}) {
  const now = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    now.current?.scrollIntoView({ block: 'center' })
  }, [current])
  const at = history.findIndex((s) => s.id === current)
  const played = history.slice(0, Math.max(0, at))
  const playing = at >= 0 ? history[at] : undefined
  // upcoming already starts with any history after the current one (after going back)
  const next = upcoming.filter((u) => u.id !== current)
  const item = (s: SceneCard, tone: 'played' | 'now' | 'next') => (
    <button
      key={`${tone}${s.id}`}
      ref={tone === 'now' ? now : undefined}
      onClick={() => onPick(s.id)}
      className={clsx(
        'flex w-full items-center gap-3 rounded-xl p-1.5 text-left hover:bg-white/10',
        tone === 'now' && 'bg-white/10 ring-1 ring-accent',
        tone === 'played' && 'opacity-55',
      )}
    >
      <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-white/5">
        <img src={s.screenshot} alt="" loading="lazy" className="size-full object-cover" />
        <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[10px] font-semibold tabular-nums">{fmt(s.durationSec)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[13px] leading-snug font-medium break-words">{s.title}</span>
        <span className="mt-0.5 block truncate text-xs text-white/55">
          {tone === 'now' ? 'Now playing' : [s.studio?.name, s.performers[0]?.name].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  )
  return (
    <aside
      className="absolute inset-x-0 bottom-0 z-10 flex h-[65dvh] flex-col rounded-t-2xl bg-neutral-950/95 ring-1 ring-white/10 backdrop-blur sm:inset-y-0 sm:right-0 sm:left-auto sm:h-auto sm:w-96 sm:rounded-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <ListVideo size={16} className="text-accent" />
        <span className="font-semibold">On this station</span>
        <button onClick={onClose} className="ml-auto rounded-full p-1.5 hover:bg-white/10" aria-label="Close list">
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {played.map((s) => item(s, 'played'))}
        {playing && item(playing, 'now')}
        {next.length > 0 && <div className="px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-white/50 uppercase">Up next</div>}
        {next.map((s) => item(s, 'next'))}
        {next.length >= UP_NEXT && (
          <button onClick={onMore} className="mt-2 w-full rounded-xl bg-white/10 py-2 text-sm hover:bg-white/15">
            Show more
          </button>
        )}
      </div>
    </aside>
  )
}
