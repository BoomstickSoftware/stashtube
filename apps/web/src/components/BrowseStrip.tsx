import { Link } from '@tanstack/react-router'
import clsx from 'clsx'

// Browse's sections (decisions/five-tab-navigation): videos and the three directories share the
// Browse tab, switched by this strip at the top of each. It scrolls sideways on a narrow phone.
const sections = [
  ['/browse', 'Videos'],
  ['/performers', 'Performers'],
  ['/studios', 'Studios'],
  ['/tags', 'Categories'],
] as const

export function BrowseStrip({ className }: { className?: string }) {
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
    </nav>
  )
}
