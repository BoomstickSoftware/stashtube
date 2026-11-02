import { createFileRoute } from '@tanstack/react-router'
import type { DiscoverSort } from '@flix/shared'
import { Discover } from '../pages/Discover'

export interface DiscoverSearch {
  q?: string
  performers?: string // StashDB ids, comma-separated
  studios?: string
  tags?: string
  sort?: DiscoverSort
  tab?: 'waiting'
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
export const Route = createFileRoute('/discover')({
  validateSearch: (s: Record<string, unknown>): DiscoverSearch => ({
    q: str(s.q),
    performers: str(s.performers),
    studios: str(s.studios),
    tags: str(s.tags),
    sort: s.sort === 'added' || s.sort === 'trending' ? s.sort : undefined,
    tab: s.tab === 'waiting' ? 'waiting' : undefined,
  }),
  component: Discover,
})
