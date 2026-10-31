import type { SceneCard as Scene } from '@flix/shared'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { Check, Star } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ago, date, duration, resolution } from '../lib/format'
import { loadSprites, type SpriteCue } from '../lib/media'
import { FavoriteSceneButton, PlaylistMenu } from './PlaylistMenu'
import { CardMenu } from './CardMenu'
import { PreviewVideo } from './PreviewVideo'
import { SpriteThumb } from './SpriteThumb'
import { sized, srcSet } from '@flix/shared'
import { CARD_SIZES } from '../lib/media'

const HOVER_DELAY = 350
const SCRUB_REST = 700 // ms the mouse rests before the scrubbed frame gives way to the preview clip again
const LONG_PRESS = 500 // ms a finger holds still on a card before its menu opens
// Touch screens have no hover: a slight drag on the thumbnail starts the preview instead, so a tap still opens the video.
const DRAG_START_PX = 10

// Only one card previews at a time; starting another stops the current one.
let stopActive: (() => void) | undefined

export function SceneCard({
  scene,
  playlist,
  className,
  compact,
  select,
  extra,
}: {
  scene: Scene
  playlist?: number
  className?: string
  compact?: boolean
  select?: { selected: boolean; onToggle: () => void } // multi-select mode: clicks toggle instead of opening
  extra?: string | null // one more fact for the meta line
}) {
  const [hovering, setHovering] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)
  // Moving the mouse across the thumbnail scrubs through the sprite frames (the tube-site
  // convention); once it rests, the preview clip shows again.
  const [sprites, setSprites] = useState<SpriteCue[]>([])
  // Right-click, or a long press on a touch screen, opens the card's menu.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const pressTimer = useRef<number>(undefined)
  const [scrub, setScrub] = useState<{ t: number; w: number } | null>(null)
  const restTimer = useRef<number>(undefined)
  const timer = useRef<number>(undefined)
  const touchStart = useRef<{ x: number; y: number }>(undefined)
  const dragged = useRef(false) // this touch started a preview, so the click it ends with must not open the video
  const root = useRef<HTMLDivElement>(null)
  const res = resolution(scene.height)
  const progress = scene.resumeTime && scene.durationSec ? Math.min(1, scene.resumeTime / scene.durationSec) : 0

  // Stable across renders, so it can identify this card in `stopActive`.
  const leave = useCallback(function stop() {
    clearTimeout(timer.current)
    clearTimeout(restTimer.current)
    setHovering(false)
    setPreviewReady(false)
    setScrub(null)
    if (stopActive === stop) stopActive = undefined
  }, [])
  const start = () => {
    if (stopActive && stopActive !== leave) stopActive()
    stopActive = leave
    setHovering(true)
  }
  const enter = () => {
    timer.current = window.setTimeout(start, HOVER_DELAY)
    if (scene.vtt) loadSprites(scene.vtt).then(setSprites)
  }
  const onScrub = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || select || !sprites.length || !scene.durationSec) return
    const r = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    setScrub({ t: frac * scene.durationSec, w: r.width })
    clearTimeout(restTimer.current)
    restTimer.current = window.setTimeout(() => setScrub(null), SCRUB_REST)
  }

  // Stop a preview once its card has mostly scrolled out of view.
  useEffect(() => {
    const el = root.current
    if (!hovering || !el) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry && entry.intersectionRatio < 0.5) leave()
    }, { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [hovering, leave])

  useEffect(() => leave, [leave])

  return (
    <div
      ref={root}
      className={clsx('group min-w-0', className)}
      // a real mouse only: iOS sends emulated mouse events on every tap
      onPointerEnter={(e) => e.pointerType === 'mouse' && !select && enter()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && leave()}
      onClickCapture={
        select
          ? (e) => {
              e.preventDefault()
              e.stopPropagation()
              select.onToggle()
            }
          : undefined
      }
    >
      <Link
        to="/scene/$id"
        params={{ id: scene.id }}
        search={playlist ? { playlist } : {}}
        className={clsx(
          'relative block aspect-video overflow-hidden rounded-xl bg-surface ring-1 ring-white/5',
          select?.selected && 'ring-4 !ring-accent',
        )}
        onTouchStart={(e) => {
          const t = e.touches[0]
          dragged.current = false
          touchStart.current = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : undefined
          clearTimeout(pressTimer.current)
          if (t && !select)
            pressTimer.current = window.setTimeout(() => {
              dragged.current = true // the click that ends this press must not open the video
              touchStart.current = undefined
              leave()
              setMenu({ x: t.clientX, y: t.clientY })
            }, LONG_PRESS)
        }}
        onTouchMove={(e) => {
          const from = touchStart.current
          const t = e.touches[0]
          if (!from || !t) return
          const moved = Math.hypot(t.clientX - from.x, t.clientY - from.y) >= DRAG_START_PX
          // any real movement is a scroll or a drag, never the long press (also while this
          // card's preview already plays, or the menu would open mid-scroll)
          if (moved) clearTimeout(pressTimer.current)
          if (hovering || select) return
          if (moved) {
            touchStart.current = undefined
            dragged.current = true
            start()
          }
        }}
        onTouchEnd={() => clearTimeout(pressTimer.current)}
        onTouchCancel={() => clearTimeout(pressTimer.current)}
        onContextMenu={(e) => {
          if (select) return
          e.preventDefault()
          leave()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        onClick={(e) => {
          if (dragged.current) e.preventDefault()
        }}
        onPointerMove={hovering ? onScrub : undefined}
      >
        {select && (
          <span
            className={clsx(
              'absolute top-2 left-2 z-10 flex size-6 items-center justify-center rounded-md ring-2',
              select.selected ? 'bg-accent ring-accent' : 'bg-black/50 ring-white/80',
            )}
          >
            {select.selected && <Check size={16} strokeWidth={3} />}
          </span>
        )}
        <img
          src={sized(scene.screenshot, 640)}
          srcSet={srcSet(scene.screenshot)}
          sizes={CARD_SIZES}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {hovering && scene.preview && (
          <PreviewVideo src={scene.preview} ready={previewReady && !scrub} onReady={() => setPreviewReady(true)} className="duration-200" />
        )}
        {scrub && (
          <>
            <SpriteThumb cues={sprites} t={scrub.t} width={scrub.w} className="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-white/20">
              <div className="h-full bg-white/80" style={{ width: `${(scrub.t / scene.durationSec) * 100}%` }} />
            </div>
            <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums backdrop-blur">
              {duration(scrub.t)}
            </span>
          </>
        )}
        <div className="absolute right-1.5 bottom-1.5 flex gap-1">
          {res && (
            <span
              className={clsx(
                'rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur',
                scene.height >= 2000 ? 'text-star' : 'text-white/90',
              )}
            >
              {res}
            </span>
          )}
          <span className="rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums backdrop-blur">
            {duration(scene.durationSec)}
          </span>
        </div>
        {scene.rating != null && (
          <span className="absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-star backdrop-blur">
            <Star size={11} className="fill-star" />
            {scene.rating}
          </span>
        )}
        {scene.playCount === 0 && !progress && (
          <span className="absolute top-1.5 right-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase opacity-0 transition-opacity group-hover:opacity-100">
            New
          </span>
        )}
        {progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </Link>
      <div className="mt-2.5 flex gap-2.5">
        {!compact && scene.studio && (
          <Link to="/studio/$id" params={{ id: scene.studio.id }} className="shrink-0">
            <div className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-white p-1">
              {scene.studio.image ? (
                <img src={sized(scene.studio.image, 320)} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs font-bold text-black">{scene.studio.name[0]}</span>
              )}
            </div>
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <Link
            to="/scene/$id"
            params={{ id: scene.id }}
            search={playlist ? { playlist } : {}}
            className="line-clamp-2 text-[14px] leading-snug font-semibold text-fg hover:text-white"
            title={scene.title}
          >
            {scene.title}
          </Link>
          {scene.performers.length > 0 && (
            <div className="mt-0.5 truncate text-[13px] text-muted">
              {scene.performers.slice(0, 4).map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <Link to="/performer/$id" params={{ id: p.id }} className="hover:text-fg">
                    {p.name}
                  </Link>
                </span>
              ))}
              {scene.performers.length > 4 && ` +${scene.performers.length - 4}`}
            </div>
          )}
          <div className="mt-0.5 truncate text-[12px] text-muted/80">
            {[scene.studio && compact ? scene.studio.name : null, date(scene.date) ?? ago(scene.createdAt), extra, scene.playCount ? `${scene.playCount} view${scene.playCount > 1 ? 's' : ''}` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {/* a Featured pick says why it is here, on its own line so it is not cut off */}
          {scene.why && <div className="mt-0.5 truncate text-[11px] text-accent/90">{scene.why}</div>}
        </div>
        <div className="-mr-1.5 flex shrink-0 flex-col items-center opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:has-[[aria-pressed=true]]:opacity-100">
          <FavoriteSceneButton sceneId={scene.id} />
          <PlaylistMenu sceneId={scene.id} variant="icon" />
        </div>
      </div>
      {menu && <CardMenu scene={scene} at={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}

export function SceneCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-video rounded-xl bg-surface" />
      <div className="mt-3 h-4 w-4/5 rounded bg-surface" />
      <div className="mt-2 h-3 w-1/2 rounded bg-surface" />
    </div>
  )
}
