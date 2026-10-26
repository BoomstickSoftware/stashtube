import type { SceneCard as Scene } from '@flix/shared'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { Check, Star } from 'lucide-react'
import { useRef, useState } from 'react'
import { ago, date, duration, resolution } from '../lib/format'
import { FavoriteSceneButton, PlaylistMenu } from './PlaylistMenu'

const HOVER_DELAY = 350

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
  const res = resolution(scene.height)
  const progress = scene.resumeTime && scene.durationSec ? Math.min(1, scene.resumeTime / scene.durationSec) : 0

  const enter = () => {
    timer.current = window.setTimeout(() => setHovering(true), HOVER_DELAY)
  }
  const leave = () => {
    clearTimeout(timer.current)
    setHovering(false)
    setPreviewReady(false)
  }

  return (
    <div
      className={clsx('group min-w-0', className)}
      onMouseEnter={enter}
      onMouseLeave={leave}
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
          <video
            src={scene.preview}
            autoPlay
            muted
            loop
            playsInline
            onPlaying={() => setPreviewReady(true)}
            className={clsx(
              'absolute inset-0 size-full object-cover transition-opacity duration-200',
              previewReady ? 'opacity-100' : 'opacity-0',
            )}
          />
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
