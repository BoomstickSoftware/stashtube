import { useState } from 'react'
import { authApi } from '../lib/api'
import { Button } from '../components/ui'

export function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form
        className="w-full max-w-sm rounded-3xl bg-surface p-8 ring-1 ring-line"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            await authApi.login(password)
            onDone()
          } catch {
            setError('Wrong password')
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="mb-6 text-2xl font-black">flix</div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl bg-raised px-4 py-3 outline-none focus:ring-2 focus:ring-accent"
        />
        {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
        <Button type="submit" variant="accent" disabled={busy} className="mt-5 w-full justify-center">
          Sign in
        </Button>
      </form>
    </div>
  )
}
