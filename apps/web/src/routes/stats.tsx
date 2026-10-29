import { createFileRoute } from '@tanstack/react-router'
import { Stats } from '../pages/History'

export const Route = createFileRoute('/stats')({ component: Stats })
