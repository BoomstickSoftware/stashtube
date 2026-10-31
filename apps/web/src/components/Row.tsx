import type { SceneCard as Scene, SceneQuery } from '@flix/shared'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Radio } from 'lucide-react'
import { memo, useRef, type ReactNode } from 'react'
import { SceneCard } from './SceneCard'

// Horizontal shelf of scenes, Netflix-style. Memoised: Home holds a dozen of these and must
// not re-render them all when something unrelated (the hero) ticks.
const ROW_SIZES = '(min-width: 1280px) 320px, (min-width: 640px) 300px, 78vw' // the card widths below
export const Row = memo(function Row({ title, browse, from, items, actions }: { title: ReactNode; browse?: SceneQuery; from?: string; items: Scene[]; actions?: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  const page = (dir: number) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' })
  }
  return (
    <section className="group/row [content-visibility:auto] [contain-intrinsic-size:auto_400px]">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
        {browse && (
          <Link to="/browse" search={browse} className="text-sm text-muted transition-opacity hover:text-accent [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100">
            See all
          </Link>
        )}
        {from && (
          <Link to="/station" search={{ from }} className="inline-flex items-center gap-1 text-sm text-muted transition-opacity hover:text-accent [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100">
            <Radio size={13} /> Station
          </Link>
        )}
        {actions && <div className="ml-auto flex items-center gap-0.5 opacity-60 transition-opacity group-hover/row:opacity-100">{actions}</div>}
      </div>
      {!items.length && <div className="rounded-xl bg-surface px-4 py-6 text-sm text-muted">Nothing matches this row right now.</div>}
      <div className="relative -mx-4 sm:-mx-6">
        <div ref={scroller} className="no-scrollbar flex snap-x gap-4 overflow-x-auto scroll-smooth px-4 pb-2 scroll-pl-4 sm:px-6 sm:scroll-pl-6">
          {items.map((s) => (
            <SceneCard key={s.id} scene={s} sizes={ROW_SIZES} className="w-[78vw] shrink-0 snap-start sm:w-[300px] xl:w-[320px]" />
          ))}
        </div>
        <button
          onClick={() => page(-1)}
          aria-label="Scroll left"
          className="absolute top-[calc((min(78vw,320px)*9/16)/2)] left-2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/80 opacity-0 ring-1 ring-white/10 transition group-hover/row:opacity-100 hover:bg-accent sm:flex"
        >
          <ChevronLeft />
        </button>
        <button
          onClick={() => page(1)}
          aria-label="Scroll right"
          className="absolute top-[calc((min(78vw,320px)*9/16)/2)] right-2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/80 opacity-0 ring-1 ring-white/10 transition group-hover/row:opacity-100 hover:bg-accent sm:flex"
        >
          <ChevronRight />
        </button>
      </div>
    </section>
  )
})
