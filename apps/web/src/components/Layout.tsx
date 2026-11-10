import type { JSX } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useRouter, useRouterState } from '@tanstack/react-router'
import clsx from 'clsx'
import { ChevronLeft, Clapperboard, Compass, Home, Radio, Search, Settings, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { authApi, useContinueCount, useSettings } from '../lib/api'
import { filterCount, useBrowseFilters } from '../lib/filters'
import { useMediaQuery } from '../lib/hooks'
import { useIsPrivate } from '../lib/privacy'
import { asBool, useStored } from '../lib/storage'
import { Login } from '../pages/Login'
import { NowPlayingHost } from './NowPlaying'
import { PinLock } from './PinLock'
import { PrivacyMenu } from './PrivacyMenu'
import { SearchBox } from './SearchBox'
import { ShortcutsOverlay } from './Shortcuts'
import { Spinner, Toaster } from './ui'

// Five tabs on phone and desktop alike (decisions/five-tab-navigation, 2026-11-09). Each owns the
// paths under it, so a tab stays lit on its sub-pages: Browse's strip (videos, performers, studios,
// categories) and their entity pages, You's Continue, History, Stats, playlists and Vault.
// _Until 2026-11-09_ the phone had seven tabs and Discover, Stations and Vault as header icons.
const nav = [
  { to: '/', label: 'Home', icon: Home, owns: [] as string[] },
  { to: '/browse', label: 'Browse', icon: Clapperboard, owns: ['/browse', '/performers', '/studios', '/tags', '/performer/', '/studio/', '/tag/'] },
  { to: '/stations', label: 'Stations', icon: Radio, owns: ['/stations', '/station'] },
  { to: '/discover', label: 'Discover', icon: Compass, owns: ['/discover'] },
  { to: '/you', label: 'You', icon: UserRound, owns: ['/you', '/continue', '/history', '/stats', '/playlists', '/playlist/', '/vault'] },
] as const
const tabOf = (path: string) =>
  path === '/' ? '/' : nav.find((n) => n.owns.some((o) => (o.endsWith('/') ? path.startsWith(o) : path === o || path.startsWith(`${o}/`))))?.to

export function Layout(): JSX.Element {
  const session = useQuery({ queryKey: ['session'], queryFn: authApi.session, staleTime: Infinity })
  const [mobileSearch, setMobileSearch] = useState(false)
  const { data: unfinished = 0 } = useContinueCount()
  const stacked = filterCount(useBrowseFilters()) // performers, studios and tags added with "+"
  const path = useRouterState({ select: (s) => s.location.pathname })
  const tab = tabOf(path)
  usePanicKey()
  // Installed on a home screen there is no browser chrome, so pages below the top level get
  // a Back button in the header.
  const standalone = useMediaQuery('(display-mode: standalone)')
  // Discreet: pictures blurred until hovered (index.css), remembered per browser.
  const [discreet] = useStored('flix.discreet', asBool(false))
  useEffect(() => {
    document.documentElement.classList.toggle('discreet', discreet)
  }, [discreet])
  // Private session: nothing watched this visit is recorded (lib/privacy.ts). Ends with the tab.
  const priv = useIsPrivate()
  const router = useRouter()
  const atStart = useRouterState({ select: (s) => !(s.location.state.__TSR_index > 0) }) // first entry of this session
  const canGoBack = standalone && path !== '/' && !atStart
  const root = useRef<HTMLDivElement>(null) // the now-playing host positions the player within it
  const pill = 'ml-1.5 rounded-full bg-accent px-1.5 text-[11px] leading-[18px] font-semibold text-white tabular-nums'
  const badge = (to: string) =>
    to === '/you' && unfinished > 0 ? (
      <span className={pill}>{unfinished}</span>
    ) : to === '/browse' && stacked > 0 ? (
      <span className={pill} title={`${stacked} stacked filter${stacked === 1 ? '' : 's'}`}>
        {stacked}
      </span>
    ) : null

  useEffect(() => {
    const h = () => session.refetch()
    window.addEventListener('flix:login-required', h)
    return () => window.removeEventListener('flix:login-required', h)
  }, [session])

  if (session.isLoading) return <Spinner className="mx-auto mt-[40vh]" />
  if (session.data?.required && !session.data.authenticated) return <Login onDone={() => session.refetch()} />

  return (
    // overflow-x-clip: nothing can widen the page and let it pan sideways (clip, unlike
    // hidden, keeps the sticky header working)
    <div ref={root} className="relative min-h-dvh overflow-x-clip pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <header className={clsx('sticky top-0 z-40 h-16 border-b border-white/5 bg-bg/85 backdrop-blur-xl', priv && 'border-t-2 border-t-violet-400')}>
        {/* no gap on phones: the 44 px icons carry their own spacing */}
        <div className="mx-auto flex h-full max-w-[1920px] items-center gap-0 px-4 sm:gap-4 sm:px-6">
          {canGoBack && (
            <button onClick={() => router.history.back()} className="-ml-2 rounded-full p-2 text-muted hover:bg-raised hover:text-fg touch:p-3 lg:hidden" aria-label="Back">
              <ChevronLeft size={22} />
            </button>
          )}
          <Link to="/" className="flex shrink-0 items-center gap-1.5 text-xl font-black tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent">
              <svg viewBox="0 0 16 16" className="ml-0.5 size-3.5 fill-white">
                <path d="M3 1.5v13L14 8z" />
              </svg>
            </span>
            flix
          </Link>
          {priv && <span className="hidden rounded-full bg-violet-400/15 px-2 text-[11px] leading-5 font-semibold text-violet-300 sm:inline">Private</span>}
          <nav className="hidden items-center gap-1 lg:flex">
            {nav.slice(1).map((n) => (
              <Link
                key={n.to}
                to={n.to}
                aria-current={tab === n.to ? 'page' : undefined}
                className={clsx('rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg', tab === n.to && '!text-fg bg-raised')}
              >
                {n.label}
                {badge(n.to)}
              </Link>
            ))}
          </nav>
          <SearchBox className="ml-auto hidden w-full max-w-md lg:block" />
          <button onClick={() => setMobileSearch((v) => !v)} className="ml-auto rounded-full p-2 text-muted hover:bg-raised hover:text-fg touch:p-3 lg:hidden" aria-label="Search">
            <Search size={20} />
          </button>
          <PrivacyMenu />
          <Link to="/settings" className="rounded-full p-2 text-muted hover:bg-raised hover:text-fg touch:p-3" activeProps={{ className: '!text-fg' }} aria-label="Settings">
            <Settings size={20} />
          </Link>
        </div>
        {mobileSearch && (
          <div className="border-b border-white/5 bg-bg px-4 py-2 lg:hidden">
            <SearchBox autoFocus onDone={() => setMobileSearch(false)} />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1920px] px-4 py-6 sm:px-6">
        <Outlet />
        <Toaster />
        <ShortcutsOverlay />
        <PinLock />
      </main>
      <NowPlayingHost root={root} />

      {/* mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/5 bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            aria-current={tab === n.to ? 'page' : undefined}
            className={clsx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted', tab === n.to && '!text-accent')}
          >
            <span className="relative">
                  <n.icon size={22} className={clsx(tab === n.to && 'fill-accent/20')} />
                  {n.to === '/you' && unfinished > 0 && <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-accent" />}
                  {n.to === '/browse' && stacked > 0 && (
                    <span
                      title={`${stacked} stacked filter${stacked === 1 ? '' : 's'}`}
                      className="absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums"
                    >
                      {stacked}
                    </span>
                  )}
            </span>
            {n.label}
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
