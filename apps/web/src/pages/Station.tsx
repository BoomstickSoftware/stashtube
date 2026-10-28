import type { SceneDetail } from '@flix/shared'
import type { JSX } from 'react'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import type Hls from 'hls.js'
import { ExternalLink, Pause, Play, Radio, SkipForward, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner } from '../components/ui'
import { addPlay, useSettings } from '../lib/api'
import { canDirectPlay } from '../lib/media'
import { loadPrefs, savePrefs, type Segment, segmentsFor, StationQueue, type StationPrefs, stationQuery, windows } from '../lib/station'

const route = getRouteApi('/station')
const FADE_MS = 700
const HIDE_MS = 3000
const COUNT_PLAY_AFTER = 15 // seconds of a full video before it counts as a play

// Full-screen endless play: Skip moves to the next video. In Moments mode it fades between
// windows of each video, then on to the next.
export function Station(): JSX.Element {
  const search = route.useSearch()
  const navigate = useNavigate()
  const { data: settings } = useSettings()
  const [prefs, setPrefsState] = useState<StationPrefs>(loadPrefs)
  const [scene, setScene] = useState<SceneDetail | null>(null)
  const [state, setState] = useState<'loading' | 'playing' | 'paused' | 'empty' | 'tap' | 'error'>('loading')
  const [dim, setDim] = useState(true)
  const [muted, setMuted] = useState(false)
  const [shown, setShown] = useState(true)
  const [segInfo, setSegInfo] = useState({ i: 0, n: 1 })

  const video = useRef<HTMLVideoElement>(null)
  const hls = useRef<Hls | null>(null)
  const segs = useRef<Segment[]>([])
  const segIdx = useRef(0)
  const busy = useRef(false) // a fade or scene change is running
  const prefsRef = useRef(prefs)
  const introRef = useRef<Record<string, number>>({})
  const watched = useRef({ id: '', secs: 0, last: 0, counted: false })
  const hideTimer = useRef<number>(undefined)
  const [queue] = useState(() => {
    const { from, ...q } = search
    return new StationQueue(stationQuery(q), from)
  })
  useEffect(() => {
    introRef.current = settings?.introSkip ?? {}
  }, [settings])

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

  const nextScene = useCallback(async () => {
    busy.current = true
    await fade('out')
    setState('loading')
    try {
      const s = await queue.next()
      if (!s) return setState('empty')
      const skip = s.studio ? (introRef.current[s.studio.id] ?? 0) : 0
      segs.current = segmentsFor(s, prefsRef.current, skip)
      segIdx.current = 0
      setSegInfo({ i: 0, n: segs.current.length })
      setScene(s)
    } catch {
      setState('error')
      busy.current = false
    }
  }, [queue])

  // Load each scene's source and seek to its first segment.
  useEffect(() => {
    const v = video.current
    if (!scene || !v) return
    let cancelled = false
    const start = segs.current[0]?.start ?? 0
    hls.current?.destroy()
    hls.current = null
    const direct = canDirectPlay(scene.playback)
    const onMeta = () => {
      if (Math.abs(v.currentTime - start) > 1) v.currentTime = start
      play()
    }
    v.addEventListener('loadedmetadata', onMeta, { once: true })
    if (direct || v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = direct ? scene.playback.direct : scene.playback.hls
    } else {
      import('hls.js').then(({ default: H }) => {
        if (cancelled) return
        const h = new H({ maxBufferLength: 30, startPosition: start })
        h.loadSource(scene.playback.hls)
        h.attachMedia(v)
        hls.current = h
      })
    }
    watched.current = { id: scene.id, secs: 0, last: start, counted: false }
    return () => {
      cancelled = true
      v.removeEventListener('loadedmetadata', onMeta)
    }
  }, [scene, play])

  useEffect(() => {
    const t = setTimeout(nextScene) // after mount: it sets state
    return () => {
      clearTimeout(t)
      hls.current?.destroy()
    }
  }, [nextScene])

  const nextSegment = useCallback(async () => {
    const v = video.current!
    if (segIdx.current + 1 >= segs.current.length) return nextScene()
    busy.current = true
    await fade('out')
    segIdx.current++
    setSegInfo({ i: segIdx.current, n: segs.current.length })
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
    const w = watched.current
    const t = v.currentTime
    if (t > w.last && t - w.last < 2) w.secs += t - w.last
    w.last = t
    if (prefsRef.current.mode === 'full' && !w.counted && w.secs >= COUNT_PLAY_AFTER && scene) {
      w.counted = true
      addPlay(scene.id).catch(() => {})
    }
    if (!busy.current && seg && seg.end < v.duration - 1 && t >= seg.end - FADE_MS / 1000) nextSegment()
  }

  const setPrefs = (p: StationPrefs) => {
    setPrefsState(p)
    prefsRef.current = p
    savePrefs(p)
    // re-plan the current video from where it is now
    const v = video.current
    if (!scene || !v) return
    const skip = scene.studio ? (introRef.current[scene.studio.id] ?? 0) : 0
    const now = v.currentTime
    const ahead = segmentsFor(scene, p, skip).filter((s) => s.end > now + 2)
    if (!ahead.length) return void nextScene()
    segs.current = ahead
    segIdx.current = 0
    setSegInfo({ i: 0, n: ahead.length })
    if (now < ahead[0]!.start) v.currentTime = ahead[0]!.start
  }

  const exit = () => (window.history.length > 1 ? window.history.back() : navigate({ to: '/' }))
  const toggle = () => {
    const v = video.current!
    if (v.paused) play()
    else {
      v.pause()
      setState('paused')
    }
  }
  const poke = () => {
    setShown(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShown(false), HIDE_MS)
  }
  useEffect(() => () => clearTimeout(hideTimer.current), [])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return
      if (e.key === ' ' || e.key === 'k') toggle()
      else if (e.key === 'ArrowRight' || e.key === 'n') nextScene()
      else if (e.key === 'm') setMuted((m) => !m)
      else if (e.key === 'Escape') exit()
      else return
      e.preventDefault()
      poke()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const controlsVisible = shown || state !== 'playing'
  const btn = 'flex size-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20'

  return (
    <div
      className={clsx('fixed inset-0 z-[60] bg-black text-white select-none', !controlsVisible && 'cursor-none')}
      onPointerMove={poke}
      onPointerDown={poke}
    >
      <video
        ref={video}
        playsInline
        muted={muted}
        onTimeUpdate={onTime}
        onEnded={() => nextScene()}
        onPlaying={() => {
          setState('playing')
          if (busy.current || dim) {
            busy.current = false
            fade('in')
          }
        }}
        onError={() => nextScene()}
        onClick={toggle}
        className={clsx('absolute inset-0 size-full object-contain transition-opacity ease-in-out', dim ? 'opacity-0' : 'opacity-100')}
        style={{ transitionDuration: `${FADE_MS}ms` }}
      />

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
              <Radio size={13} /> Station{search.from ? ' · like a video' : ''}
            </div>
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
        </div>

        <div className="pointer-events-auto bg-gradient-to-t from-black/80 to-transparent p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-3">
            <button onClick={toggle} className={btn} aria-label={state === 'paused' ? 'Play' : 'Pause'}>
              {state === 'paused' ? <Play size={22} className="fill-current" /> : <Pause size={22} className="fill-current" />}
            </button>
            <button
              onClick={() => nextScene()}
              className="flex h-12 items-center gap-2 rounded-full bg-white px-6 font-semibold text-black hover:bg-accent hover:text-white"
            >
              <SkipForward size={20} className="fill-current" /> Skip
            </button>
            <button onClick={() => setMuted((m) => !m)} className={btn} aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </button>
          </div>
          <div className="mx-auto mt-4 flex max-w-2xl flex-wrap items-center justify-center gap-2 text-sm">
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
          </div>
        </div>
      </div>
    </div>
  )
}
