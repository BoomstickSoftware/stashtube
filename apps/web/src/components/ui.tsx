import clsx from 'clsx'
import { Star } from 'lucide-react'
import { dismissToast, useToasts } from '../lib/toast'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { sized, srcSet } from '@flix/shared'
import { describeError, queryClient } from '../lib/api/client'

// An on/off control. `size` md is the default; sm sits inline with small text.
export function Switch({ on, onChange, disabled, size = 'md', className }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; size?: 'sm' | 'md'; className?: string }) {
  const sm = size === 'sm'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={clsx('relative shrink-0 rounded-full transition-colors', sm ? 'h-5 w-9' : 'h-6 w-11', on ? 'bg-accent' : 'bg-line', className)}
    >
      <span className={clsx('absolute top-0.5 rounded-full bg-white transition-all', sm ? 'size-4' : 'size-5', on ? (sm ? 'left-4.5' : 'left-5.5') : 'left-0.5')} />
    </button>
  )
}

export function Sentinel({ onVisible, disabled }: { onVisible: () => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (disabled || !ref.current) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && onVisible(), { rootMargin: '800px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [onVisible, disabled])
  return <div ref={ref} className="h-px" />
}

export function Stars({
  value,
  onChange,
  size = 18,
  readOnly,
}: {
  value: number | null
  onChange?: (v: number | null) => void
  size?: number
  readOnly?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0
  return (
    <div className="flex items-center" onMouseLeave={() => setHover(null)} role={readOnly ? undefined : 'radiogroup'}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = shown >= n ? 1 : shown >= n - 0.5 ? 0.5 : 0
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={clsx('relative p-0.5 touch:p-2.5', !readOnly && 'cursor-pointer transition-transform hover:scale-110')}
            onMouseEnter={() => !readOnly && setHover(n)}
            onClick={() => onChange?.(value === n ? null : n)}
          >
            <Star size={size} className="text-white/25" strokeWidth={1.5} />
            {/* the fill's inset matches the button's padding, or it sits up and left of its outline */}
            {fill > 0 && (
              <span className="absolute inset-0.5 overflow-hidden touch:inset-2.5" style={{ width: fill === 1 ? undefined : size / 2 }}>
                <Star size={size} className="fill-star text-star" strokeWidth={1.5} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Button({
  children,
  onClick,
  active,
  variant = 'ghost',
  className,
  title,
  disabled,
  type = 'button',
  'aria-expanded': expanded,
}: {
  children: ReactNode
  onClick?: () => void
  active?: boolean
  variant?: 'ghost' | 'solid' | 'accent' | 'danger'
  className?: string
  title?: string
  disabled?: boolean
  type?: 'button' | 'submit'
  'aria-expanded'?: boolean // for a disclosure button (About, Links)
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      aria-expanded={expanded}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50',
        variant === 'ghost' && (active ? 'bg-white text-black' : 'bg-raised text-fg hover:bg-line'),
        variant === 'solid' && 'bg-white text-black hover:bg-white/85',
        variant === 'accent' && 'bg-accent text-white hover:bg-accent-hover',
        variant === 'danger' && 'bg-raised text-red-400 hover:bg-red-500/15',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Chip({
  children,
  onClick,
  tone = 'default',
  className,
}: {
  children: ReactNode
  onClick?: () => void
  tone?: 'default' | 'include' | 'exclude' | 'active'
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] whitespace-nowrap transition-colors touch:min-h-11',
        tone === 'default' && 'bg-raised text-fg/90 hover:bg-line',
        tone === 'include' && 'bg-accent/15 text-accent ring-1 ring-accent/40 hover:bg-accent/25',
        tone === 'exclude' && 'bg-red-500/10 text-red-400 line-through decoration-red-400/60 ring-1 ring-red-500/30 hover:bg-red-500/20',
        tone === 'active' && 'bg-white text-black',
        className,
      )}
    >
      {children}
    </button>
  )
}

// A loading placeholder the size of what it stands for. `bone` for an element that is one;
// `Bone` for a block in a skeleton. Pulses, still under reduced motion. The skeleton's root
// carries `role="status" aria-label="Loading"` and the bones are `aria-hidden`.
export const bone = 'animate-pulse rounded-md bg-raised motion-reduce:animate-none'
export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={clsx(bone, className)} />
}

// The button in a toast that takes the action back (lib/toast). Reversible actions get this
// instead of a confirm dialog.
export function UndoButton({ onClick, label = 'Undo' }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="min-h-9 shrink-0 rounded-full bg-raised px-3 text-xs font-semibold hover:bg-line">
      {label}
    </button>
  )
}

// A round button that is only an icon: 36 px with a mouse, 44 px under a finger. `label` is
// both its tooltip and its name for a screen reader.
export function IconButton({
  label,
  onClick,
  children,
  className,
  disabled,
  tone = 'muted',
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  className?: string
  disabled?: boolean
  tone?: 'muted' | 'fg' | 'danger'
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-raised disabled:opacity-30 touch:size-11',
        tone === 'muted' && 'text-muted hover:text-fg',
        tone === 'fg' && 'text-fg',
        tone === 'danger' && 'text-danger hover:bg-red-500/15',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={clsx('size-6 animate-spin rounded-full border-2 border-white/20 border-t-accent', className)} />
  )
}

// What went wrong in words a person can act on (describeError: a Stash 502, no network, a
// timeout), the raw message under it when it was reworded. "Try again" refetches whatever
// failed on the page (the installed app has no reload button). A 401 is handled upstream: the
// client raises `flix:login-required` and the login sheet opens over this box.
export function ErrorBox({ error }: { error: unknown }) {
  const [busy, setBusy] = useState(false)
  const retry = () => {
    setBusy(true)
    queryClient.refetchQueries({ type: 'active', predicate: (q) => q.state.status === 'error' }).finally(() => setBusy(false))
  }
  const { text, detail } = describeError(error)
  return (
    <div className="mx-auto my-16 max-w-md rounded-2xl bg-red-500/10 p-6 text-center text-red-300 ring-1 ring-red-500/20">
      {text}
      {detail && <div className="mt-2 text-xs text-red-300/70">{detail}</div>}
      <div>
        <button onClick={retry} disabled={busy} className="mt-4 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-fg hover:bg-white/20 disabled:opacity-50">
          {busy ? 'Trying…' : 'Try again'}
        </button>
      </div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-24 text-center text-muted">{children}</div>
}

// `sizes` (how wide it shows) lets the browser pick a resized copy; without it, a small one.
export function Avatar({ src, name, className, sizes }: { src?: string | null; name: string; className?: string; sizes?: string }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <div className={clsx('flex items-center justify-center bg-raised font-semibold text-muted', className)}>
        {name.slice(0, 1).toUpperCase()}
      </div>
    )
  }
  return (
    <img
      src={sized(src, 320)}
      srcSet={sizes ? srcSet(src) : undefined}
      sizes={sizes}
      alt={name}
      loading="lazy"
      onError={() => setBroken(true)} className={clsx('object-cover', className)}
    />
  )
}

// Toasts stack at the bottom of the screen, above the tab bar on a phone and above the docked
// mini-player when there is one (`--dock-h`, set by the dock); a tap on an action dismisses its
// toast. See lib/toast.
export function Toaster() {
  const toasts = useToasts()
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--dock-h,0px)+0.75rem)] z-(--z-toast) flex flex-col items-center gap-2 px-4 lg:bottom-[calc(var(--dock-h,0px)+1.5rem)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={(e) => (e.target as HTMLElement).closest('button, a') && dismissToast(t.id)}
          className="pointer-events-auto flex max-w-md min-w-0 animate-toast-in items-center gap-3 rounded-full bg-raised py-1.5 pr-1.5 pl-4 text-sm shadow-2xl ring-1 ring-white/10"
        >
          <span className="min-w-0 truncate py-1">{t.text}</span>
          {t.action}
        </div>
      ))}
    </div>
  )
}
