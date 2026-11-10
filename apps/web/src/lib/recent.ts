// Where you just were, for the Stations tab's "Start from" cards (decisions/five-tab-navigation):
// the list (its filters, as SceneBrowser ran them) and the video last opened. A station from either
// is one tap there, in place of the Station chips lists and the video page used to carry.
import type { SceneQuery } from '@flix/shared'
import { useStored, writeStored } from './storage'

const LIST = 'flix.lastList'
const SCENE = 'flix.lastScene'

export interface LastScene {
  id: string
  title: string
}

export const rememberList = (q: SceneQuery) => writeStored(LIST, q)
export const rememberScene = (s: LastScene) => writeStored(SCENE, s)

const asQuery = (raw: unknown): SceneQuery | null => (raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as SceneQuery) : null)
const asScene = (raw: unknown): LastScene | null => {
  const s = raw as Partial<LastScene> | undefined
  return s && typeof s.id === 'string' && typeof s.title === 'string' ? { id: s.id, title: s.title } : null
}
export const useLastList = () => useStored(LIST, asQuery)[0]
export const useLastScene = () => useStored(SCENE, asScene)[0]
