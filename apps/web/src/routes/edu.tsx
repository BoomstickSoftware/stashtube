import { createFileRoute } from '@tanstack/react-router'
import { parseSceneQuery } from '../lib/query'
import { Edu } from '../pages/Edu'

export const Route = createFileRoute('/edu')({ validateSearch: parseSceneQuery, component: Edu })
