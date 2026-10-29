import { createFileRoute } from '@tanstack/react-router'
import { parseSceneQuery } from '../lib/query'
import { StationEditor } from '../pages/StationEditor'

export const Route = createFileRoute('/stations_/new')({ validateSearch: parseSceneQuery, component: StationEditor })
