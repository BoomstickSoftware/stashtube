import type { SceneCard as Scene } from '@flix/shared'
import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import { CheckCheck, Heart, ListEnd, ListPlus, ListX, Play, Sparkles, Trash2, Vault } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useClearContinue, useFavoriteScenes, useFeatures, useMarkWatched, useRateScene, useToggleFavoriteScene, useUnlistScene } from '../lib/api'
import { useClickOutside, useMediaQuery, useModal, useSheetDrag } from '../lib/hooks'
import { useNowPlaying } from '../lib/nowPlaying'
import { guardWrite } from '../lib/privacy'
import { showToast } from '../lib/toast'
import { upNext } from '../lib/upNext'
import { DeleteScenesDialog } from './DeleteScenes'
import { PlaylistSheet } from './PlaylistMenu'
import { SheetGrabber } from './Sheet'
import { Stars, UndoButton } from './ui'
import type { Identify } from '../lib/identify'

// A video's less frequent actions, on right-click (a menu at the pointer), a long press or a card's
// "⋯" (a sheet at the bottom of a phone): everything the hover buttons offer and more. The scene
// page's "⋯" opens the same menu (`page`): its row already has Play, Favorite and the playlist, so
// those are left out, and Identify is added.
export interface PageMenu {
  unlisted: boolean // unlisted by hand: the item reads "Show on Home again"
  identify: Identify
  onDeleted: () => void
}
export function CardMenu({ scene, at, onClose, page }: { scene: Scene; at: { x: number; y: number }; onClose: () => void; page?: PageMenu }) {
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
  useModal(ref, onClose)
  const drag = useSheetDrag(ref, onClose)
  const rate = useRateScene()
  const favorites = useFavoriteScenes()
  const toggleFavorite = useToggleFavoriteScene()
  const unlist = useUnlistScene()
  const watched = useMarkWatched()
  const clear = useClearContinue()
  const { data: features } = useFeatures()
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const fav = favorites.has(scene.id)
  const playing = useNowPlaying().scene // "Play next" needs something playing to follow

  // `keep`: the item opens something of its own (a dialog, a sheet) and closes the menu itself
  const item = (icon: ReactNode, label: string, run: () => void, opts: { tone?: 'danger'; keep?: boolean; disabled?: boolean } = {}) => (
    <button
      key={label}
      disabled={opts.disabled}
      onClick={() => {
        run()
        if (!opts.keep) onClose()
      }}
      className={clsx(
        'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/10 disabled:opacity-60 touch:py-3.5',
        opts.tone === 'danger' ? 'text-red-400' : 'text-fg',
      )}
    >
      <span className="w-5 shrink-0 text-muted">{icon}</span>
      {label}
    </button>
  )

  // keep a pointer menu on screen
  const W = 240
  const H = page ? 300 : 380
  const style = sheet ? undefined : { left: Math.min(at.x, innerWidth - W - 8), top: Math.min(at.y, innerHeight - H - 8) }

  if (saving)
    return (
      <PlaylistSheet
        sceneId={scene.id}
        onClose={() => {
          setSaving(false)
          onClose()
        }}
      />
    )
  if (deleting)
    return (
      <DeleteScenesDialog
        scenes={[{ id: scene.id, title: scene.title, size: scene.size }]}
        onClose={() => {
          setDeleting(false)
          onClose()
        }}
        onDeleted={() => page?.onDeleted()}
      />
    )

  return createPortal(
    <div className={clsx('fixed inset-0 z-(--z-sheet)', sheet && 'sheet-scrim bg-scrim backdrop-blur-sm')} onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={ref}
        role="menu"
        tabIndex={-1}
        style={style}
        className={clsx(
          'overflow-hidden bg-surface py-1 shadow-2xl ring-1 ring-white/10 outline-none',
          sheet ? 'sheet-panel absolute inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]' : 'absolute w-60 animate-pop-in rounded-xl',
        )}
      >
        {sheet && (
          <>
            <SheetGrabber {...drag} />
            <div {...drag} className="px-4 pt-1 pb-2">
              <div className="line-clamp-2 text-sm font-semibold">{scene.title}</div>
              <div className="truncate text-xs text-muted">{[scene.studio?.name, scene.performers.map((p) => p.name).join(', ')].filter(Boolean).join(' · ')}</div>
            </div>
          </>
        )}
        {/* rate from any list, without opening the video; the sheet stays open so the stars answer */}
        {!page && (
          <div className="flex items-center justify-between border-b border-white/10 px-4 pb-1 touch:px-1.5">
            <Stars value={scene.rating} onChange={(rating) => guardWrite(() => rate.mutate({ id: scene.id, rating }))} size={sheet ? 22 : 18} />
            <span className="pr-4 text-xs text-muted touch:pr-2.5">{scene.rating ? `${scene.rating} of 5` : 'Not rated'}</span>
          </div>
        )}
        {!page && (
          <>
            {item(<Play size={16} />, 'Play', () => navigate({ to: '/scene/$id', params: { id: scene.id }, search: { play: true } }))}
            {playing &&
              playing.id !== scene.id &&
              item(<ListEnd size={16} />, 'Play next', () => {
                upNext.playNext(scene)
                showToast(
                  'Plays after this video',
                  <UndoButton onClick={() => upNext.remove(scene.id)} />,
                )
              })}
            {item(<Heart size={16} className={fav ? 'fill-accent text-accent' : ''} />, fav ? 'Remove from Favorites' : 'Add to Favorites', () =>
              toggleFavorite.mutate({ id: scene.id, favorite: !fav }),
            )}
            {item(<ListPlus size={16} />, 'Save to playlist…', () => setSaving(true), { keep: true })}
          </>
        )}
        {(scene.playCount === 0 || scene.resumeTime > 0) && item(<CheckCheck size={16} />, 'Mark as watched', () => guardWrite(() => watched.mutate(scene.id)))}
        {scene.resumeTime > 0 && item(<ListX size={16} />, 'Remove from Continue', () => clear.mutate([scene.id], { onSuccess: () => showToast('Removed from Continue') }))}
        {page?.unlisted
          ? item(<Vault size={16} className="text-accent" />, 'Unlisted: show on Home again', () => unlist.mutate({ id: scene.id, unlisted: false }))
          : item(<Vault size={16} />, 'Unlist', () => {
          unlist.mutate({ id: scene.id, unlisted: true })
          showToast(
            'Unlisted: in the Vault, off Home',
            <UndoButton onClick={() => unlist.mutate({ id: scene.id, unlisted: false })} />,
          )
        })}
        {/* the menu stays open on a run, so its progress shows; the page shows it too once closed */}
        {page && item(<Sparkles size={16} className="text-accent" />, page.identify.label, page.identify.start, { keep: true, disabled: page.identify.running })}
        {/* "Not interested" is a delete (decisions/hide-means-delete-block-or-unlist); the dialog
            confirms, so a long press that lands here on a phone costs a Cancel */}
        {features?.deleteScenes && item(<Trash2 size={16} />, 'Not interested: delete…', () => setDeleting(true), { tone: 'danger', keep: true })}
      </div>
    </div>,
    document.body,
  )
}
