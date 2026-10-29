import { createFileRoute } from '@tanstack/react-router'
import { parseSceneQuery } from '../lib/query'
import { StationEditor } from '../pages/StationEditor'

export const Route = createFileRoute('/stations_/$id/edit')({ validateSearch: parseSceneQuery, component: StationEditor })
