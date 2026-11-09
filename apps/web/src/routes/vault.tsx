import { createFileRoute } from '@tanstack/react-router'
import { parseSceneQuery } from '../lib/query'
import { Vault } from '../pages/Vault'

export const Route = createFileRoute('/vault')({ validateSearch: parseSceneQuery, component: Vault })
