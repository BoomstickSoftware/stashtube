import type { SceneQuery } from '@flix/shared'
import type { JSX } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { SceneBrowser } from '../components/SceneBrowser'
import { getBrowseFilters, setBrowseFilters } from '../lib/filters'

const route = getRouteApi('/browse')

// The filters live in the URL and are mirrored to this browser (lib/filters), so "+" buttons
// elsewhere can add to them and a bare /browse (the nav link) brings them back.
export function Browse(): JSX.Element {
  const query = route.useSearch()
  const navigate = route.useNavigate()
  // Only when the page opens: clearing every filter later must not bring them back.
  const restore = useRef(
    Object.values(query).every((v) => v === undefined) && Object.keys(getBrowseFilters()).length > 0 ? getBrowseFilters() : null,
  )

  useEffect(() => {
    if (restore.current) {
      navigate({ to: '.', search: restore.current, replace: true })
      restore.current = null
    } else setBrowseFilters(query)
  }, [query, navigate])

  return (
    <SceneBrowser
      query={query}
      onChange={(patch) => navigate({ to: '.', search: (prev: SceneQuery) => ({ ...prev, ...patch }), replace: true })}
      defaultSort="date"
    />
  )
}
