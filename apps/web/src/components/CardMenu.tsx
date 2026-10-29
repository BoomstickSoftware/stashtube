import type { SceneCard as Scene } from '@flix/shared'
import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import { CheckCheck, EyeOff, Heart, Play, Radio, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFavoriteScenes, useFeatures, useHideScene, useMarkWatched, useToggleFavoriteScene } from '../lib/api'
import { useClickOutside, useMediaQuery } from '../lib/hooks'
import { showToast } from '../lib/toast'
import { DeleteScenesDialog } from './DeleteScenes'

// A card's actions, on right-click (a menu at the pointer) or a long press (a sheet at the
// bottom of a phone): everything the hover buttons offer and more, without hunting for them.
export function CardMenu({ scene, at, onClose }: { scene: Scene; at: { x: number; y: number }; onClose: () => void }) {
  const navigate = useNavigate()
  const sheet = useMediaQuery('(pointer: coarse)')
  const ref = useRef<HTMLDivElement>(null)
  // The long press that opened a sheet ends with synthesised mouse events on the backdrop;
  // they must not close it again at once.
  const openedAt = useRef(0)
  useEffect(() => {
    openedAt.current = performance.now()
  }, [])
  useClickOutside(ref, () => performance.now() - openedAt.current > 600 && onClose())
  const favorites = useFavoriteScenes()
  const toggleFavorite = useToggleFavoriteScene()
  const hide = useHideScene()
  const watched = useMarkWatched()
  const { data: features } = useFeatures()
  const [deleting, setDeleting] = useState(false)
  const fav = favorites.has(scene.id)

  const item = (icon: ReactNode, label: string, run: () => void, tone?: 'danger') => (
    <button
      key={label}
      onClick={() => {
        run()
        if (!deleting) onClose()
      }}
      className={clsx(
        'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/10 touch:py-3.5',
        tone === 'danger' ? 'text-red-400' : 'text-fg',
      )}
    >
      <span className="w-5 shrink-0 text-muted">{icon}</span>
      {label}
    </button>
  )

  // keep a pointer menu on screen
  const W = 240
  const H = 290
  const style = sheet ? undefined : { left: Math.min(at.x, innerWidth - W - 8), top: Math.min(at.y, innerHeight - H - 8) }

  if (deleting)
    return (
      <DeleteScenesDialog
        scenes={[{ id: scene.id, title: scene.title, size: scene.size }]}
        onClose={() => {
          setDeleting(false)
          onClose()
        }}
        onDeleted={() => {}}
      />
    )

  return createPortal(
    <div className={clsx('fixed inset-0 z-[75]', sheet && 'bg-black/60 backdrop-blur-sm')} onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={ref}
        role="menu"
        style={style}
        className={clsx(
          'overflow-hidden bg-surface py-1 shadow-2xl ring-1 ring-white/10',
          sheet ? 'absolute inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]' : 'absolute w-60 rounded-xl',
        )}
      >
        {sheet && (
          <div className="border-b border-white/10 px-4 py-3">
            <div className="line-clamp-2 text-sm font-semibold">{scene.title}</div>
            <div className="truncate text-xs text-muted">{[scene.studio?.name, scene.performers.map((p) => p.name).join(', ')].filter(Boolean).join(' · ')}</div>
          </div>
        )}
        {item(<Play size={16} />, 'Play', () => navigate({ to: '/scene/$id', params: { id: scene.id }, search: { play: true } }))}
        {item(<Radio size={16} />, 'Station from here', () => navigate({ to: '/station', search: { from: scene.id } }))}
        {item(<Heart size={16} className={fav ? 'fill-accent text-accent' : ''} />, fav ? 'Remove from Favorites' : 'Add to Favorites', () =>
          toggleFavorite.mutate({ id: scene.id, favorite: !fav }),
        )}
        {scene.playCount === 0 && item(<CheckCheck size={16} />, 'Mark as watched', () => watched.mutate(scene.id))}
        {item(<EyeOff size={16} />, 'Not interested', () => {
          hide.mutate({ id: scene.id, hidden: true })
          showToast(
            'Hidden from flix',
            <button onClick={() => hide.mutate({ id: scene.id, hidden: false })} className="rounded-full bg-raised px-3 py-1 text-xs font-semibold hover:bg-line">
              Undo
            </button>,
          )
        })}
        {features?.deleteScenes && item(<Trash2 size={16} />, 'Delete…', () => setDeleting(true), 'danger')}
      </div>
    </div>,
    document.body,
  )
}
