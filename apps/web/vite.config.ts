import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const server = 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One copy of React Query for the app and the persist client, or the client's provider
  // and the app's hooks see different contexts ("No QueryClient set").
  resolve: { dedupe: ['@tanstack/react-query'] },
  server: {
    proxy: { '/api': server, '/media': server },
  },
})
