import { Link, useRouterState } from '@tanstack/react-router'
import clsx from 'clsx'
import { Maximize2, Pause, Play, X } from 'lucide-react'
import { type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { log } from '../lib/diag'
import { duration as fmt } from '../lib/format'
import { nowPlaying, useNowPlaying, useNowPlayingStatus } from '../lib/nowPlaying'
import { Player } from './Player'

// The scene page's placeholder: the host below lays the one Player over it. `children` is
// whatever the page draws on top of the picture (the up-next countdown).
export function PlayerSlot({ theater, children }: { theater: boolean; children?: ReactNode }) {
  const attach = useCallback((el: HTMLDivElement | null) => nowPlaying.attach(el), [])
  return (
    <div className="relative">
      <div ref={attach} className={theater ? 'aspect-video max-h-[calc(100dvh-8rem)] w-full' : 'aspect-video'} />
      {children}
    </div>
  )
}

// Rendered once in Layout. While the scene page shows the playing scene, the Player sits over
// that page's slot (absolute within the layout, so it scrolls with the page and only layout
// changes move it); on any other page it docks as the mini-player. The <video> is the same
// element throughout, so nothing reloads or skips.
export function NowPlayingHost({ root }: { root: RefObject<HTMLElement | null> }) {
  const np = useNowPlaying()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null)
  const slot = np.slot

  // A station is its own immersive player: entering one stops anything docked.
  useEffect(() => {
    if (path === '/station') nowPlaying.close()
  }, [path])

  useLayoutEffect(() => {
    const r = root.current
    if (!slot || !r) return
    const measure = () => {
      const a = slot.getBoundingClientRect()
      const b = r.getBoundingClientRect()
      setBox({ top: a.top - b.top, left: a.left - b.left, width: a.width })
    }
    // ResizeObserver reports once on observe, which is the first measurement
    const ro = new ResizeObserver(measure)
    ro.observe(slot)
    ro.observe(document.body)
    addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      removeEventListener('resize', measure)
    }
  }, [slot, root])

  if (!np.scene) return null
  const docked = !slot
  const scene = np.scene

  const player = (
    <Player
      key={scene.id}
      ref={nowPlaying.setHandle}
      scene={scene}
      theater={!docked && np.theater}
      onTheater={() => np.handlers.onTheater?.()}
      startAt={np.startAt}
      autoStart={np.autoStart}
      onNext={np.handlers.onNext}
      onEnded={() => np.handlers.onEnded?.()}
      mini={docked}
      onStatus={nowPlaying.report}
    />
  )

  // One element skeleton for both placements: the Player must keep its position in the tree,
  // or React would mount a fresh one (and a fresh <video>) on every dock and undock.
  return (
    <div
      className={
        docked
          ? clsx(
              'fixed z-[60] flex overflow-hidden rounded-xl bg-surface shadow-2xl ring-1 ring-white/10',
              'inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+0.5rem)]',
              'lg:inset-x-auto lg:right-4 lg:bottom-4 lg:w-80 lg:flex-col',
            )
          : 'absolute'
      }
      style={docked ? undefined : box ? { top: box.top, left: box.left, width: box.width } : { visibility: 'hidden', width: 0 }}
      role={docked ? 'region' : undefined}
      aria-label={docked ? 'Now playing' : undefined}
    >
      <div className={docked ? 'relative w-32 shrink-0 bg-black lg:w-full' : undefined}>
        {player}
        {docked && <BackToVideo id={scene.id} />}
      </div>
      {docked && <MiniBar scene={scene} />}
    </div>
  )
}

// A tap on the docked picture goes back to the video's page. The three ways back (this
// overlay, the title, Expand) are links, not buttons calling navigate(): a real <a href> still
// gets there if the script's click handling fails, as it seemed to on the iPhone (2026-10-31,
// not reproduced in headless Chrome or WebKit; the taps are logged for Settings →
// Diagnostics). The overlay sits above the playing <video> in its own stacking layer (z-10):
// WebKit composites an inline video on its own layer and can hit-test it over a transparent
// sibling without a z-index.
function BackToVideo({ id }: { id: string }) {
  return <Link to="/scene/$id" params={{ id }} onClick={() => log('dock: tap picture')} className="absolute inset-0 z-10" aria-label="Back to the video" />
}

// The docked card's bar: a strip above the tab bar on a phone, below the picture in a
// bottom-right card on a desktop. The title and the Expand button go back to the video's
// page (Expand is the visible, finger-sized way; the picture and title taps are shortcuts).
function MiniBar({ scene }: { scene: { id: string; title: string } }) {
  const status = useNowPlayingStatus()
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-1 px-2 lg:px-3 lg:py-2">
        <Link to="/scene/$id" params={{ id: scene.id }} onClick={() => log('dock: tap title')} className="block min-w-0 flex-1 text-left">
          <div className="line-clamp-2 text-xs leading-snug font-semibold lg:text-sm">{scene.title}</div>
          <div className="text-[11px] text-muted tabular-nums">
            {fmt(status.time)} / {fmt(status.dur)}
          </div>
        </Link>
        <Link to="/scene/$id" params={{ id: scene.id }} onClick={() => log('dock: tap Expand')} className="rounded-full p-2 text-muted hover:bg-raised hover:text-fg" aria-label="Expand">
          <Maximize2 size={18} />
        </Link>
        <button onClick={() => nowPlaying.toggle()} className="rounded-full p-2 hover:bg-raised" aria-label={status.playing ? 'Pause' : 'Play'}>
          {status.playing ? <Pause size={20} className="fill-white" /> : <Play size={20} className="fill-white" />}
        </button>
        <button onClick={() => nowPlaying.close()} className="rounded-full p-2 text-muted hover:bg-raised hover:text-fg" aria-label="Stop">
          <X size={20} />
        </button>
      </div>
    </>
  )
}
