import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { PERSIST_MAX_AGE, persistQuery, queryClient } from './lib/api'
import { router } from './router'

// The last home feed, playlists and settings are kept in localStorage, so a cold open (a
// phone waking the tab, a new tab) paints at once and refreshes in the background.
const persister = createAsyncStoragePersister({ storage: safeStorage(), key: 'flix.queries', throttleTime: 2000 })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: 'v1', // bump when cached response shapes change
        dehydrateOptions: { shouldDehydrateQuery: persistQuery },
      }}
    >
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </StrictMode>,
)

// localStorage can be missing or throw (private mode, blocked site data).
function safeStorage(): Storage | undefined {
  try {
    localStorage.getItem('flix.queries')
    return localStorage
  } catch {
    return undefined
  }
}
