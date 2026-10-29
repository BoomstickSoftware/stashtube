import { createFileRoute } from '@tanstack/react-router'
import { parseSceneQuery } from '../lib/query'
import { Continue } from '../pages/Continue'

export const Route = createFileRoute('/continue')({ validateSearch: parseSceneQuery, component: Continue })
