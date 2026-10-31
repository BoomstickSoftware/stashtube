import { createRootRoute, Link } from '@tanstack/react-router'
import { Layout } from '../components/Layout'

export const Route = createRootRoute({
  component: Layout,
  notFoundComponent: () => (
    <div className="py-24 text-center">
      <div className="text-xl font-bold">This page doesn’t exist.</div>
      <p className="mt-2 text-muted">
        Check the address, or go{' '}
        <Link to="/" className="text-accent hover:underline">
          Home
        </Link>{' '}
        and use the search above.
      </p>
    </div>
  ),
})
