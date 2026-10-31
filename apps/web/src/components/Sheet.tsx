import clsx from 'clsx'
import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useClickOutside } from '../lib/hooks'

// The one shape for a menu that must never be clipped or hidden by the page: a bottom sheet
// on a phone, a small centred panel with a mouse, portalled to <body>. Esc, a tap outside
// or the caller closes it.
export function Sheet({ title, onClose, children, z = 'z-[75]' }: { title?: ReactNode; onClose: () => void; children: ReactNode; z?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, onClose)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className={clsx('fixed inset-0 bg-black/60 backdrop-blur-sm', z)}>
      <div
        ref={ref}
        role="dialog"
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl ring-1 ring-white/10 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-80 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        {title && <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold">{title}</div>}
        {children}
      </div>
    </div>,
    document.body,
  )
}
