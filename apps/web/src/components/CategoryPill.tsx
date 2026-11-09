import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { categoryStyle } from '../lib/color'

// A category as a coloured pill (its colour follows its name, lib/color). With a library id it
// opens the category's page; StashDB categories the library does not have are plain.
export function CategoryPill({ name, libraryId, className }: { name: string; libraryId?: string | null; className?: string }) {
  const cls = clsx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] leading-tight font-medium whitespace-nowrap', className)
  if (!libraryId)
    return (
      <span className={cls} style={categoryStyle(name)}>
        {name}
      </span>
    )
  return (
    <Link to="/tag/$id" params={{ id: libraryId }} className={clsx(cls, 'hover:brightness-125 touch:min-h-11 touch:px-3')} style={categoryStyle(name)} title={`Open ${name}`}>
      {name}
    </Link>
  )
}
