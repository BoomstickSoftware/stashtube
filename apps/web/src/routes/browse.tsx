import { createFileRoute } from '@tanstack/react-router'
import { parseSceneQuery } from '../lib/query'
import { Browse } from '../pages/Browse'

export const Route = createFileRoute('/browse')({ validateSearch: parseSceneQuery, component: Browse })
