// Recent searches: the last few things searched for or picked from the search box, kept in this
// browser only. Shown when the empty box is focused, so a repeat search is one tap. A private
// session adds nothing (lib/privacy.ts); what is already there still shows, and "Clear" or the
// × on a row removes it (decisions/search-recents, 2026-11-10).
import { isPrivate } from './privacy'
import { readStored, useStored, writeStored } from './storage'

export interface Recent {
  kind: 'query' | 'scene' | 'performer' | 'studio' | 'tag'
  id: string // the text itself for a query
  label: string
}

const KEY = 'flix.search.recent'
export const MAX_RECENTS = 8
const KINDS = ['query', 'scene', 'performer', 'studio', 'tag']

export const parseRecents = (raw: unknown): Recent[] =>
  Array.isArray(raw)
    ? raw
        .filter((r): r is Recent => !!r && typeof r === 'object' && KINDS.includes((r as Recent).kind) && typeof (r as Recent).id === 'string' && typeof (r as Recent).label === 'string')
        .slice(0, MAX_RECENTS)
    : []

// newest first, one entry per thing
export const withRecent = (list: Recent[], r: Recent): Recent[] => [r, ...list.filter((x) => !(x.kind === r.kind && x.id === r.id))].slice(0, MAX_RECENTS)

// Writes go straight to storage, not through the hook's state: the phone's search box unmounts
// in the same tick as a search (the header closes it), and a state update queued on a component
// that is going away never runs.
const update = (change: (list: Recent[]) => Recent[]) => writeStored(KEY, change(readStored(KEY, parseRecents)))

export function useRecents() {
  const [recents] = useStored(KEY, parseRecents)
  return {
    recents,
    add: (r: Recent) => {
      if (!isPrivate()) update((list) => withRecent(list, r))
    },
    remove: (r: Recent) => update((list) => list.filter((x) => !(x.kind === r.kind && x.id === r.id))),
    clear: () => update(() => []),
  }
}
