import { Component, type ErrorInfo, type ReactNode } from 'react'
import { log } from '../lib/diag'

// A render error must never leave a blank screen: the installed iPhone app has no reload button.
// `fallback` gets the error and a reset; `onError` lets the owner clean up (the player host closes
// the video, so one bad player cannot take the page with it).
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode; onError?: (error: Error) => void; name: string },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    log(`render error in ${this.props.name}: ${error.message}${info.componentStack?.split('\n').slice(0, 4).join(' ') ?? ''}`)
    this.props.onError?.(error)
  }
  reset = () => this.setState({ error: null })
  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children
  }
}

// The page-level fallback, also the router's default error component.
export function PageError({ error, reset }: { error: unknown; reset?: () => void }) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div role="alert" className="mx-auto my-16 max-w-md rounded-2xl bg-red-500/10 p-6 text-center text-red-300 ring-1 ring-red-500/20">
      This page hit a problem.
      <div className="mt-2 text-xs break-words text-red-300/70">{message}</div>
      <div className="mt-4 flex justify-center gap-2">
        {reset && (
          <button onClick={reset} className="min-h-11 rounded-full bg-white/10 px-4 text-sm font-semibold text-fg hover:bg-white/20">
            Try again
          </button>
        )}
        <button onClick={() => window.location.reload()} className="min-h-11 rounded-full bg-white/10 px-4 text-sm font-semibold text-fg hover:bg-white/20">
          Reload
        </button>
        <a href="/" className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-black">
          Home
        </a>
      </div>
    </div>
  )
}
