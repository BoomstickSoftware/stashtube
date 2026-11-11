import { createFileRoute } from '@tanstack/react-router'
import { ReelPage } from '../pages/Reels'

export const Route = createFileRoute('/reel/$id')({ component: ReelPage })
