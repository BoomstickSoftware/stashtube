import type { JSX } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import clsx from 'clsx'
import { Building2, Clapperboard, History, Home, ListVideo, Search, Settings, Tags, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { authApi, useContinueCount, useSettings } from '../lib/api'
import { Login } from '../pages/Login'
import { SearchBox } from './SearchBox'
import { Spinner } from './ui'

const nav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/browse', label: 'Browse', icon: Clapperboard },
  { to: '/continue', label: 'Continue', icon: History },
  { to: '/performers', label: 'Performers', icon: Users },
  { to: '/studios', label: 'Studios', icon: Building2 },
  { to: '/tags', label: 'Categories', icon: Tags },
  { to: '/playlists', label: 'Playlists', icon: ListVideo },
] as const

export function Layout(): JSX.Element {
  const session = useQuery({ queryKey: ['session'], queryFn: authApi.session, staleTime: Infinity })
  const [mobileSearch, setMobileSearch] = useState(false)
  const { data: unfinished = 0 } = useContinueCount()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const watchSection = ['/continue', '/history', '/stats'].includes(path)
  usePanicKey()
  const badge = (to: string) =>
    to === '/continue' && unfinished > 0 ? (
      <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[11px] leading-[18px] font-semibold text-white tabular-nums">{unfinished}</span>
    ) : null

  useEffect(() => {
    const h = () => session.refetch()
    window.addEventListener('flix:login-required', h)
    return () => window.removeEventListener('flix:login-required', h)
  }, [session])

  if (session.isLoading) return <Spinner className="mx-auto mt-[40vh]" />
  if (session.data?.required && !session.data.authenticated) return <Login onDone={() => session.refetch()} />

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-40 h-16 border-b border-white/5 bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-[1920px] items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-1.5 text-xl font-black tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent">
              <svg viewBox="0 0 16 16" className="ml-0.5 size-3.5 fill-white">
                <path d="M3 1.5v13L14 8z" />
              </svg>
            </span>
            flix
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.slice(1).map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={clsx(
                  'rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg',
                  n.to === '/continue' && watchSection && '!text-fg bg-raised',
                )}
                activeProps={{ className: '!text-fg bg-raised' }}
              >
                {n.label}
                {badge(n.to)}
              </Link>
            ))}
          </nav>
          <SearchBox className="ml-auto hidden w-full max-w-md sm:block" />
          <button onClick={() => setMobileSearch((v) => !v)} className="ml-auto p-2 text-muted sm:hidden" aria-label="Search">
            <Search size={20} />
          </button>
          <Link to="/settings" className="rounded-full p-2 text-muted hover:bg-raised hover:text-fg" activeProps={{ className: '!text-fg' }} aria-label="Settings">
            <Settings size={20} />
          </Link>
        </div>
        {mobileSearch && (
          <div className="border-b border-white/5 bg-bg px-4 py-2 sm:hidden">
            <SearchBox onDone={() => setMobileSearch(false)} />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1920px] px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      {/* mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/5 bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            activeOptions={{ exact: n.to === '/' }}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-muted"
            activeProps={{ className: '!text-accent' }}
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <n.icon size={20} className={clsx(isActive && 'fill-accent/20')} />
                  {n.to === '/continue' && unfinished > 0 && <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-accent" />}
                </span>
                {n.label}
              </>
            )}
          </Link>
        ))}
      </nav>
    </div>
  )
}

// Double-tap Esc: stop all playback and leave for the page set in Settings, replacing this
// history entry so Back does not return here.
function usePanicKey() {
  const { data: settings } = useSettings()
  useEffect(() => {
    let last = 0
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const now = Date.now()
      if (now - last < 400) {
        document.querySelectorAll('video').forEach((v) => {
          v.muted = true
          v.pause()
        })
        document.body.style.visibility = 'hidden'
        location.replace(settings?.panicUrl || 'https://www.google.com/')
      }
      last = now
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [settings?.panicUrl])
}
