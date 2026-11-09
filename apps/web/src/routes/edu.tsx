import { createFileRoute, redirect } from '@tanstack/react-router'

// The Edu section became the Vault on 2026-11-09 (wiki features/vault); old links land there.
export const Route = createFileRoute('/edu')({
  beforeLoad: () => {
    throw redirect({ to: '/vault', replace: true })
  },
})
