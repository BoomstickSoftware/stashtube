import { createFileRoute } from '@tanstack/react-router'
import { parseSceneQuery } from '../lib/query'
import { TagPage } from '../pages/Tag'

export const Route = createFileRoute('/tag/$id')({ validateSearch: parseSceneQuery, component: TagPage })
