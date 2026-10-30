import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// the BFF the dev server proxies to; FLIX_SERVER=http://flix.lan drives the UI against prod (reads only:
// the check scripts block the writes)
const server = process.env.FLIX_SERVER ?? 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  // One copy of React Query for the app and the persist client, or the client's provider
  // and the app's hooks see different contexts ("No QueryClient set").
  resolve: { dedupe: ['@tanstack/react-query'] },
  server: {
    proxy: { '/api': server, '/media': server },
  },
})
