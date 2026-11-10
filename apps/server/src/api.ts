// The API: one Hono sub-app per domain (routes/), mounted here. Hono matches in registration
// order, and a literal path must come before the `:id` route it would otherwise fall into
// (`/scenes/facets` before `/scenes/:id`, `/rows/order` before `/rows/:id`, `/tags/tiles` before
// `/tags/:id`, `/stations/resume` and `/stations/order` before `/stations/:id`): each such pair
// lives in one file, in that order, so the order of the mounts below does not matter.
import { Hono } from 'hono'
import { curation } from './routes/curation.ts'
import { discover } from './routes/discover.ts'
import { history } from './routes/history.ts'
import { home } from './routes/home.ts'
import { people } from './routes/people.ts'
import { playlists } from './routes/playlists.ts'
import { scenes } from './routes/scenes.ts'
import { settings } from './routes/settings.ts'
import { stations } from './routes/stations.ts'
import { whisparrRoutes } from './routes/whisparr.ts'

export const api = new Hono()

for (const routes of [scenes, home, stations, history, people, settings, playlists, curation, whisparrRoutes, discover]) api.route('/', routes)
