import type { SceneQuery } from '@flix/shared'
import { getRouteApi } from '@tanstack/react-router'
import type { JSX } from 'react'
import { SceneBrowser } from '../components/SceneBrowser'
import { WatchTabs } from './History'

const route = getRouteApi('/continue')

// Videos started but not finished (Stash keeps a resume point until the last ~15 s),
// most recently watched first.
export function Continue(): JSX.Element {
  const query = route.useSearch()
  const navigate = route.useNavigate()
  return (
    <div>
      <WatchTabs />
      <SceneBrowser
        query={query}
        base={{ inProgress: true }}
        defaultSort="last_played_at"
        onChange={(patch) => navigate({ to: '.', search: (prev: SceneQuery) => ({ ...prev, ...patch }), replace: true })}
      />
    </div>
  )
}
