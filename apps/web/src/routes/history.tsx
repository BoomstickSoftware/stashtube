import { createFileRoute } from '@tanstack/react-router'
import { History } from '../pages/History'

export const Route = createFileRoute('/history')({ component: History })
