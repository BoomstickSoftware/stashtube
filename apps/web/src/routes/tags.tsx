import { createFileRoute } from '@tanstack/react-router'
import { Tags } from '../pages/Directories'

export const Route = createFileRoute('/tags')({ component: Tags })
