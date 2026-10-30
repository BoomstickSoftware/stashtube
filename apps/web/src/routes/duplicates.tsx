import { createFileRoute } from '@tanstack/react-router'
import { Duplicates } from '../pages/Duplicates'

export const Route = createFileRoute('/duplicates')({ component: Duplicates })
