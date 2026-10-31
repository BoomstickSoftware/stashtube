import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Every key flix answers to, grouped; shown by `?` anywhere and listed under Settings.
const SHORTCUTS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Anywhere',
    keys: [
      ['/', 'Search'],
      ['?', 'These shortcuts'],
      ['L', 'Lock flix (with a PIN set)'],
      ['Esc Esc', 'Panic: leave flix'],
    ],
  },
  {
    title: 'Playing a video',
    keys: [
      ['Space / k', 'Play / pause'],
      ['← →', '±5 s'],
      ['j / l', '±10 s'],
      ['0–9', 'Jump to %'],
      ['↑ ↓', 'Volume'],
      ['m', 'Mute'],
      ['< >', 'Speed'],
      ['f', 'Fullscreen'],
      ['t', 'Theater'],
      ['i', 'Picture in picture'],
      ['Shift+N', 'Next video'],
      ['b', 'Mark this moment'],
      ['[ ]', 'Previous / next marker'],
    ],
  },
  {
    title: 'On a station',
    keys: [
      ['n / p', 'Next / previous video'],
      ['q', 'The station list'],
      ['Esc', 'Leave the station'],
    ],
  },
]

export function ShortcutList({ compact }: { compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-4' : 'grid gap-6 sm:grid-cols-3'}>
      {SHORTCUTS.map((g) => (
        <section key={g.title}>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">{g.title}</h3>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {g.keys.map(([k, v]) => (
              <div key={k} className="contents">
                <kbd className="self-start justify-self-start rounded bg-raised px-1.5 text-xs leading-5 whitespace-nowrap">{k}</kbd>
                <span className="text-muted">{v}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// `?` opens the list over whatever page is showing; Esc or a click outside closes it.
export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '?') {
        setOpen((v) => !v)
        e.preventDefault()
      } else if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-2xl bg-surface p-5 shadow-2xl ring-1 ring-white/10">
        <div className="mb-4 flex items-center">
          <h2 className="text-lg font-bold">Keyboard shortcuts</h2>
          <button onClick={() => setOpen(false)} className="ml-auto rounded-full p-1.5 text-muted hover:bg-raised hover:text-fg" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <ShortcutList />
      </div>
    </div>,
    document.body,
  )
}
