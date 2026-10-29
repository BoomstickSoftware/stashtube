import { createRootRoute } from '@tanstack/react-router'
import { Layout } from '../components/Layout'

export const Route = createRootRoute({
  component: Layout,
  notFoundComponent: () => <div className="py-24 text-center text-muted">Not found</div>,
})
