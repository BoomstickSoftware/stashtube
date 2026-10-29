import { createFileRoute } from '@tanstack/react-router'
import { Studios } from '../pages/Directories'

export const Route = createFileRoute('/studios')({ component: Studios })
