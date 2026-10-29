import { createFileRoute } from '@tanstack/react-router'
import { parseSceneQuery } from '../lib/query'
import { StudioPage } from '../pages/Studio'

export const Route = createFileRoute('/studio/$id')({ validateSearch: parseSceneQuery, component: StudioPage })
