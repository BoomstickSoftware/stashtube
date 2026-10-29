import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

// Routes live in src/routes (one file per path; the router plugin builds routeTree.gen.ts
// and splits each page into its own chunk, loaded on intent).
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
