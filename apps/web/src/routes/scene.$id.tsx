import { createFileRoute } from '@tanstack/react-router'
import { prefetchScene } from '../lib/api'
import { ScenePage } from '../pages/Scene'

// play=1: the link was a Play button (or up next), so start even if videos open paused
export const Route = createFileRoute('/scene/$id')({
  validateSearch: (s: Record<string, unknown>): { playlist?: number; t?: number; play?: boolean } => ({
    playlist: Number(s.playlist) > 0 ? Number(s.playlist) : undefined,
    t: Number(s.t) > 0 ? Number(s.t) : undefined,
    play: s.play === true || s.play === 1 || s.play === '1' || undefined,
  }),
  // on intent (a touch or hover on a link) as well as on arrival; never waited on, the page
  // shows the card it already has meanwhile
  loader: ({ params }) => void prefetchScene(params.id),
  component: ScenePage,
})
