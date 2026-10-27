import type { SceneCard as Scene, SceneQuery } from '@flix/shared'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { SceneCard } from './SceneCard'

// Horizontal shelf of scenes, Netflix-style.
export function Row({ title, browse, items, actions }: { title: ReactNode; browse?: SceneQuery; items: Scene[]; actions?: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  const page = (dir: number) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' })
  }
  return (
    <section className="group/row">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
        {browse && (
          <Link to="/browse" search={browse} className="text-sm text-muted transition-opacity hover:text-accent [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100">
            See all
          </Link>
        )}
        {actions && <div className="ml-auto flex items-center gap-0.5 opacity-60 transition-opacity group-hover/row:opacity-100">{actions}</div>}
      </div>
      {!items.length && <div className="rounded-xl bg-surface px-4 py-6 text-sm text-muted">Nothing matches this row right now.</div>}
      <div className="relative -mx-4 sm:-mx-6">
        <div ref={scroller} className="no-scrollbar flex snap-x gap-4 overflow-x-auto scroll-smooth px-4 pb-2 sm:px-6">
          {items.map((s) => (
            <SceneCard key={s.id} scene={s} className="w-[78vw] shrink-0 snap-start sm:w-[300px] xl:w-[320px]" />
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
}
