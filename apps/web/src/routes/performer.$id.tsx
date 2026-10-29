import { createFileRoute } from '@tanstack/react-router'
import { parseSceneQuery } from '../lib/query'
import { PerformerPage } from '../pages/Performer'

export const Route = createFileRoute('/performer/$id')({ validateSearch: parseSceneQuery, component: PerformerPage })
