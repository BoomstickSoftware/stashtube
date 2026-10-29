import { createFileRoute } from '@tanstack/react-router'
import { Performers } from '../pages/Directories'

export const Route = createFileRoute('/performers')({
  validateSearch: (s: Record<string, unknown>): { q?: string; sort?: string; favorites?: boolean } => ({
    q: typeof s.q === 'string' ? s.q : undefined,
    sort: typeof s.sort === 'string' ? s.sort : undefined,
    favorites: s.favorites === true || s.favorites === '1' ? true : undefined,
  }),
  component: Performers,
})
