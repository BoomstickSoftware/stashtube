// Reels beside videos (wiki features/reel-review): a card for one reel and a sideways shelf of
// them, shown on Home (waiting for review) and on performer, category and studio pages
// (published reels filed there). A shelf with nothing in it renders nothing.
import type { Reel, ReelState } from '@flix/shared'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { type ReelFilter, useReelShelf } from '../lib/api'
import { duration as fmt } from '../lib/format'

const STATE: Record<ReelState, { label: string; tone: string } | null> = {
  draft: { label: 'Draft', tone: 'text-white/80' },
  queued: { label: 'Queued', tone: 'text-white/80' },
  building: { label: 'Building', tone: 'text-sky-300' },
  failed: { label: 'Build failed', tone: 'text-danger' },
  review: { label: 'Ready for review', tone: 'text-amber-300' },
  published: null, // the normal case carries no badge
}

export function ReelStateBadge({ state, className }: { state: ReelState; className?: string }) {
  const s = STATE[state]
  return s ? <span className={clsx('rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur', s.tone, className)}>{s.label}</span> : null
}

export function ReelCard({ reel, className }: { reel: Reel; className?: string }) {
  const length = reel.published?.durationSec ?? reel.durationSec
  const who = reel.performers.map((p) => p.name).join(', ')
  return (
    <Link to="/reel/$id" params={{ id: String(reel.id) }} className={clsx('press-soft block', className)}>
      <span className="relative block aspect-video overflow-hidden rounded-xl bg-raised">
        {reel.cover && <img src={reel.cover} alt="" loading="lazy" className="h-full w-full object-cover" />}
        <span className="absolute top-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur">Reel</span>
        <span className="absolute right-1.5 bottom-1.5 flex gap-1">
          <ReelStateBadge state={reel.state} />
          <span className="rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums backdrop-blur">{fmt(length)}</span>
        </span>
        {reel.published && reel.resumeSec > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <span className="block h-full bg-accent" style={{ width: `${Math.min(100, (reel.resumeSec / reel.published.durationSec) * 100)}%` }} />
          </span>
        )}
      </span>
      <span className="mt-2 block truncate text-sm font-semibold">{reel.name}</span>
      <span className="block truncate text-xs text-muted">{who || `${reel.clipCount} ${reel.clipCount === 1 ? 'clip' : 'clips'}`}</span>
    </Link>
  )
}

export function ReelShelf({ title, filter, className }: { title: string; filter: ReelFilter; className?: string }) {
  const { data } = useReelShelf(filter)
  if (!data?.length) return null
  return (
    <section aria-label={title} className={className}>
      <h2 className="mb-3 text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
      <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scroll-pl-4 sm:-mx-6 sm:px-6 sm:scroll-pl-6">
        {data.map((r) => (
          <ReelCard key={r.id} reel={r} className="w-[62vw] shrink-0 snap-start sm:w-[260px]" />
        ))}
      </div>
    </section>
  )
}
