import type { SceneQuery } from '@flix/shared'
import { summarize, useQueryParts } from '../lib/describe'

// A list's filters as short text: "Jane Doe · Gangbang · 1080p+ · Unwatched".
export function QuerySummary({ query, empty = 'Everything' }: { query: SceneQuery; empty?: string }) {
  const parts = useQueryParts(query)
  return <>{summarize(parts) || empty}</>
}
