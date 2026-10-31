import type { SceneDetail } from '@flix/shared'
import clsx from 'clsx'
import {
  Airplay,
  Bookmark,
  Check,
  Droplet,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
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
import { type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useAddO, useIntroSkip, useSceneEdits, useSettings } from '../lib/api'
import { duration as fmt } from '../lib/format'
import { canDirectPlay } from '../lib/media'
import type { Status } from '../lib/nowPlaying'
import { attachSource, nextMarker, useFlash, usePlayerKeys, useWatchAccounting } from '../lib/playback'
import { guardWrite } from '../lib/privacy'
import { asNumber, oneOf, useStored } from '../lib/storage'
import { SeekBar, type SeekBarHandle, type SeekPoint } from './SeekBar'
import { useLongPress, useMediaQuery } from '../lib/hooks'

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
const SWIPE_SLOP = 10 // px a finger moves on the picture before the swipe is sideways or not
// Picture in picture: the standard API, or Safari's presentation modes (iPhone has only those).
const PIP = typeof document !== 'undefined' && (document.pictureInPictureEnabled || 'webkitSetPresentationMode' in HTMLVideoElement.prototype)
const TAP_SEEK = 10 // seconds per double tap on either side of the video
const MARK_BANNER_MS = 5000 // how long "Marked · Undo · O" stays
const HOLD_HINTS = 3 // videos that show "Hold the picture to mark a moment"

// What the page around the player may ask of it.
export interface PlayerHandle {
  seek: (t: number) => void
  time: () => number // where playback is now
  toggle: () => void // play or pause
}

export function Player({
  ref,
  scene,
  onEnded,
  onNext,
  theater,
  onTheater,
  startAt,
  autoStart,
  mini = false,
  onStatus,
}: {
  ref?: Ref<PlayerHandle>
  scene: SceneDetail
  onEnded?: () => void
  onNext?: () => void
  theater: boolean
  onTheater: () => void
  startAt?: number
  autoStart: boolean // play as soon as it loads; otherwise wait on the play button
  // Docked in a corner while another page shows (lib/nowPlaying.ts): just the picture and a
  // progress line; the mini-player's own bar has the buttons, and keys stay with the page.
  mini?: boolean
  onStatus?: (s: Status) => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [quality, setQualityState] = useStored<Quality>('flix.quality', oneOf(QUALITIES.map(([q]) => q), 'auto'))
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
  // Whether to play once the source loads: the open setting at first, then whatever it was
  // doing when the source switched (quality, fallback).
  const playAfterLoad = useRef(autoStart)
  const [resumedAt, setResumedAt] = useState<number | null>(null) // shows "Resumed at … · Start over" for a while
  const stalls = useRef<number[]>([])
  const [menu, setMenu] = useState(false)
  const [menuMax, setMenuMax] = useState(0) // px; the menu scrolls inside a short player
  const { data: settings } = useSettings()
  const setIntro = useIntroSkip()
  const edits = useSceneEdits(scene.id)
  const addO = useAddO()
  // The last mark made from the player: a banner offers Undo and "O" for a few seconds. `id`
  // arrives when Stash answers; x/y is where the finger was (a pulse shows there), -1 for keys.
  const [marked, setMarked] = useState<{ id: string | null; seconds: number; x: number; y: number } | null>(null)
  const undoWanted = useRef<number | null>(null) // Undo pressed before Stash answered
  useEffect(() => {
    if (!marked) return
    const t = setTimeout(() => setMarked(null), MARK_BANNER_MS)
    return () => clearTimeout(t)
  }, [marked])
  // a marker is a trace of this viewing: a private session drops none
  const markAt = (seconds: number, at?: { x: number; y: number }) => {
    const s = Math.round(seconds * 10) / 10
    return guardWrite(() => {
      undoWanted.current = null
      setMarked({ id: null, seconds: s, x: at?.x ?? -1, y: at?.y ?? -1 })
      edits.addMarker.mutate(
        { seconds: s, title: '' },
        {
          onSuccess: (m) => {
            if (undoWanted.current === s) {
              undoWanted.current = null
              edits.deleteMarker.mutate(m.id)
            } else setMarked((cur) => (cur && cur.seconds === s ? { ...cur, id: m.id } : cur))
          },
        },
      )
    })
  }
  const undoMark = () => {
    if (!marked) return
    if (marked.id) edits.deleteMarker.mutate(marked.id)
    else undoWanted.current = marked.seconds
    setMarked(null)
  }
  const markAsO = () => {
    if (!marked?.id) return
    addO.mutate(scene.id)
    edits.updateMarker.mutate({ marker: marked.id, title: 'O' })
    setMarked(null)
    setFlash('O')
  }
  // "Hold the picture to mark a moment" shows on the first few videos, until a hold happens.
  const [holdHints, setHoldHints] = useStored('flix.hint.hold', asNumber(0))
  const [hintEligible] = useState(() => holdHints < HOLD_HINTS)
  const [hintDone, setHintDone] = useState(false)
  const hintCounted = useRef(false)
  const introSkip = scene.studio ? settings?.introSkip[scene.studio.id] : undefined
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [dur, setDur] = useState(scene.durationSec)
  const [volume, setVolume] = useStored('flix.volume', asNumber(1))
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [idle, setIdle] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [point, setPoint] = useState<SeekPoint | null>(null) // the seek bar is hovered or dragged
  const touch = useMediaQuery('(pointer: coarse)')
  // A phone turned sideways: the player fills the screen with its own controls (iPhone
  // Safari cannot make anything but a bare <video> fullscreen).
  const landscapePhone = useMediaQuery('(orientation: landscape) and (pointer: coarse) and (max-height: 520px)')
  const immersive = fullscreen || landscapePhone
  const [flash, setFlash] = useFlash()
  const [airplay, setAirplay] = useState(false) // a receiver is on the network (Safari only)
  const [casting, setCasting] = useState(false)
  const [pip, setPip] = useState(false)

  const { onTimeUpdate: accountTime, flush, watched } = useWatchAccounting(video, scene.id)

  // Source setup. Direct play first; a media error or (in auto) repeated stalls switch to
  // Stash's HLS transcode, continuing from the same point.
  useEffect(() => attachSource(video.current!, src, pendingSeek.current), [src])

  // Keep the position across a source switch.
  const switchSource = (apply: () => void) => {
    const v = video.current
    if (v && v.currentTime > 0) pendingSeek.current = v.currentTime
    if (!firstLoad.current) playAfterLoad.current = playing
    apply()
  }
  const setQuality = (q: Quality) => {
    switchSource(() => {
      setQualityState(q)
      setAutoRes(null)
      stalls.current = []
    })
    setMenu(false)
  }

  const onStall = (now: number) => {
    const v = video.current!
    if (quality !== 'auto' || autoRes || v.seeking || watched() < 3 || mode !== 'direct') return
    stalls.current = [...stalls.current.filter((t) => now - t < STALL_WINDOW), now]
    if (stalls.current.length >= STALLS_TO_DROP) {
      switchSource(() => setAutoRes('STANDARD_HD'))
      setFlash('Switched to 720p')
    }
  }

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

  useEffect(() => {
    const v = video.current as PipVideo
    const sync = () => setPip(document.pictureInPictureElement === v || v.webkitPresentationMode === 'picture-in-picture')
    for (const ev of ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged']) v.addEventListener(ev, sync)
    return () => {
      for (const ev of ['enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged']) v.removeEventListener(ev, sync)
    }
  }, [])

  const togglePip = useCallback(() => {
    const v = video.current as PipVideo
    if (document.pictureInPictureElement === v) document.exitPictureInPicture().catch(() => {})
    else if (v.requestPictureInPicture) v.requestPictureInPicture().catch(() => {})
    else v.webkitSetPresentationMode?.(v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture')
  }, [])

  const report = (patch: Partial<Status> = {}) => {
    const v = video.current
    if (v && onStatus) onStatus({ playing: !v.paused, time: v.currentTime, dur: v.duration || scene.durationSec, ended: v.ended, ...patch })
  }

  const onTimeUpdate = () => {
    const v = video.current!
    setTime(v.currentTime)
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
    accountTime()
    report()
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
    if (playAfterLoad.current) v.play().catch(() => {})
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
  }, [setFlash])

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

  // Sideways on a phone the player covers the viewport, but the page behind it stays
  // scrollable: Safari only tucks its address bar away when the page scrolls, so a swipe up
  // over the video gives the picture the whole screen. Until then a hint says so.
  const [barShown, setBarShown] = useState(false)
  useEffect(() => {
    if (!landscapePhone) return
    const check = () => setBarShown(innerHeight < Math.min(screen.width, screen.height) - 24)
    check()
    addEventListener('resize', check)
    visualViewport?.addEventListener('resize', check)
    return () => {
      removeEventListener('resize', check)
      visualViewport?.removeEventListener('resize', check)
    }
  }, [landscapePhone])

  useEffect(() => {
    if (resumedAt === null) return
    const t = setTimeout(() => setResumedAt(null), 8000)
    return () => clearTimeout(t)
  }, [resumedAt])

  // Keyboard: YouTube conventions. Docked, the keys belong to the page being browsed.
  usePlayerKeys((e) => {
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
      case 'i':
        if (PIP) togglePip()
        break
      case 'N':
        onNext?.()
        break
      case 'b':
        markAt(v.currentTime)
        break
      case ']':
      case '[': {
        const m = nextMarker(scene.markers, v.currentTime, e.key === ']' ? 1 : -1)
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
        else return false
    }
    return true
  }, !mini)

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
  // Hold the picture to mark the moment, without pausing or showing the controls.
  const hold = useLongPress(
    (x, y) => {
      tapStart.current = null // the lift that follows is not a tap
      if (menu) return
      const r = wrap.current?.getBoundingClientRect()
      if (markAt(video.current?.currentTime ?? 0, r ? { x: x - r.left, y: y - r.top } : undefined)) {
        setHintDone(true)
        setHoldHints(HOLD_HINTS)
      }
    },
    { enabled: touch && !mini },
  )
  // A sideways swipe on the picture scrubs the seek bar as a drag on the bar would (preview,
  // then seek on release); a vertical one is left to the page (it hides Safari's address bar).
  const seekBar = useRef<SeekBarHandle>(null)
  const swipe = useRef<{ x: number; y: number; on: boolean } | null>(null)
  const onSurfaceMove = (e: React.PointerEvent) => {
    hold.onPointerMove(e)
    const s = swipe.current
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (!s.on) {
      if (Math.abs(dy) > SWIPE_SLOP && Math.abs(dy) >= Math.abs(dx)) swipe.current = null
      if (Math.abs(dx) <= SWIPE_SLOP || Math.abs(dx) < Math.abs(dy)) return
      s.on = true
      seekBar.current?.grab()
    }
    seekBar.current?.drag(dx)
  }
  const endSwipe = (seek: boolean) => {
    if (swipe.current?.on) seekBar.current?.[seek ? 'drop' : 'cancel']()
    swipe.current = null
  }
  const onSurfaceTap = (e: React.PointerEvent) => {
    const start = tapStart.current
    tapStart.current = null
    // a swipe that ends on the picture is not a tap
    if (e.pointerType === 'mouse' || !start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return
    // a tap closes an open menu or dismisses the mark banner, and does nothing else
    if (menu) return setMenu(false)
    if (marked) return setMarked(null)
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

  const seekTo = (t: number) => {
    video.current!.currentTime = t
    setTime(t)
    poke()
  }
  useImperativeHandle(ref, () => ({ seek: seekTo, time: () => video.current?.currentTime ?? 0, toggle }))

  const shownTime = point?.scrubbing ? point.t : time
  const showControls = !playing || !idle || point !== null || menu
  const centre = showControls && !waiting && !point?.scrubbing // out of the way of a scrub's preview
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <div
      ref={wrap}
      onPointerDown={(e) => (pointerType.current = e.pointerType)}
      onPointerMove={(e) => e.pointerType === 'mouse' && poke()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setIdle(true)}
      className={clsx(
        'group/player overflow-hidden bg-black select-none [-webkit-touch-callout:none]',
        // vertical swipes over the video still scroll the page (sideways, that is what hides
        // Safari's address bar); sideways ones do nothing
        fullscreen ? 'touch-none' : 'touch-pan-y',
        fullscreen
          ? 'relative size-full'
          : mini
            ? 'relative aspect-video'
            : landscapePhone
              ? 'fixed inset-0 z-[70] h-dvh w-full'
              : theater
                ? 'relative aspect-video max-h-[calc(100dvh-8rem)] w-full'
                : 'relative aspect-video rounded-2xl',
        !showControls && !mini && 'cursor-none',
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
          poke()
          report({ playing: true })
          if (touch && !mini && hintEligible && !hintCounted.current) {
            hintCounted.current = true
            setHoldHints((n) => n + 1)
          }
        }}
        onPause={() => {
          setPlaying(false)
          flush()
          report({ playing: false })
        }}
        onWaiting={(e) => {
          setWaiting(true)
          onStall(e.timeStamp)
        }}
        onPlaying={() => setWaiting(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoaded}
        onEnded={() => {
          flush()
          report({ playing: false, ended: true })
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
      {!mini && (
        <div
          className="absolute inset-0"
          onPointerDown={(e) => {
            tapStart.current = { x: e.clientX, y: e.clientY }
            swipe.current = e.pointerType !== 'mouse' && !menu && e.isPrimary ? { x: e.clientX, y: e.clientY, on: false } : null
            hold.onPointerDown(e)
          }}
          onPointerMove={onSurfaceMove}
          onPointerCancel={() => {
            hold.onPointerCancel()
            endSwipe(false)
          }}
          onPointerUp={(e) => {
            hold.onPointerUp()
            endSwipe(true)
            onSurfaceTap(e)
          }}
          onClick={() => pointerType.current === 'mouse' && toggle()}
          onDoubleClick={() => pointerType.current === 'mouse' && toggleFullscreen()}
        />
      )}

      {waiting && !casting && <div className="pointer-events-none absolute inset-0 m-auto size-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />}
      {mini && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
          <div className="h-full bg-accent" style={{ width: `${dur ? (time / dur) * 100 : 0}%` }} />
        </div>
      )}
      {mini ? null : touch ? (
        // Touch: back / play-pause / forward in the middle while the controls show.
        <div
          className={clsx(
            'pointer-events-none absolute inset-0 flex items-center justify-center gap-10 transition-opacity duration-300',
            centre ? 'opacity-100' : 'opacity-0',
          )}
        >
          <Round label={`Back ${TAP_SEEK} seconds`} active={centre} onClick={() => (seekBy(-TAP_SEEK), poke())}>
            <RotateCcw size={26} />
          </Round>
          <Round label={playing ? 'Pause' : 'Play'} big active={centre} onClick={() => (toggle(), poke())}>
            {playing ? <Pause size={34} className="fill-white" /> : <Play size={34} className="ml-1 fill-white" />}
          </Round>
          <Round label={`Forward ${TAP_SEEK} seconds`} active={centre} onClick={() => (seekBy(TAP_SEEK), poke())}>
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
      {touch && !mini && hintEligible && !hintDone && showControls && !point && !marked && !waiting && (
        <div className="pointer-events-none absolute bottom-[4.75rem] left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-[13px] whitespace-nowrap text-white/80 ring-1 ring-white/10 backdrop-blur">
          Hold the picture to mark a moment
        </div>
      )}
      {marked && !mini && (
        <>
          {marked.x >= 0 && (
            <span key={marked.seconds} className="pulse-once pointer-events-none absolute size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-star" style={{ left: marked.x, top: marked.y }} />
          )}
          <div className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/80 py-1 pr-1 pl-3 text-[13px] whitespace-nowrap ring-1 ring-white/10 backdrop-blur">
            <Bookmark size={14} className="text-star" />
            <span className="text-white/90 tabular-nums">Marked {fmt(marked.seconds)}</span>
            <button
              onClick={markAsO}
              disabled={!marked.id}
              title="Count an O at this moment"
              className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 font-semibold hover:bg-sky-500/40 disabled:opacity-50"
            >
              <Droplet size={13} /> O
            </button>
            <button onClick={undoMark} className="rounded-full bg-white px-3 py-1 font-semibold text-black hover:bg-accent hover:text-white">
              Undo
            </button>
          </div>
        </>
      )}
      {landscapePhone && !fullscreen && barShown && showControls && !marked && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-[13px] whitespace-nowrap text-white/80 ring-1 ring-white/10 backdrop-blur">
          Swipe up for the full screen
        </div>
      )}
      {resumedAt !== null && !mini && (
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
          mini && 'hidden',
          showControls ? 'opacity-100 [&>*]:pointer-events-auto' : 'opacity-0',
          immersive &&
            'pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))]',
        )}
      >
        <SeekBar ref={seekBar} dur={dur} time={time} buffered={buffered} markers={scene.markers} vtt={scene.vtt} onSeek={seekTo} onPoint={setPoint} />

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
                    setMenu(false)
                    markAt(time)
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
          {PIP && (
            <Ctl onClick={togglePip} label="Picture in picture (i)" className={pip ? 'text-accent' : ''}>
              <PictureInPicture2 size={20} />
            </Ctl>
          )}
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

type PipVideo = HTMLVideoElement & {
  webkitPresentationMode?: 'inline' | 'picture-in-picture' | 'fullscreen'
  webkitSetPresentationMode?: (mode: 'inline' | 'picture-in-picture' | 'fullscreen') => void
}

type AirPlayVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void
  webkitCurrentPlaybackTargetIsWireless?: boolean
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
