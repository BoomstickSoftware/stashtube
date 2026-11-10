import clsx from 'clsx'
import { Check, Heart, ListPlus, Plus } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFavoriteScenes, usePlaylistMutations, usePlaylists, useScenePlaylists, useToggleFavoriteScene } from '../lib/api'
import { Button } from './ui'
import { useClickOutside, useMediaQuery } from '../lib/hooks'
import { Sheet } from './Sheet'

const MENU_W = 288

// "Save to playlist". On a card it is an icon; the menu is portalled to <body> so scrolling
// shelves and card overflow do not clip it. Membership loads when the menu opens.
export function PlaylistMenu({ sceneId, variant = 'button' }: { sceneId: string; variant?: 'button' | 'icon' }) {
  const [open, setOpen] = useState(false)
  const sheet = useMediaQuery('(pointer: coarse)')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const anchor = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)
  useClickOutside(menu, close, open)
  useLayoutEffect(() => {
    if (!open || sheet || !anchor.current) return
    const place = () => {
      const r = anchor.current!.getBoundingClientRect()
      const left = Math.min(Math.max(8, r.right - MENU_W), window.innerWidth - MENU_W - 8)
      const below = r.bottom + 8
      const top = below + 360 > window.innerHeight ? Math.max(8, r.top - 368) : below
      setPos({ top, left })
    }
    // Follow the anchor while the page scrolls (on a phone, focusing the name field scrolls
    // it); close once the anchor has left the screen. Scrolling inside the menu is ignored.
    const onScroll = (e: Event) => {
      if (menu.current?.contains(e.target as Node)) return
      const r = anchor.current!.getBoundingClientRect()
      if (r.bottom < 0 || r.top > window.innerHeight) close()
      else place()
    }
    place()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
    }
  }, [open, sheet])

  return (
    <div ref={anchor} className="relative">
      {variant === 'icon' ? (
        <button
          onClick={() => setOpen((v) => !v)}
          title="Save to playlist"
          aria-label="Save to playlist"
          className={clsx('rounded-full p-1.5 text-muted hover:bg-raised hover:text-fg touch:p-2.5', open && 'bg-raised text-fg')}
        >
          <ListPlus size={18} />
        </button>
      ) : (
        <Button onClick={() => setOpen((v) => !v)} active={open} title="Save to playlist">
          <ListPlus size={18} /> Playlist
        </Button>
      )}
      {open && sheet && <PlaylistSheet sceneId={sceneId} onClose={close} />}
      {open &&
        !sheet &&
        pos &&
        createPortal(
          <div
            ref={menu}
            style={{ top: pos.top, left: pos.left, width: MENU_W }}
            className="fixed z-[60] overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-line"
          >
            <div className="border-b border-line px-4 py-3 text-sm font-semibold">Save to playlist</div>
            <PlaylistList sceneId={sceneId} />
          </div>,
          document.body,
        )}
    </div>
  )
}

// The playlists with this video's membership, and a field for a new one. Membership loads
// when it shows.
function PlaylistList({ sceneId }: { sceneId: string }) {
  const [name, setName] = useState('')
  const { data: playlists } = usePlaylists()
  const { data: member = [] } = useScenePlaylists(sceneId, true)
  const m = usePlaylistMutations()
  return (
    <>
      <div className="max-h-64 overflow-y-auto py-1">
        {playlists?.map((p) => {
          const has = member.includes(p.id)
          return (
            <button
              key={p.id}
              onClick={() => (has ? m.removeItem : m.add).mutate({ id: p.id, sceneId })}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/5 touch:py-3"
            >
              <span className={`flex size-5 shrink-0 items-center justify-center rounded ${has ? 'bg-accent' : 'ring-1 ring-white/30'}`}>
                {has && <Check size={14} />}
              </span>
              {p.favorites && <Heart size={14} className="shrink-0 fill-accent text-accent" />}
              <span className="truncate">{p.name}</span>
              <span className="ml-auto text-xs text-muted">{p.itemCount}</span>
            </button>
          )
        })}
      </div>
      <form
        className="flex items-center gap-2 border-t border-line p-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          m.create.mutate({ name: name.trim(), sceneId }, { onSuccess: () => setName('') })
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New playlist"
          className="min-w-0 flex-1 rounded-lg bg-raised px-3 py-2 text-sm outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
        />
        <button type="submit" className="rounded-lg bg-accent p-2 hover:bg-accent-hover touch:p-3" aria-label="Create playlist">
          <Plus size={16} />
        </button>
      </form>
    </>
  )
}

// "Save to playlist" as a sheet: what the card menu and touch screens use.
export function PlaylistSheet({ sceneId, onClose }: { sceneId: string; onClose: () => void }) {
  return (
    <Sheet title="Save to playlist" onClose={onClose} z="z-[80]">
      <PlaylistList sceneId={sceneId} />
    </Sheet>
  )
}

// Heart on a video: membership in the built-in Favorites playlist.
export function FavoriteSceneButton({ sceneId, variant = 'icon' }: { sceneId: string; variant?: 'button' | 'icon' }) {
  const favorites = useFavoriteScenes()
  const toggle = useToggleFavoriteScene()
  const on = favorites.has(sceneId)
  // the heart pops when a tap fills it, not when the page first shows it filled
  const [tapped, setTapped] = useState(false)
  const click = () => {
    setTapped(true)
    toggle.mutate({ id: sceneId, favorite: !on })
  }
  const icon = <Heart key={String(on)} size={variant === 'icon' ? 18 : 17} className={clsx(on && 'fill-accent text-accent', on && tapped && 'animate-pop')} />
  if (variant === 'button') {
    return (
      <Button onClick={click} title={on ? 'Remove from Favorites' : 'Add to Favorites'} aria-pressed={on}>
        {icon} Favorite
      </Button>
    )
  }
  return (
    <button
      onClick={click}
      title={on ? 'Remove from Favorites' : 'Add to Favorites'}
      aria-label={on ? 'Remove from Favorites' : 'Add to Favorites'}
      aria-pressed={on}
      className={clsx('rounded-full p-1.5 hover:bg-raised touch:p-3', on ? 'text-accent' : 'text-muted hover:text-fg')}
    >
      {icon}
    </button>
  )
}
