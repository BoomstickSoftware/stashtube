import { createFileRoute } from '@tanstack/react-router'
import { parseSceneQuery } from '../lib/query'
import type { StationSearch } from '../lib/station'
import { Station } from '../pages/Station'

// A saved station (id), or ad hoc: a filter set, or from=<scene id> to drift through related videos
export const Route = createFileRoute('/station')({
  validateSearch: (s: Record<string, unknown>): StationSearch => ({
    ...parseSceneQuery(s),
    from: typeof s.from === 'string' || typeof s.from === 'number' ? String(s.from) : undefined,
    id: Number(s.id) > 0 ? Number(s.id) : undefined,
    start: s.start === 'resume' ? 'resume' : undefined,
  }),
  component: Station,
})
