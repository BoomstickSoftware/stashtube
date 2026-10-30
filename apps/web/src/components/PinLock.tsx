import clsx from 'clsx'
import { Delete, LockKeyhole } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { lock, unlock, useLocked, usePinSettings } from '../lib/lock'

const MAX_TRIES = 5
const WAIT_MS = 30_000
const RETURN_AFTER_MS = 3_000 // hidden this long before coming back counts as leaving

// Mounted once in Layout: watches for idleness and for the tab coming back, locks on `L`, and
// draws the lock screen over everything while locked. With no PIN set it renders nothing.
export function PinLock() {
  const settings = usePinSettings()
  const locked = useLocked()

  // Idle: no pointer, key, touch or wheel event for the chosen time, unless a video is playing
  // (watching is not idling). Return: the tab was hidden for a few seconds and is back.
  useEffect(() => {
    if (!settings) return
    let last = performance.now()
    let hiddenAt = 0
    const bump = (e: Event) => {
      if (e.timeStamp - last > 500) last = e.timeStamp // event timestamps share performance.now()'s clock
    }
    const events = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel']
    for (const n of events) addEventListener(n, bump, { passive: true, capture: true })
    const idleMs = settings.idleMinutes * 60_000
    const tick = idleMs
      ? window.setInterval(() => {
          const playing = [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended)
          if (playing) last = performance.now()
          else if (performance.now() - last > idleMs) lock()
        }, 5_000)
      : undefined
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = performance.now()
      else if (settings.lockOnReturn && hiddenAt && performance.now() - hiddenAt > RETURN_AFTER_MS) lock()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'L' || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      lock()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      for (const n of events) removeEventListener(n, bump, { capture: true })
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKey)
    }
  }, [settings])

  // The page behind is hidden outright (index.css), not just covered: no thumbnail leaks
  // through a translucent overlay, and nothing behind takes taps.
  useEffect(() => {
    document.documentElement.classList.toggle('locked', locked)
    return () => document.documentElement.classList.remove('locked')
  }, [locked])

  if (!settings || !locked) return null
  return createPortal(<LockScreen length={settings.length} />, document.body)
}

function LockScreen({ length }: { length: number }) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [tries, setTries] = useState(0)
  const [waitLeft, setWaitLeft] = useState(0) // seconds
  const input = useRef<HTMLInputElement>(null)

  // Too many wrong tries: a 30 s wait, counted down on screen.
  useEffect(() => {
    if (tries < MAX_TRIES) return
    setWaitLeft(WAIT_MS / 1000)
    const t = window.setInterval(() => {
      setWaitLeft((s) => {
        if (s <= 1) {
          clearInterval(t)
          setTries(0)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [tries])

  useEffect(() => {
    if (!shake) return
    const t = setTimeout(() => setShake(false), 500)
    return () => clearTimeout(t)
  }, [shake])

  const waiting = waitLeft > 0
  const enter = (next: string) => {
    if (waiting) return
    const digits = next.replace(/\D/g, '').slice(0, length)
    setPin(digits)
    if (digits.length < length) return
    if (unlock(digits)) return
    setPin('')
    setShake(true)
    setTries((n) => n + 1)
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-8 bg-bg px-6 pb-[env(safe-area-inset-bottom)] select-none"
      role="dialog"
      aria-label="flix is locked"
      onClick={() => input.current?.focus()}
    >
      <LockKeyhole size={28} className="text-muted" />
      <div className={clsx('flex gap-4', shake && 'animate-shake')} aria-live="polite">
        {Array.from({ length }, (_, i) => (
          <span key={i} className={clsx('size-3.5 rounded-full ring-2 ring-fg/60 transition-colors', i < pin.length && 'bg-fg')} />
        ))}
      </div>
      {/* the real field: a phone's keyboard and a desktop's keys both land here */}
      <input
        ref={input}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        autoFocus
        value={pin}
        onChange={(e) => enter(e.target.value)}
        disabled={waiting}
        aria-label="PIN"
        className="absolute size-px opacity-0"
      />
      {waiting ? (
        <p className="text-sm text-muted">Too many tries. Wait {waitLeft} s.</p>
      ) : (
        <div className="grid w-64 grid-cols-3 gap-3 touch:w-72">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
            k === '' ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  enter(k === '⌫' ? pin.slice(0, -1) : pin + k)
                }}
                className="flex h-16 items-center justify-center rounded-2xl bg-raised text-2xl font-medium hover:bg-line active:bg-line"
                aria-label={k === '⌫' ? 'Delete' : k}
              >
                {k === '⌫' ? <Delete size={22} /> : k}
              </button>
            ),
          )}
        </div>
      )}
      <p className="max-w-xs text-center text-xs text-muted">
        Forgot it? This is a privacy screen, not a login: clearing this site’s data in the browser removes the PIN and the
        other preferences kept on this device, nothing else.
      </p>
    </div>
  )
}
