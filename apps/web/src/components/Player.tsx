import type { SceneDetail } from '@flix/shared'
import clsx from 'clsx'
import type Hls from 'hls.js'
import {
  Airplay,
  Bookmark,
  Check,
  Maximize,
  Minimize,
  Pause,
  Play,
  RectangleHorizontal,
  RotateCcw,
  RotateCw,
  Settings2,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addPlay, saveActivity, useIntroSkip, useSceneEdits, useSettings } from '../lib/api'
import { duration as fmt } from '../lib/format'
import { canDirectPlay, cueAt, loadSprites, type SpriteCue } from '../lib/media'
import { useMediaQuery } from './ui'

const SAVE_EVERY = 15 // seconds of playback between activity saves
const COUNT_PLAY_AFTER = 20 // seconds watched before it counts as a play
const RATES = [0.5, 1, 1.25, 1.5, 2]

// Quality: 'auto' plays the original when the browser can and drops to a 720p transcode
// after repeated stalls; 'original' never drops; the rest force Stash's HLS transcode.
const QUALITIES = [
  ['auto', 'Auto'],
  ['original', 'Original'],
  ['1080', '1080p'],
  ['720', '720p'],
  ['480', '480p'],
  ['240', '240p'],
] as const
type Quality = (typeof QUALITIES)[number][0]
const STASH_RES: Record<string, string> = { '1080': 'FULL_HD', '720': 'STANDARD_HD', '480': 'STANDARD', '240': 'LOW' }
const STALLS_TO_DROP = 3 // stalls within STALL_WINDOW in auto mode
const STALL_WINDOW = 30_000
const DOUBLE_TAP = 300 // ms between taps that count as a double tap
const TAP_SEEK = 10 // seconds per double tap on either side of the video

function useStored(key: string, initial: number) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key)
      return s === null ? initial : Number(s)
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (n: number) => {
      setV(n)
      try {
        localStorage.setItem(key, String(n))
      } catch {
        /* storage unavailable */
      }
    },
    [key],
  )
  return [v, set] as const
}

