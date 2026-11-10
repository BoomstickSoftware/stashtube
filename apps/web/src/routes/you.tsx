import { createFileRoute } from '@tanstack/react-router'
import { You } from '../pages/You'

export const Route = createFileRoute('/you')({ component: You })
