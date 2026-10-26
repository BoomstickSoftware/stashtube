import type { SceneQuery } from '@flix/shared'
import type { JSX } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { SceneBrowser } from '../components/SceneBrowser'

const route = getRouteApi('/browse')

export function Browse(): JSX.Element {
  const query = route.useSearch()
  const navigate = route.useNavigate()
  return (
    <SceneBrowser
      query={query}
      onChange={(patch) => navigate({ to: ".", search: (prev: SceneQuery) => ({ ...prev, ...patch }), replace: true })}
      defaultSort="date"
    />
  )
}
