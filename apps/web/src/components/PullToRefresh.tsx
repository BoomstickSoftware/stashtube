import { useRouterState } from '@tanstack/react-router'
import { ArrowDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { queryClient } from '../lib/api/client'
import { useMediaQuery } from '../lib/hooks'
import { Spinner } from './ui'

const THRESHOLD = 72 // px of pull (after damping) that commits to a refresh
const MAX = 110
export const REFRESH_EVENT = 'flix:refresh' // a page with more to do than refetch listens (Home draws new picks)

// Pull down at the top of a page to refresh it. Only in the installed app: there is no browser
// chrome there and so no reload button, while Safari and Chrome have a pull of their own. A
// refresh refetches what the page shows; Home also draws a new set of picks. Off while a sheet
// is open (the page is locked) and in the full-screen station player.
export function PullToRefresh() {
  const standalone = useMediaQuery('(display-mode: standalone)')
  const touch = useMediaQuery('(pointer: coarse)')
  const path = useRouterState({ select: (s) => s.location.pathname })
  const enabled = standalone && touch && path !== '/station'
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false) // the finger is down: the indicator follows it without easing
  const state = useRef({ y: 0, x: 0, on: false, pull: 0, busy: false })

  useEffect(() => {
    if (!enabled) return
    const s = state.current
    const start = (e: TouchEvent) => {
      const locked = document.documentElement.style.overflow === 'hidden'
      const t = e.target as HTMLElement
      s.on = !s.busy && !locked && window.scrollY <= 0 && e.touches.length === 1 && !t.closest?.('input, textarea, [data-no-pull]')
      s.y = e.touches[0].clientY
      s.x = e.touches[0].clientX
      s.pull = 0
      setDragging(s.on)
    }
    const move = (e: TouchEvent) => {
      if (!s.on) return
      const dy = e.touches[0].clientY - s.y
      const dx = Math.abs(e.touches[0].clientX - s.x)
      // a sideways drag (a row of cards) or a scroll back up is not a pull
      if (window.scrollY > 0 || (s.pull === 0 && dx > dy)) {
        s.on = false
        setPull(0)
        return
      }
      s.pull = Math.min(MAX, Math.max(0, dy) * 0.5)
      setPull(s.pull)
    }
    const end = () => {
      setDragging(false)
      if (!s.on) return
      s.on = false
      if (s.pull < THRESHOLD) return setPull(0)
      s.busy = true
      setBusy(true)
      setPull(THRESHOLD)
      window.dispatchEvent(new Event(REFRESH_EVENT))
      const onHome = location.pathname === '/'
      const done = () => {
        s.busy = false
        setBusy(false)
        setPull(0)
      }
      // at least long enough to see it happen
      Promise.all([
        queryClient.refetchQueries({ type: 'active', predicate: (q) => !(onHome && q.queryKey[0] === 'home') }),
        new Promise((r) => setTimeout(r, 500)),
      ]).then(done, done)
    }
    addEventListener('touchstart', start, { passive: true })
    addEventListener('touchmove', move, { passive: true })
    addEventListener('touchend', end)
    addEventListener('touchcancel', end)
    return () => {
      removeEventListener('touchstart', start)
      removeEventListener('touchmove', move)
      removeEventListener('touchend', end)
      removeEventListener('touchcancel', end)
    }
  }, [enabled])

  if (!enabled || (pull === 0 && !busy)) return null
  const ready = pull >= THRESHOLD
  return (
    <div
      role="status"
      aria-label={busy ? 'Refreshing' : 'Pull to refresh'}
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-(--z-toast) flex justify-center"
      style={{ transform: `translateY(${pull - 16}px)`, opacity: Math.min(1, pull / 40), transition: dragging ? 'none' : 'transform 0.2s var(--ease-standard), opacity 0.2s' }}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-raised shadow-2xl ring-1 ring-white/10">
        {busy ? <Spinner className="size-5" /> : <ArrowDown size={18} className={ready ? 'text-accent' : 'text-muted'} style={{ transform: `rotate(${ready ? 180 : 0}deg)`, transition: 'transform 0.15s' }} />}
      </div>
    </div>
  )
}
