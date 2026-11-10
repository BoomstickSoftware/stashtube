import clsx from 'clsx'
import { X } from 'lucide-react'
import { type ReactNode, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useClickOutside, useModal, useSheetDrag } from '../lib/hooks'

// The grabber and the drag-to-dismiss strip at the top of a bottom sheet (phones only). Its
// handlers come from useSheetDrag; the dialogs that build their own panel use it too.
export function SheetGrabber(props: ReturnType<typeof useSheetDrag>) {
  return (
    <div {...props} aria-hidden className="flex touch-none justify-center pt-2 pb-1 sm:hidden">
      <div className="h-1 w-9 rounded-full bg-white/25" />
    </div>
  )
}

// The one shape for a menu or a short form that must never be clipped or hidden by the page: a
// bottom sheet on a phone (it rises, and a drag down on its header dismisses it), a small centred
// panel with a mouse, portalled to <body>. Esc, a tap outside, the close button or the caller
// closes it; the page behind does not scroll and focus comes back to what opened it.
// `size`: menu (a list of actions), form (a field or two and a button, wider with a mouse).
export function Sheet({
  title,
  onClose,
  children,
  z = 'z-(--z-sheet)',
  size = 'menu',
  label,
}: {
  title?: ReactNode
  onClose: () => void
  children: ReactNode
  z?: string
  size?: 'menu' | 'form'
  label?: string // for a sheet without a visible title
}) {
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, onClose)
  useModal(ref, onClose)
  const drag = useSheetDrag(ref, onClose)
  return createPortal(
    <div className={clsx('sheet-scrim fixed inset-0 bg-scrim backdrop-blur-sm', z)}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === 'string' ? title : undefined)}
        tabIndex={-1}
        className={clsx(
          'sheet-panel absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl ring-1 ring-white/10 outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
          size === 'menu' ? 'sm:w-80' : 'sm:w-96',
        )}
      >
        <SheetGrabber {...drag} />
        {title && (
          <div {...drag} className="flex items-center gap-2 border-b border-white/10 py-1 pr-1 pl-4 text-sm font-semibold">
            <div className="min-w-0 flex-1 py-2">{title}</div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/10 hover:text-fg">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
