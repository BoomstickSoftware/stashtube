import { createRouter } from '@tanstack/react-router'
import { PageError } from './components/ErrorBoundary'
import { log } from './lib/diag'
import { routeTree } from './routeTree.gen'

// Routes live in src/routes (one file per path; the router plugin builds routeTree.gen.ts
// and splits each page into its own chunk, loaded on intent).
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  // a quick cross-fade between pages where the browser has view transitions (iOS Safari 18+);
  // elsewhere the router just navigates. Timing and the reduced-motion rule are in index.css.
  defaultViewTransition: true,
  // a page that throws while rendering shows this inside the shell (header and tabs stay usable)
  defaultErrorComponent: ({ error, reset }) => <PageError error={error} reset={reset} />,
  defaultOnCatch: (error) => log(`render error on ${window.location.pathname}: ${error instanceof Error ? error.message : String(error)}`),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
