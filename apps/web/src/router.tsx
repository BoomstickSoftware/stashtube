import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { Layout } from './components/Layout'
import { parseSceneQuery } from './lib/query'
import type { StationSearch } from './lib/station'
import { Browse } from './pages/Browse'
import { Cleanup } from './pages/Cleanup'
import { Continue } from './pages/Continue'
import { Performers, Studios, Tags } from './pages/Directories'
import { History, Stats } from './pages/History'
import { Home } from './pages/Home'
import { PerformerPage } from './pages/Performer'
import { PlaylistPage, Playlists } from './pages/Playlists'
import { ScenePage } from './pages/Scene'
import { Settings } from './pages/Settings'
import { Station } from './pages/Station'
import { Stations } from './pages/Stations'
import { StudioPage } from './pages/Studio'
import { TagPage } from './pages/Tag'

const root = createRootRoute({ component: Layout, notFoundComponent: () => <div className="py-24 text-center text-muted">Not found</div> })

const routeTree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: '/', component: Home }),
  createRoute({ getParentRoute: () => root, path: '/browse', validateSearch: parseSceneQuery, component: Browse }),
  createRoute({ getParentRoute: () => root, path: '/continue', validateSearch: parseSceneQuery, component: Continue }),
  createRoute({ getParentRoute: () => root, path: '/history', component: History }),
  createRoute({ getParentRoute: () => root, path: '/stats', component: Stats }),
  createRoute({
    getParentRoute: () => root, path: '/scene/$id',
    // play=1: the link was a Play button (or up next), so start even if videos open paused
    validateSearch: (s: Record<string, unknown>): { playlist?: number; t?: number; play?: boolean } => ({
      playlist: Number(s.playlist) > 0 ? Number(s.playlist) : undefined,
      t: Number(s.t) > 0 ? Number(s.t) : undefined,
      play: s.play === true || s.play === 1 || s.play === '1' || undefined,
    }),
    component: ScenePage,
  }),
  createRoute({
    getParentRoute: () => root, path: '/performers',
    validateSearch: (s: Record<string, unknown>): { q?: string; sort?: string; favorites?: boolean } => ({
      q: typeof s.q === 'string' ? s.q : undefined,
      sort: typeof s.sort === 'string' ? s.sort : undefined,
      favorites: s.favorites === true || s.favorites === '1' ? true : undefined,
    }),
    component: Performers,
  }),
  createRoute({ getParentRoute: () => root, path: '/performer/$id', validateSearch: parseSceneQuery, component: PerformerPage }),
  createRoute({ getParentRoute: () => root, path: '/studios', component: Studios }),
  createRoute({ getParentRoute: () => root, path: '/studio/$id', validateSearch: parseSceneQuery, component: StudioPage }),
  createRoute({ getParentRoute: () => root, path: '/tags', component: Tags }),
  createRoute({ getParentRoute: () => root, path: '/tag/$id', validateSearch: parseSceneQuery, component: TagPage }),
  createRoute({ getParentRoute: () => root, path: '/playlists', component: Playlists }),
  createRoute({ getParentRoute: () => root, path: '/playlist/$id', component: PlaylistPage }),
  createRoute({ getParentRoute: () => root, path: '/settings', component: Settings }),
  createRoute({ getParentRoute: () => root, path: '/cleanup', validateSearch: parseSceneQuery, component: Cleanup }),
  createRoute({ getParentRoute: () => root, path: '/stations', component: Stations }),
  createRoute({
    getParentRoute: () => root, path: '/station',
    // a filter set, or from=<scene id> to drift through related videos
    validateSearch: (s: Record<string, unknown>): StationSearch => ({
      ...parseSceneQuery(s),
      from: typeof s.from === 'string' || typeof s.from === 'number' ? String(s.from) : undefined,
      id: Number(s.id) > 0 ? Number(s.id) : undefined,
    }),
    component: Station,
  }),
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
