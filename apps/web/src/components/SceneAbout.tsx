import type { WantedScene } from '@flix/shared'
import { Info } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSdbSceneDetails } from '../lib/api'
import { date as fmtDate } from '../lib/format'
import { useMediaQuery } from '../lib/hooks'
import { Spinner } from './ui'

// About on a Discover card (wiki features/discover): StashDB's description of the scene in a
// popover from the ⓘ (top left of the card), no backdrop. With a mouse it opens on hover (after a short pause, so
// sweeping across cards does not queue StashDB calls) and stays while the pointer is on it; on a
// phone a tap opens it and a tap outside closes it. Fetched when first opened.

const W = 320
const OPEN_DELAY = 250
const CLOSE_DELAY = 150

export function SceneAbout({ scene: w, className }: { scene: WantedScene; className?: string }) {
  const hover = useMediaQuery('(hover: hover) and (pointer: fine)')
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const later = (fn: () => void, ms: number) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(fn, ms)
  }
  const enter = () => hover && later(() => setOpen(true), open ? 0 : OPEN_DELAY)
  const leave = () => hover && later(() => setOpen(false), CLOSE_DELAY)
  const close = useCallback(() => setOpen(false), [])
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={(e) => {
          e.preventDefault() // the cover may be a link to the library's copy
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        onMouseEnter={enter}
        onMouseLeave={leave}
        aria-label={`About “${w.title}”`}
        aria-expanded={open}
        className={className}
      >
        <Info size={15} />
      </button>
      {open && <AboutPopover scene={w} anchor={anchor} onEnter={enter} onLeave={leave} onClose={close} />}
    </>
  )
}

function AboutPopover({
  scene: w,
  anchor,
  onEnter,
  onLeave,
  onClose,
}: {
  scene: WantedScene
  anchor: React.RefObject<HTMLButtonElement | null>
  onEnter: () => void
  onLeave: () => void
  onClose: () => void
}) {
  const { data, isPending, isError } = useSdbSceneDetails(w.stashdbId)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxH: number } | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current
      if (!a) return
      const r = a.getBoundingClientRect()
      if (r.bottom < 0 || r.top > innerHeight) return onClose()
      // the ⓘ sits in the card's top-left corner: open from its left edge, over the card
      const left = Math.min(Math.max(8, r.left), innerWidth - W - 8)
      const below = innerHeight - r.bottom - 16
      const above = r.top - 16
      setPos(below >= 220 || below >= above ? { top: r.bottom + 6, left, maxH: below } : { bottom: innerHeight - r.top + 6, left, maxH: above })
    }
    place()
    addEventListener('scroll', place, true)
    addEventListener('resize', place)
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // a tap or click outside closes it; the ⓘ itself toggles it through its own click
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !anchor.current?.contains(t)) onClose()
    }
    addEventListener('keydown', k)
    document.addEventListener('pointerdown', down)
    return () => {
      removeEventListener('scroll', place, true)
      removeEventListener('resize', place)
      removeEventListener('keydown', k)
      document.removeEventListener('pointerdown', down)
    }
  }, [anchor, onClose])
  if (!pos) return null
  const meta = [fmtDate(w.date), w.studio, w.runtime ? `${w.runtime} min` : null].filter(Boolean).join(' · ')
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`About “${w.title}”`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: W, maxWidth: 'calc(100vw - 16px)', maxHeight: Math.min(pos.maxH, 420) }}
      className="fixed z-[60] overflow-y-auto overscroll-contain rounded-2xl bg-surface p-4 text-sm shadow-2xl ring-1 ring-line"
    >
      <div className="line-clamp-2 font-semibold">{w.title}</div>
      {meta && <div className="mt-0.5 text-xs text-muted">{meta}</div>}
      {w.performers.length > 0 && <div className="mt-0.5 text-xs text-muted">{w.performers.join(', ')}</div>}
      <div className="mt-3">
        {isPending ? (
          <Spinner />
        ) : isError ? (
          <p className="text-muted">Couldn’t reach StashDB for the description.</p>
        ) : data?.details ? (
          <p className="leading-relaxed whitespace-pre-line text-white/85">{data.details}</p>
        ) : (
          <p className="text-muted">StashDB has no description for this scene.</p>
        )}
      </div>
    </div>,
    document.body,
  )
}
