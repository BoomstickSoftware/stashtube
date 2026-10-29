import { createFileRoute } from '@tanstack/react-router'
import { Stations } from '../pages/Stations'

export const Route = createFileRoute('/stations')({ component: Stations })
