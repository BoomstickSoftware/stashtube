import { createFileRoute } from '@tanstack/react-router'
import { BrowseStrip } from '../components/BrowseStrip'
import { ReelsPage } from '../pages/Reels'

export const Route = createFileRoute('/reels')({
  component: () => (
    <>
      <BrowseStrip />
      <ReelsPage />
    </>
  ),
})