export function Player({
  scene,
  onEnded,
  onNext,
  theater,
  onTheater,
  startAt,
}: {
  scene: SceneDetail
  onEnded?: () => void
  onNext?: () => void
  theater: boolean
  onTheater: () => void
  startAt?: number
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const hls = useRef<Hls | null>(null)
  const [quality, setQualityState] = useState<Quality>(() => {
    try {
      return (localStorage.getItem('flix.quality') as Quality) || 'auto'
    } catch {
      return 'auto'
    }
  })
  const [fallback, setFallback] = useState(false) // direct play errored
  const [autoRes, setAutoRes] = useState<string | null>(null) // auto mode dropped after stalls
  const canDirect = useMemo(() => canDirectPlay(scene.playback), [scene.playback])
  const mode: 'direct' | 'hls' = (quality === 'auto' || quality === 'original') && !fallback && !autoRes && canDirect ? 'direct' : 'hls'
  const res = STASH_RES[quality] ?? autoRes ?? 'ORIGINAL'
  const src = mode === 'direct' ? scene.playback.direct : scene.playback.hls.replace('resolution=ORIGINAL', `resolution=${res}`)
  // Where to start the next source: resume point or ?t= first, then the current time on a switch.
  const pendingSeek = useRef<number | null>(
    startAt ?? (scene.resumeTime > 5 && scene.resumeTime < scene.durationSec - 30 ? scene.resumeTime : null),
  )
  const firstLoad = useRef(true)
  const [resumedAt, setResumedAt] = useState<number | null>(null) // shows "Resumed at … · Start over" for a while
  const stalls = useRef<number[]>([])
  const [menu, setMenu] = useState(false)
  const [menuMax, setMenuMax] = useState(0) // px; the menu scrolls inside a short player
  const { data: settings } = useSettings()
  const setIntro = useIntroSkip()
  const addMarker = useSceneEdits(scene.id).addMarker.mutate
  const introSkip = scene.studio ? settings?.introSkip[scene.studio.id] : undefined
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [dur, setDur] = useState(scene.durationSec)
  const [volume, setVolume] = useStored('flix.volume', 1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [idle, setIdle] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [sprites, setSprites] = useState<SpriteCue[]>([])
  const [hover, setHover] = useState<{ x: number; t: number; w: number } | null>(null) // mouse over the seek bar
  const [scrub, setScrub] = useState<{ x: number; t: number; w: number } | null>(null) // dragging the seek bar
  const touch = useMediaQuery('(pointer: coarse)')
  // A phone turned sideways: the player fills the screen with its own controls (iPhone
  // Safari cannot make anything but a bare <video> fullscreen).
  const landscapePhone = useMediaQuery('(orientation: landscape) and (pointer: coarse) and (max-height: 520px)')
  const immersive = fullscreen || landscapePhone
  const [flash, setFlash] = useState<string | null>(null)
  const [airplay, setAirplay] = useState(false) // a receiver is on the network (Safari only)
  const [casting, setCasting] = useState(false)

  // playback accounting
  const watched = useRef(0)
  const unsaved = useRef(0)
  const counted = useRef(false)
  const lastTick = useRef<number | null>(null)

  // Source setup. Direct play first; a media error or (in auto) repeated stalls switch to
  // Stash's HLS transcode, continuing from the same point.
  useEffect(() => {
    const v = video.current!
    let cancelled = false
    hls.current?.destroy()
    hls.current = null
    if (mode === 'direct' || v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src
    } else {
      import('hls.js').then(({ default: H }) => {
        if (cancelled) return
        const h = new H({ maxBufferLength: 30, startPosition: pendingSeek.current ?? -1 })
        h.loadSource(src)
        h.attachMedia(v)
        hls.current = h
      })
    }
    return () => {
      cancelled = true
      hls.current?.destroy()
      hls.current = null
    }
  }, [mode, src])

  // Keep the position across a source switch.
  const switchSource = (apply: () => void) => {
    const v = video.current
    if (v && v.currentTime > 0) pendingSeek.current = v.currentTime
    apply()
  }
  const setQuality = (q: Quality) => {
    try {
      localStorage.setItem('flix.quality', q)
    } catch {
      /* storage unavailable */
    }
    switchSource(() => {
      setQualityState(q)
      setAutoRes(null)
      stalls.current = []
    })
    setMenu(false)
  }

  const onStall = () => {
    const v = video.current!
    if (quality !== 'auto' || autoRes || v.seeking || watched.current < 3 || mode !== 'direct') return
    const now = Date.now()
    stalls.current = [...stalls.current.filter((t) => now - t < STALL_WINDOW), now]
    if (stalls.current.length >= STALLS_TO_DROP) {
      switchSource(() => setAutoRes('STANDARD_HD'))
      setFlash('Switched to 720p')
    }
  }

  useEffect(() => {
    if (scene.vtt) loadSprites(scene.vtt).then(setSprites)
  }, [scene.vtt])

  // AirPlay: Safari's WebKit events. The receiver fetches the media URL itself, which is why
  // playback URLs carry a signed token (see the server's media signing).
  useEffect(() => {
    const v = video.current as AirPlayVideo | null
    if (!v || !('WebKitPlaybackTargetAvailabilityEvent' in window)) return
    const onAvailability = (e: Event) => setAirplay((e as Event & { availability: string }).availability === 'available')
    const onWireless = () => setCasting(!!v.webkitCurrentPlaybackTargetIsWireless)
    v.addEventListener('webkitplaybacktargetavailabilitychanged', onAvailability)
    v.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', onWireless)
    return () => {
      v.removeEventListener('webkitplaybacktargetavailabilitychanged', onAvailability)
      v.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', onWireless)
    }
  }, [])

  useEffect(() => {
    const v = video.current!
    v.volume = volume
  }, [volume])

  const flush = useCallback(() => {
    const v = video.current
    if (!v || unsaved.current < 1) return
    const end = v.duration && v.currentTime > v.duration - 15
    saveActivity(scene.id, end ? 0 : v.currentTime, unsaved.current).catch(() => {})
    unsaved.current = 0
  }, [scene.id])

  // Save on tab close / navigation away.
  useEffect(() => {
    const h = () => flush()
    window.addEventListener('pagehide', h)
    return () => {
      window.removeEventListener('pagehide', h)
      flush()
    }
  }, [flush])

  const onTimeUpdate = () => {
    const v = video.current!
    setTime(v.currentTime)
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
    const now = performance.now()
    if (!v.paused && lastTick.current !== null) {
      const d = Math.min(2, (now - lastTick.current) / 1000) * v.playbackRate
      watched.current += d
      unsaved.current += d
      if (!counted.current && watched.current >= COUNT_PLAY_AFTER) {
        counted.current = true
        addPlay(scene.id).catch(() => {})
      }
      if (unsaved.current >= SAVE_EVERY) flush()
    }
    lastTick.current = now
  }

  const onLoaded = () => {
    const v = video.current!
    setDur(v.duration || scene.durationSec)
    if (pendingSeek.current !== null) {
      v.currentTime = pendingSeek.current
      // picked up from the saved resume point (not ?t= or a quality switch): offer a restart
      if (firstLoad.current && startAt === undefined) setResumedAt(pendingSeek.current)
    } else if (firstLoad.current && introSkip && introSkip < (v.duration || scene.durationSec) - 30) {
      v.currentTime = introSkip
      setFlash(`Skipped intro (${fmt(introSkip)})`)
    }
    pendingSeek.current = null
    firstLoad.current = false
    v.playbackRate = rate
    v.play().catch(() => {})
  }


  const toggle = useCallback(() => {
    const v = video.current!
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }, [])

  const seekBy = useCallback((d: number) => {
    const v = video.current!
    v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + d))
    setFlash(d > 0 ? `+${d}s` : `${d}s`)
  }, [])

  // The player element where the Fullscreen API exists (desktop, Android, iPad); on iPhone
  // only the <video> itself, which then plays with the system's own controls. On a phone a
  // landscape video also locks the screen to landscape (Android; iOS has no lock).
  const toggleFullscreen = useCallback(() => {
    const d = document as FsDocument
    if (document.fullscreenElement ?? d.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {})
      else d.webkitExitFullscreen?.()
      return
    }
    const el = wrap.current as FsElement | null
    const v = video.current as IosVideo | null
    if (!el || !v) return
    if (el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' }).then(
        () => {
          if (matchMedia('(pointer: coarse)').matches && v.videoWidth > v.videoHeight) {
            ;(screen.orientation as LockableOrientation | undefined)?.lock?.('landscape').catch(() => {})
          }
        },
        () => v.webkitEnterFullscreen?.(),
      )
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen()
    } else {
      v.webkitEnterFullscreen?.()
    }
  }, [])

  useEffect(() => {
    const h = () => {
      const on = !!(document.fullscreenElement ?? (document as FsDocument).webkitFullscreenElement)
      setFullscreen(on)
      if (!on) (screen.orientation as LockableOrientation | undefined)?.unlock?.()
    }
    document.addEventListener('fullscreenchange', h)
    document.addEventListener('webkitfullscreenchange', h)
    return () => {
      document.removeEventListener('fullscreenchange', h)
      document.removeEventListener('webkitfullscreenchange', h)
    }
  }, [])

  // While the sideways phone view covers the page, the page behind must not scroll.
  useEffect(() => {
    if (!landscapePhone) return
    const root = document.documentElement
    const prev = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = prev
    }
  }, [landscapePhone])

  useEffect(() => {
    if (resumedAt === null) return
    const t = setTimeout(() => setResumedAt(null), 8000)
    return () => clearTimeout(t)
  }, [resumedAt])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 600)
    return () => clearTimeout(t)
  }, [flash])

  // Keyboard: YouTube conventions.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
      const v = video.current!
      switch (e.key) {
        case ' ':
        case 'k':
          toggle()
          break
        case 'ArrowLeft':
          seekBy(-5)
          break
        case 'ArrowRight':
          seekBy(5)
          break
        case 'j':
          seekBy(-10)
          break
        case 'l':
          seekBy(10)
          break
        case 'ArrowUp':
          setVolume(Math.min(1, volume + 0.1))
          break
        case 'ArrowDown':
          setVolume(Math.max(0, volume - 0.1))
          break
        case 'm':
          setMuted((m) => !m)
          break
        case 'f':
          toggleFullscreen()
          break
        case 't':
          onTheater()
          break
        case 'N':
          onNext?.()
          break
        case 'b':
          addMarker({ seconds: Math.round(v.currentTime * 10) / 10, title: '' })
          setFlash('Marked')
          break
        case ']':
        case '[': {
          const t = v.currentTime
          const m =
            e.key === ']'
              ? scene.markers.find((x) => x.seconds > t + 1)
              : [...scene.markers].reverse().find((x) => x.seconds < t - 2)
          if (m) {
            v.currentTime = m.seconds
            setFlash(m.title || fmt(m.seconds))
          }
          break
        }
        case '>':
        case '<': {
          const i = RATES.indexOf(rate) + (e.key === '>' ? 1 : -1)
          const r = RATES[Math.max(0, Math.min(RATES.length - 1, i))]
          setRate(r)
          v.playbackRate = r
          setFlash(`${r}×`)
          break
        }
        default:
          if (/^[0-9]$/.test(e.key) && v.duration) v.currentTime = (v.duration * Number(e.key)) / 10
          else return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [toggle, seekBy, toggleFullscreen, onTheater, onNext, volume, setVolume, rate, scene.markers, addMarker])

  // Hide controls while playing and the mouse is still, or a while after a tap.
  const idleTimer = useRef<number>(undefined)
  const poke = useCallback(() => {
    setIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setIdle(true), touch ? 3500 : 2500)
  }, [touch])

  // Taps on the picture. Mouse: click plays or pauses, double click is fullscreen. Touch: a
  // tap shows or hides the controls; double taps on the left or right third seek, YouTube
  // style (keep tapping to seek further).
  const pointerType = useRef('mouse')
  const lastTap = useRef<{ at: number; zone: number } | null>(null)
  const tapTimer = useRef<number>(undefined)
  const tapStart = useRef<{ x: number; y: number } | null>(null)
  const onSurfaceTap = (e: React.PointerEvent) => {
    const start = tapStart.current
    tapStart.current = null
    // a swipe that ends on the picture is not a tap
    if (e.pointerType === 'mouse' || !start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return
    // Turned sideways but not fullscreen: the browser's address bar still takes space, and
    // a page may only go fullscreen from a tap, so the first tap does that.
    if (landscapePhone && !fullscreen) {
      toggleFullscreen()
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    const zone = e.clientX < r.left + r.width / 3 ? -1 : e.clientX > r.right - r.width / 3 ? 1 : 0
    const now = performance.now()
    const prev = lastTap.current
    lastTap.current = { at: now, zone }
    clearTimeout(tapTimer.current)
    if (zone && prev?.zone === zone && now - prev.at < DOUBLE_TAP) {
      seekBy(zone * TAP_SEEK)
      return
    }
    const controlsShown = !playing || !idle
    // a side tap waits to see whether a second tap follows
    tapTimer.current = window.setTimeout(() => (controlsShown && playing ? setIdle(true) : poke()), zone ? DOUBLE_TAP : 0)
  }

  // Seek bar. Mouse: seeks as it moves. Touch: the drag previews (thumbnail and time) and
  // seeks once, on release, so a finger's jitter does not throw the video around.
  const bar = useRef<HTMLDivElement>(null)
  const timeAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect()
    const x = Math.max(0, Math.min(r.width, clientX - r.left))
    return { x, t: (x / r.width) * (dur || 0), w: r.width }
  }
  const onBarDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = timeAt(e.clientX)
    setScrub(p)
    if (e.pointerType === 'mouse') video.current!.currentTime = p.t
    poke()
  }
  const onBarMove = (e: React.PointerEvent) => {
    const p = timeAt(e.clientX)
    if (scrub) {
      setScrub(p)
      if (e.pointerType === 'mouse') video.current!.currentTime = p.t
    } else if (e.pointerType === 'mouse') {
      setHover(p)
    }
  }
  const onBarUp = (e: React.PointerEvent) => {
    if (scrub && e.pointerType !== 'mouse') {
      const t = timeAt(e.clientX).t
      video.current!.currentTime = t
      setTime(t)
    }
    setScrub(null)
    poke()
  }

  const point = scrub ?? hover
  const cue = point ? cueAt(sprites, point.t) : null
  const shownTime = scrub ? scrub.t : time
  const showControls = !playing || !idle || point !== null || menu
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  const thumbW = 192

  return (
    <div
      ref={wrap}
      onPointerDown={(e) => (pointerType.current = e.pointerType)}
      onPointerMove={(e) => e.pointerType === 'mouse' && poke()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setIdle(true)}
      className={clsx(
        'group/player overflow-hidden bg-black select-none [-webkit-touch-callout:none]',
        // vertical swipes over the video still scroll the page; sideways ones do nothing
        immersive ? 'touch-none' : 'touch-pan-y',
        fullscreen
          ? 'relative size-full'
          : landscapePhone
            ? 'fixed inset-0 z-[70] h-dvh w-full'
            : theater
              ? 'relative aspect-video max-h-[calc(100dvh-8rem)] w-full'
              : 'relative aspect-video rounded-2xl',
        !showControls && 'cursor-none',
      )}
    >
      <video
        ref={video}
        className="size-full"
        playsInline
        x-webkit-airplay="allow"
        poster={scene.screenshot}
        muted={muted}
        onPlay={() => {
          setPlaying(true)
          lastTick.current = performance.now()
          poke()
        }}
        onPause={() => {
          setPlaying(false)
          lastTick.current = null
          flush()
        }}
        onWaiting={() => {
          setWaiting(true)
          onStall()
        }}
        onPlaying={() => setWaiting(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoaded}
        onEnded={() => {
          flush()
          onEnded?.()
        }}
        onError={() => mode === 'direct' && switchSource(() => setFallback(true))}
      />

      {casting && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85">
          <Airplay size={48} className="text-accent" />
          <div className="text-sm text-white/80">Playing on AirPlay</div>
        </div>
      )}
      <div
        className="absolute inset-0"
        onPointerDown={(e) => (tapStart.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={onSurfaceTap}
        onClick={() => pointerType.current === 'mouse' && toggle()}
        onDoubleClick={() => pointerType.current === 'mouse' && toggleFullscreen()}
      />

      {waiting && !casting && <div className="pointer-events-none absolute inset-0 m-auto size-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />}
      {touch ? (
        // Touch: back / play-pause / forward in the middle while the controls show.
        <div
          className={clsx(
            'pointer-events-none absolute inset-0 flex items-center justify-center gap-10 transition-opacity duration-300',
            showControls && !waiting ? 'opacity-100' : 'opacity-0',
          )}
        >
          <Round label={`Back ${TAP_SEEK} seconds`} active={showControls && !waiting} onClick={() => (seekBy(-TAP_SEEK), poke())}>
            <RotateCcw size={26} />
          </Round>
          <Round label={playing ? 'Pause' : 'Play'} big active={showControls && !waiting} onClick={() => (toggle(), poke())}>
            {playing ? <Pause size={34} className="fill-white" /> : <Play size={34} className="ml-1 fill-white" />}
          </Round>
          <Round label={`Forward ${TAP_SEEK} seconds`} active={showControls && !waiting} onClick={() => (seekBy(TAP_SEEK), poke())}>
            <RotateCw size={26} />
          </Round>
        </div>
      ) : (
        !playing &&
        !waiting && (
          <button onClick={toggle} className="absolute inset-0 m-auto flex size-20 items-center justify-center rounded-full bg-black/50 backdrop-blur transition hover:scale-105 hover:bg-accent">
            <Play size={36} className="ml-1 fill-white" />
          </button>
        )
      )}
      {landscapePhone && !fullscreen && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-[13px] text-white/80 ring-1 ring-white/10 backdrop-blur">
          Tap for full screen
        </div>
      )}
      {resumedAt !== null && (
        <div className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-black/75 py-1 pr-1 pl-3 text-[13px] ring-1 ring-white/10 backdrop-blur">
          <span className="text-white/80 tabular-nums">Resumed at {fmt(resumedAt)}</span>
          <button
            onClick={() => {
              // from the top, or from the studio's intro skip point when one is set
              video.current!.currentTime = introSkip && introSkip < dur - 30 ? introSkip : 0
              setResumedAt(null)
              poke()
            }}
            className="rounded-full bg-white px-3 py-1 font-semibold text-black hover:bg-accent hover:text-white"
          >
            Start over
          </button>
        </div>
      )}
      {flash && (
        <div className="pointer-events-none absolute inset-0 m-auto flex size-20 items-center justify-center rounded-full bg-black/60 text-lg font-semibold">
          {flash}
        </div>
      )}

      <div
        className={clsx(
          // The gradient is tall and on a phone covers the middle of the picture, so it never
          // takes taps itself; only the bar and buttons do, and only while visible (a tap
          // meant to show hidden controls would otherwise seek).
          'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-3 pt-16 pb-2 transition-opacity duration-300 sm:px-4',
          showControls ? 'opacity-100 [&>*]:pointer-events-auto' : 'opacity-0',
          immersive &&
            'pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))]',
        )}
      >
        {/* seek bar */}
        <div
          ref={bar}
          className="group/bar relative flex h-5 cursor-pointer touch-none items-center touch:h-9"
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={onBarUp}
          onPointerCancel={() => setScrub(null)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
        >
          <div
            className={clsx(
              'relative h-1 w-full rounded-full bg-white/25 transition-[height] group-hover/bar:h-1.5 touch:h-1.5',
              scrub && 'h-1.5 touch:h-2',
            )}
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: `${(buffered / (dur || 1)) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(shownTime / (dur || 1)) * 100}%` }} />
            {scene.markers.map((m) => (
              <div
                key={m.id}
                className="absolute -inset-y-0.5 w-1 -translate-x-1/2 rounded-full bg-star"
                style={{ left: `${(m.seconds / (dur || 1)) * 100}%` }}
              />
            ))}
            {hover && !scrub && <div className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: hover.x }} />}
            <div
              className={clsx(
                'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-accent transition-transform group-hover/bar:scale-100 touch:scale-100',
                scrub && 'scale-125 touch:scale-125',
              )}
              style={{ left: `${(shownTime / (dur || 1)) * 100}%` }}
            />
          </div>
          {point && (
            <div
              className="pointer-events-none absolute bottom-7 flex flex-col items-center touch:bottom-10"
              style={{ left: Math.max(thumbW / 2, Math.min(point.w - thumbW / 2, point.x)), transform: 'translateX(-50%)' }}
            >
              {cue && (
                <div
                  className="overflow-hidden rounded-lg ring-2 ring-white/90"
                  style={{
                    width: thumbW,
                    height: (thumbW * cue.h) / cue.w,
                    backgroundImage: `url(${cue.url})`,
                    backgroundPosition: `-${(cue.x * thumbW) / cue.w}px -${(cue.y * thumbW) / cue.w}px`,
                    // tiles are scaled from cue.w to thumbW; the sheet scales with them
                    ...spriteSize(sprites, thumbW / cue.w),
                  }}
                />
              )}
              {(() => {
                const near = scene.markers.find((m) => Math.abs(m.seconds - point.t) < (dur || 1) * 0.01)
                return near ? <span className="mt-1 max-w-48 truncate rounded bg-star px-1.5 py-0.5 text-xs font-semibold text-black">{near.title || 'Marker'}</span> : null
              })()}
              <span className="mt-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium tabular-nums">{fmt(point.t)}</span>
            </div>
          )}
        </div>

        <div className="mt-1 flex items-center gap-1 sm:gap-2">
          <Ctl onClick={toggle} label={playing ? 'Pause (k)' : 'Play (k)'}>
            {playing ? <Pause size={22} className="fill-white" /> : <Play size={22} className="fill-white" />}
          </Ctl>
          {onNext && (
            <Ctl onClick={onNext} label="Next (Shift+N)">
              <SkipForward size={20} className="fill-white" />
            </Ctl>
          )}
          <div className="group/vol flex items-center">
            <Ctl onClick={() => setMuted((m) => !m)} label="Mute (m)">
              <VolIcon size={22} />
            </Ctl>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                setVolume(Number(e.target.value))
                setMuted(false)
              }}
              className="slim w-0 opacity-0 transition-all group-hover/vol:w-20 group-hover/vol:opacity-100 touch:hidden"
            />
          </div>
          <span className="ml-1 text-[13px] text-white/90 tabular-nums">
            {fmt(shownTime)} <span className="text-white/50">/ {fmt(dur)}</span>
          </span>
          <span className="ml-auto" />
          {airplay && (
            <Ctl
              onClick={() => (video.current as AirPlayVideo).webkitShowPlaybackTargetPicker?.()}
              label="AirPlay"
              className={casting ? 'text-accent' : ''}
            >
              <Airplay size={20} />
            </Ctl>
          )}
          {mode === 'hls' && (
            <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white/80 uppercase">
              {res === 'ORIGINAL' ? 'Transcode' : QUALITIES.find(([q]) => STASH_RES[q] === res)?.[1]}
            </span>
          )}
          <div className="relative">
            <Ctl
              onClick={() => {
                setMenuMax((wrap.current?.clientHeight ?? 400) - 64)
                setMenu((v) => !v)
              }}
              label="Settings"
            >
              <Settings2 size={20} className={menu ? 'rotate-45 transition-transform' : 'transition-transform'} />
            </Ctl>
            {menu && (
              <div
                style={{ maxHeight: menuMax }}
                className="absolute right-0 bottom-11 w-60 overflow-y-auto overscroll-contain rounded-xl bg-black/90 py-1 text-sm shadow-2xl ring-1 ring-white/10 backdrop-blur"
              >
                <button
                  onClick={() => {
                    addMarker({ seconds: Math.round(time * 10) / 10, title: '' })
                    setMenu(false)
                    setFlash('Marked')
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/10"
                >
                  <Bookmark size={15} /> Mark this moment ({fmt(time)})
                </button>
                {/* speed lives here on narrow screens, where the bar has no room for it */}
                <div className="flex items-center gap-1 px-3 py-1.5 sm:hidden">
                  <span className="mr-auto text-[11px] font-semibold tracking-wider text-white/50 uppercase">Speed</span>
                  {RATES.map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        setRate(r)
                        video.current!.playbackRate = r
                      }}
                      className={clsx('rounded px-1.5 py-1 text-xs tabular-nums', rate === r ? 'bg-white text-black' : 'hover:bg-white/10')}
                    >
                      {r}×
                    </button>
                  ))}
                </div>
                <div className="border-t border-white/10 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-white/50 uppercase">Quality</div>
                {QUALITIES.map(([q, label]) => (
                  <button key={q} onClick={() => setQuality(q)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/10">
                    <span className="w-4">{quality === q && <Check size={15} />}</span>
                    {label}
                    {q === 'auto' && quality === 'auto' && (
                      <span className="ml-auto text-xs text-white/50">{autoRes ? '720p' : mode === 'direct' ? 'original' : 'transcode'}</span>
                    )}
                    {q === 'original' && !canDirect && <span className="ml-auto text-xs text-white/50">transcoded</span>}
                  </button>
                ))}
                {scene.studio && (
                  <>
                    <div className="mt-1 border-t border-white/10 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-white/50 uppercase">
                      {scene.studio.name} intro
                    </div>
                    <button
                      onClick={() => {
                        setIntro.mutate({ studioId: scene.studio!.id, seconds: Math.round(time) })
                        setMenu(false)
                        setFlash(`Intro skip set: ${fmt(time)}`)
                      }}
                      className="w-full px-3 py-1.5 text-left hover:bg-white/10"
                    >
                      Skip to here on every video ({fmt(time)})
                    </button>
                    {introSkip ? (
                      <button
                        onClick={() => {
                          setIntro.mutate({ studioId: scene.studio!.id, seconds: null })
                          setMenu(false)
                        }}
                        className="w-full px-3 py-1.5 text-left text-white/70 hover:bg-white/10"
                      >
                        Stop skipping (now {fmt(introSkip)})
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              const r = RATES[(RATES.indexOf(rate) + 1) % RATES.length]
              setRate(r)
              video.current!.playbackRate = r
            }}
            className="hidden rounded px-2 py-1 text-[13px] font-semibold text-white/90 hover:bg-white/10 sm:block"
            title="Speed (< >)"
          >
            {rate}×
          </button>
          {!fullscreen && (
            <Ctl onClick={onTheater} label="Theater (t)" className="hidden sm:flex">
              <RectangleHorizontal size={20} className={theater ? 'fill-white/30' : ''} />
            </Ctl>
          )}
          <Ctl onClick={toggleFullscreen} label="Fullscreen (f)">
            {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </Ctl>
        </div>
      </div>
    </div>
  )
}

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void }
type IosVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void }
type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void>; unlock?: () => void }

type AirPlayVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void
  webkitCurrentPlaybackTargetIsWireless?: boolean
}

// Sprite sheets are a grid of equal tiles; infer the sheet size from the cues.
function spriteSize(cues: SpriteCue[], scale: number) {
  if (!cues.length) return {}
  let w = 0
  let h = 0
  for (const c of cues) {
    w = Math.max(w, c.x + c.w)
    h = Math.max(h, c.y + c.h)
  }
  return { backgroundSize: `${w * scale}px ${h * scale}px` }
}

// The touch buttons in the middle of the picture; `active` while they are visible.
function Round({ children, onClick, label, big, active }: { children: React.ReactNode; onClick: () => void; label: string; big?: boolean; active: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={clsx(
        'flex items-center justify-center rounded-full bg-black/50 backdrop-blur active:scale-95',
        big ? 'size-18' : 'size-12',
        active && 'pointer-events-auto',
      )}
    >
      {children}
    </button>
  )
}

function Ctl({ children, onClick, label, className }: { children: React.ReactNode; onClick: () => void; label: string; className?: string }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={clsx('flex size-9 items-center justify-center rounded-full text-white hover:bg-white/10', className)}>
      {children}
    </button>
  )
}
