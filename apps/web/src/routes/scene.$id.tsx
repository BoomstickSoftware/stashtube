import { createFileRoute } from '@tanstack/react-router'
import { ScenePage } from '../pages/Scene'

// play=1: the link was a Play button (or up next), so start even if videos open paused
export const Route = createFileRoute('/scene/$id')({
  validateSearch: (s: Record<string, unknown>): { playlist?: number; t?: number; play?: boolean } => ({
    playlist: Number(s.playlist) > 0 ? Number(s.playlist) : undefined,
    t: Number(s.t) > 0 ? Number(s.t) : undefined,
    play: s.play === true || s.play === 1 || s.play === '1' || undefined,
  }),
  component: ScenePage,
})
