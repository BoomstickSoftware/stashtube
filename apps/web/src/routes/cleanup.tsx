import { createFileRoute } from '@tanstack/react-router'
import { parseSceneQuery } from '../lib/query'
import { Cleanup } from '../pages/Cleanup'

export const Route = createFileRoute('/cleanup')({ validateSearch: parseSceneQuery, component: Cleanup })
