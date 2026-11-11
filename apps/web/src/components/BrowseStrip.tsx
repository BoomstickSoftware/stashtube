import { Link, useRouterState } from '@tanstack/react-router'
import clsx from 'clsx'
import { useEffect } from 'react'
import { BROWSE_SECTION_KEY, browseSections as sections } from '../lib/browse'
import { writeStored } from '../lib/storage'
import { useReelsEnabled } from '../lib/api'

export function BrowseStrip({ className }: { className?: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const reels = useReelsEnabled()
  useEffect(() => {
    if (sections.some(([to]) => to === path)) writeStored(BROWSE_SECTION_KEY, path)
  }, [path])
  return (
    <nav aria-label="Browse" className={clsx('no-scrollbar -mx-4 mb-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      {sections.map(([to, label]) => (
        <Link
          key={to}
          to={to}
          className="shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap text-muted transition-colors hover:text-fg touch:min-h-11 touch:content-center"
          activeProps={{ className: '!text-black bg-white hover:!text-black', 'aria-current': 'page' }}
        >
          {label}
        </Link>
      ))}
      {reels && (
        <Link
          to="/reels"
          className="shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap text-muted transition-colors hover:text-fg touch:min-h-11 touch:content-center"
          activeProps={{ className: '!text-black bg-white hover:!text-black', 'aria-current': 'page' }}
        >
          Reels
        </Link>
      )}
    </nav>
  )
}
