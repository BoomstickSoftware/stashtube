import type { SceneDetail } from '@flix/shared'
import clsx from 'clsx'
import type Hls from 'hls.js'
import {
  Airplay,
  Check,
  Maximize,
  Minimize,
  Pause,
  Play,
  RectangleHorizontal,
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
  const stalls = useRef<number[]>([])
  const [menu, setMenu] = useState(false)
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
  const [hover, setHover] = useState<{ x: number; t: number; w: number } | null>(null)
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

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen()
    else wrap.current?.requestFullscreen()
  }, [])

  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

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

  // Hide controls while playing and the mouse is still.
  const idleTimer = useRef<number>(undefined)
  const poke = () => {
    setIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setIdle(true), 2500)
  }

  const bar = useRef<HTMLDivElement>(null)
  const timeAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect()
    const x = Math.max(0, Math.min(r.width, clientX - r.left))
    return { x, t: (x / r.width) * (dur || 0), w: r.width }
  }
  const scrubbing = useRef(false)
  const onBarDown = (e: React.PointerEvent) => {
    scrubbing.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    video.current!.currentTime = timeAt(e.clientX).t
  }
  const onBarMove = (e: React.PointerEvent) => {
    const p = timeAt(e.clientX)
    setHover(p)
    if (scrubbing.current) video.current!.currentTime = p.t
  }

  const cue = hover ? cueAt(sprites, hover.t) : null
  const showControls = !playing || !idle || hover !== null
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  const thumbW = 192

  return (
    <div
      ref={wrap}
      onMouseMove={poke}
      onMouseLeave={() => setIdle(true)}
      className={clsx(
        'group/player relative overflow-hidden bg-black select-none',
        fullscreen ? 'size-full' : theater ? 'aspect-video max-h-[calc(100dvh-8rem)] w-full' : 'aspect-video rounded-2xl',
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
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setPlaying(true)
          lastTick.current = performance.now()
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
      {waiting && !casting && <div className="pointer-events-none absolute inset-0 m-auto size-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />}
      {!playing && !waiting && (
        <button onClick={toggle} className="absolute inset-0 m-auto flex size-20 items-center justify-center rounded-full bg-black/50 backdrop-blur transition hover:scale-105 hover:bg-accent">
          <Play size={36} className="ml-1 fill-white" />
        </button>
      )}
      {flash && (
        <div className="pointer-events-none absolute inset-0 m-auto flex size-20 items-center justify-center rounded-full bg-black/60 text-lg font-semibold">
          {flash}
        </div>
      )}

      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-3 pt-16 pb-2 transition-opacity duration-300 sm:px-4',
          showControls ? 'opacity-100' : 'opacity-0',
        )}
      >
        {/* seek bar */}
        <div
          ref={bar}
          className="group/bar relative flex h-5 cursor-pointer items-center"
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={() => (scrubbing.current = false)}
          onPointerLeave={() => !scrubbing.current && setHover(null)}
        >
          <div className="relative h-1 w-full rounded-full bg-white/25 transition-[height] group-hover/bar:h-1.5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: `${(buffered / (dur || 1)) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(time / (dur || 1)) * 100}%` }} />
            {scene.markers.map((m) => (
              <div
                key={m.id}
                className="absolute -inset-y-0.5 w-1 -translate-x-1/2 rounded-full bg-star"
                style={{ left: `${(m.seconds / (dur || 1)) * 100}%` }}
              />
            ))}
            {hover && <div className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: hover.x }} />}
            <div
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-accent transition-transform group-hover/bar:scale-100"
              style={{ left: `${(time / (dur || 1)) * 100}%` }}
            />
          </div>
          {hover && (
            <div
              className="pointer-events-none absolute bottom-7 flex flex-col items-center"
              style={{ left: Math.max(thumbW / 2, Math.min(hover.w - thumbW / 2, hover.x)), transform: 'translateX(-50%)' }}
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
                const near = scene.markers.find((m) => Math.abs(m.seconds - hover.t) < (dur || 1) * 0.01)
                return near ? <span className="mt-1 max-w-48 truncate rounded bg-star px-1.5 py-0.5 text-xs font-semibold text-black">{near.title || 'Marker'}</span> : null
              })()}
              <span className="mt-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium tabular-nums">{fmt(hover.t)}</span>
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
              className="slim w-0 opacity-0 transition-all group-hover/vol:w-20 group-hover/vol:opacity-100"
            />
          </div>
          <span className="ml-1 text-[13px] text-white/90 tabular-nums">
            {fmt(time)} <span className="text-white/50">/ {fmt(dur)}</span>
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
            <Ctl onClick={() => setMenu((v) => !v)} label="Settings">
              <Settings2 size={20} className={menu ? 'rotate-45 transition-transform' : 'transition-transform'} />
            </Ctl>
            {menu && (
              <div className="absolute right-0 bottom-11 w-60 overflow-hidden rounded-xl bg-black/90 py-1 text-sm shadow-2xl ring-1 ring-white/10 backdrop-blur">
                <div className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-white/50 uppercase">Quality</div>
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
            className="rounded px-2 py-1 text-[13px] font-semibold text-white/90 hover:bg-white/10"
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

function Ctl({ children, onClick, label, className }: { children: React.ReactNode; onClick: () => void; label: string; className?: string }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={clsx('flex size-9 items-center justify-center rounded-full text-white hover:bg-white/10', className)}>
      {children}
    </button>
  )
}
