import { createFileRoute } from '@tanstack/react-router'
import { PlaylistPage } from '../pages/Playlists'

export const Route = createFileRoute('/playlist/$id')({ component: PlaylistPage })
