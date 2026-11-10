import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { EyeOff, Ghost, Lock, Shield } from 'lucide-react'
import { useRef, useState } from 'react'
import { useClickOutside } from '../lib/hooks'
import { lock, usePinSettings } from '../lib/lock'
import { setPrivate, useIsPrivate } from '../lib/privacy'
import { asBool, useStored } from '../lib/storage'
import { showToast } from '../lib/toast'
import { Switch } from './ui'

// The header's one privacy button (decisions/five-tab-navigation): Discreet, Private session and
// Lock now in a small menu, in place of two header toggles. The button shows what is on: the ghost
// (violet) for a private session, the crossed eye for Discreet, a shield otherwise.
export function PrivacyMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  const [discreet, setDiscreet] = useStored('flix.discreet', asBool(false))
  const priv = useIsPrivate()
  const pin = usePinSettings()
  const Icon = priv ? Ghost : discreet ? EyeOff : Shield
  const row = 'flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-white/5 touch:min-h-12'
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Privacy"
        title="Privacy: Discreet, Private session, Lock"
        className={clsx('rounded-full p-2 hover:bg-raised hover:text-fg touch:p-3', priv ? 'text-violet-300' : discreet ? 'text-accent' : 'text-muted')}
      >
        <Icon size={20} />
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl bg-surface py-1 shadow-2xl ring-1 ring-white/10">
          <label className={row}>
            <EyeOff size={18} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Discreet</span>
              <span className="block text-xs text-muted">Pictures stay blurred until touched</span>
            </span>
            <Switch
              on={discreet}
              onChange={(v) => {
                setDiscreet(v)
                if (v) showToast('Discreet: pictures stay blurred until you touch them')
              }}
            />
          </label>
          <label className={row}>
            <Ghost size={18} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Private session</span>
              <span className="block text-xs text-muted">Record nothing you watch until you close flix</span>
            </span>
            <Switch
              on={priv}
              onChange={(v) => {
                setPrivate(v)
                if (v) showToast('Private session: nothing you watch is recorded until you turn it off')
              }}
            />
          </label>
          {pin ? (
            <button
              className={row}
              onClick={() => {
                setOpen(false)
                lock()
              }}
            >
              <Lock size={18} className="shrink-0 text-muted" />
              <span className="font-medium">Lock now</span>
            </button>
          ) : (
            <Link to="/settings" hash="privacy" onClick={() => setOpen(false)} className={clsx(row, 'text-muted')}>
              <Lock size={18} className="shrink-0" />
              <span>Set a PIN to lock flix…</span>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
