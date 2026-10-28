import clsx from 'clsx'
import { Star } from 'lucide-react'
import { useToast } from '../lib/toast'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'

export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onOutside()
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('keydown', k)
    }
  }, [ref, onOutside, active])
}

// Live result of a CSS media query, e.g. '(pointer: coarse)' for touch screens.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = matchMedia(query)
      m.addEventListener('change', onChange)
      return () => m.removeEventListener('change', onChange)
    },
    () => matchMedia(query).matches,
  )
}

export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// Calls onVisible when the sentinel scrolls near the viewport (infinite scroll).
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
            className={clsx('relative p-0.5', !readOnly && 'cursor-pointer transition-transform hover:scale-110')}
            onMouseEnter={() => !readOnly && setHover(n)}
            onClick={() => onChange?.(value === n ? null : n)}
          >
            <Star size={size} className="text-white/25" strokeWidth={1.5} />
            {fill > 0 && (
              <span className="absolute inset-0.5 overflow-hidden" style={{ width: fill === 1 ? undefined : size / 2 }}>
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
}: {
  children: ReactNode
  onClick?: () => void
  active?: boolean
  variant?: 'ghost' | 'solid' | 'accent' | 'danger'
  className?: string
  title?: string
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
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
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] whitespace-nowrap transition-colors',
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

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={clsx('size-6 animate-spin rounded-full border-2 border-white/20 border-t-accent', className)} />
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="mx-auto my-16 max-w-md rounded-2xl bg-red-500/10 p-6 text-center text-red-300 ring-1 ring-red-500/20">
      {error instanceof Error ? error.message : 'Something went wrong'}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-24 text-center text-muted">{children}</div>
}

export function Avatar({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <div className={clsx('flex items-center justify-center bg-raised font-semibold text-muted', className)}>
        {name.slice(0, 1).toUpperCase()}
      </div>
    )
  }
  return <img src={src} alt={name} loading="lazy" onError={() => setBroken(true)} className={clsx('object-cover', className)} />
}

// One toast at a time, bottom of the screen (above the tab bar on phones); see lib/toast.
export function Toaster() {
  const t = useToast()
  if (!t) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 md:bottom-6">
      <div
        key={t.id}
        role="status"
        className="pointer-events-auto flex max-w-md min-w-0 animate-fade-in items-center gap-3 rounded-full bg-surface py-2 pr-2 pl-4 text-sm shadow-2xl ring-1 ring-line"
      >
        <span className="min-w-0 truncate">{t.text}</span>
        {t.action}
      </div>
    </div>
  )
}
