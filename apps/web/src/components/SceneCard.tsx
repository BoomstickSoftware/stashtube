import type { SceneCard as Scene } from '@flix/shared'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { Check, Star } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ago, date, duration, resolution } from '../lib/format'
import { FavoriteSceneButton, PlaylistMenu } from './PlaylistMenu'
import { PreviewVideo } from './PreviewVideo'

const HOVER_DELAY = 350
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
}: {
  scene: Scene
  playlist?: number
  className?: string
  compact?: boolean
  select?: { selected: boolean; onToggle: () => void } // multi-select mode: clicks toggle instead of opening
}) {
  const [hovering, setHovering] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)
  const timer = useRef<number>(undefined)
  const touchStart = useRef<{ x: number; y: number }>(undefined)
  const dragged = useRef(false) // this touch started a preview, so the click it ends with must not open the video
  const root = useRef<HTMLDivElement>(null)
  const res = resolution(scene.height)
  const progress = scene.resumeTime && scene.durationSec ? Math.min(1, scene.resumeTime / scene.durationSec) : 0

  // Stable across renders, so it can identify this card in `stopActive`.
  const leave = useCallback(function stop() {
    clearTimeout(timer.current)
    setHovering(false)
    setPreviewReady(false)
    if (stopActive === stop) stopActive = undefined
  }, [])
  const start = () => {
    if (stopActive && stopActive !== leave) stopActive()
    stopActive = leave
    setHovering(true)
  }
  const enter = () => {
    timer.current = window.setTimeout(start, HOVER_DELAY)
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
        }}
        onTouchMove={(e) => {
          const from = touchStart.current
          const t = e.touches[0]
          if (!from || !t || hovering || select) return
          if (Math.hypot(t.clientX - from.x, t.clientY - from.y) >= DRAG_START_PX) {
            touchStart.current = undefined
            dragged.current = true
            start()
          }
        }}
        onClick={(e) => {
          if (dragged.current) e.preventDefault()
        }}
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
          src={scene.screenshot}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {hovering && scene.preview && (
          <PreviewVideo src={scene.preview} ready={previewReady} onReady={() => setPreviewReady(true)} className="duration-200" />
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
                <img src={scene.studio.image} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
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
            {[scene.studio && compact ? scene.studio.name : null, date(scene.date) ?? ago(scene.createdAt), scene.playCount ? `${scene.playCount} view${scene.playCount > 1 ? 's' : ''}` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="-mr-1.5 flex shrink-0 flex-col items-center opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:has-[[aria-pressed=true]]:opacity-100">
          <FavoriteSceneButton sceneId={scene.id} />
          <PlaylistMenu sceneId={scene.id} variant="icon" />
        </div>
      </div>
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
