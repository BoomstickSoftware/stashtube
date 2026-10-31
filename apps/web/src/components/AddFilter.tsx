import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { Check, Plus } from 'lucide-react'
import { type FilterKind, filterCount, getBrowseFilters, hasFilter, toggleBrowseFilter, useBrowseFilters } from '../lib/filters'
import { showToast } from '../lib/toast'

// "+" next to a performer, studio or tag: adds it to the Browse filters (all must match) and
// offers to open them. A check shows it is already in; clicking again takes it out.
export function AddFilterButton({
  kind,
  id,
  name,
  className,
  variant = 'icon',
}: {
  kind: FilterKind
  id: string
  name: string
  className?: string
  // button: a labelled pill for page headers; chip: a small labelled chip ("Filter") for touch
  // screens, where a bare "+" reads as "follow" and `title` never shows
  variant?: 'icon' | 'button' | 'chip'
}) {
  const filters = useBrowseFilters()
  const on = hasFilter(filters, kind, id)
  const icon = variant === 'icon' ? 13 : variant === 'chip' ? 12 : 16
  return (
    <button
      type="button"
      title={on ? `Remove ${name} from Browse filters` : `Add ${name} to Browse filters`}
      aria-label={on ? `Remove ${name} from Browse filters` : `Add ${name} to Browse filters`}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const added = toggleBrowseFilter(kind, id)
        const n = filterCount(getBrowseFilters())
        showToast(
          added ? `Added ${name} to filters` : `Removed ${name} from filters`,
          n > 0 && (
            <Link
              to="/browse"
              search={getBrowseFilters()}
              className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent/80"
            >
              Browse {n} filter{n === 1 ? '' : 's'}
            </Link>
          ),
        )
      }}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors',
        variant === 'icon' && 'size-6 ring-1 touch:size-10',
        variant === 'button' && 'gap-2 px-4 py-2 text-sm font-medium',
        variant === 'chip' && 'gap-1 px-2.5 py-1 text-xs font-medium ring-1 touch:min-h-11',
        on
          ? 'bg-accent text-white ring-accent'
          : variant === 'button'
            ? 'bg-raised text-fg hover:bg-line'
            : 'bg-raised text-muted ring-line hover:bg-line hover:text-fg',
        className,
      )}
    >
      {on ? <Check size={icon} strokeWidth={3} /> : <Plus size={icon + 1} strokeWidth={2.5} />}
      {variant === 'button' && (on ? 'In filters' : 'Add to filters')}
      {variant === 'chip' && (on ? 'In filters' : 'Filter')}
    </button>
  )
}
