import { Eye, Ghost, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { checkPin, IDLE_CHOICES, lock, newPinSettings, savePinSettings, usePinSettings } from '../lib/lock'
import { setPrivate, useIsPrivate } from '../lib/privacy'
import { asBool, useStored } from '../lib/storage'
import { Button, Switch } from './ui'

// Settings → Privacy: the private session switch (the ghost in the header is the same switch),
// the discreet switch (the eye in the header, same key in storage) and the PIN lock.
export function PrivacySetting() {
  const priv = useIsPrivate()
  return (
    <section className="max-w-xl">
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <Ghost size={15} className="text-violet-300" /> Private session
      </h4>
      <label className="mt-2 flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Record nothing I watch</span>
          <span className="mt-0.5 block text-sm text-muted">
            Nothing you watch is recorded until you close flix: no plays, history or resume points, no station spots, and the
            rating, O and marker buttons do nothing. Favorites, follows, playlists and deletes still work. The ghost in the
            header turns it on and off too.
          </span>
        </span>
        <Switch on={priv} onChange={setPrivate} className="mt-0.5" />
      </label>
      <DiscreetSetting />
      <PinSetting />
    </section>
  )
}

// The same per-browser flag as the eye in the header (`flix.discreet`, see Layout).
function DiscreetSetting() {
  const [discreet, setDiscreet] = useStored('flix.discreet', asBool(false))
  return (
    <div className="mt-6">
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <Eye size={15} className="text-muted" /> Discreet
      </h4>
      <label className="mt-2 flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Blur pictures until hovered or focused</span>
          <span className="mt-0.5 block text-sm text-muted">
            Every thumbnail, poster and preview is blurred until you point at it (or touch its card). Kept on this device only;
            the eye in the header is the same switch.
          </span>
        </span>
        <Switch on={discreet} onChange={setDiscreet} className="mt-0.5" />
      </label>
    </div>
  )
}

const PIN_OK = /^\d{4,6}$/

function PinSetting() {
  const settings = usePinSettings()
  return (
    <div className="mt-6">
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <LockKeyhole size={15} className="text-muted" /> PIN lock
      </h4>
      <p className="mt-0.5 text-sm text-muted">
        A screen over flix after a while without a touch, or when you come back to it, until a 4–6 digit PIN is entered.
        Press <kbd className="rounded bg-raised px-1">L</kbd> to lock at once. This is a privacy screen, not a login: the PIN
        stays on this device and clearing the site’s data removes it.
      </p>
      {settings ? (
        <div className="mt-3 space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">Lock after</span>
            <select
              value={settings.idleMinutes}
              onChange={(e) => savePinSettings({ ...settings, idleMinutes: Number(e.target.value) })}
              className="rounded-full bg-raised px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent"
            >
              {IDLE_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'Never (only L or on return)' : m === 1 ? '1 minute idle' : `${m} minutes idle`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm">Lock when I come back to flix after switching away</span>
            <Switch on={settings.lockOnReturn} onChange={(v) => savePinSettings({ ...settings, lockOnReturn: v })} size="sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={lock}>Lock now</Button>
            <ChangePin />
            <RemovePin />
          </div>
        </div>
      ) : (
        <SetPin />
      )}
    </div>
  )
}

const field = 'w-28 rounded-full bg-raised px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent'
const pinInput = (value: string, set: (v: string) => void, placeholder: string, autoFocus = false) => (
  <input
    type="password"
    inputMode="numeric"
    pattern="[0-9]*"
    autoComplete="off"
    autoFocus={autoFocus}
    maxLength={6}
    value={value}
    onChange={(e) => set(e.target.value.replace(/\D/g, ''))}
    placeholder={placeholder}
    aria-label={placeholder}
    className={field}
  />
)

function SetPin() {
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const ready = PIN_OK.test(pin) && pin === again
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) savePinSettings(newPinSettings(pin))
      }}
    >
      {pinInput(pin, setPin, 'New PIN')}
      {pinInput(again, setAgain, 'Repeat PIN')}
      <Button type="submit" disabled={!ready}>
        Set PIN
      </Button>
      {pin && again && pin !== again && <span className="text-sm text-red-400">They differ</span>}
    </form>
  )
}

function ChangePin() {
  const settings = usePinSettings()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [wrong, setWrong] = useState(false)
  if (!settings) return null
  if (!open) return <Button onClick={() => setOpen(true)}>Change PIN</Button>
  const ready = current.length >= 4 && PIN_OK.test(pin) && pin === again
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!checkPin(current)) return setWrong(true)
        savePinSettings(newPinSettings(pin, settings))
        setOpen(false)
      }}
    >
      {pinInput(current, (v) => (setCurrent(v), setWrong(false)), 'Current', true)}
      {pinInput(pin, setPin, 'New PIN')}
      {pinInput(again, setAgain, 'Repeat PIN')}
      <Button type="submit" disabled={!ready}>
        Save
      </Button>
      <Button onClick={() => setOpen(false)}>Cancel</Button>
      {wrong && <span className="text-sm text-red-400">Wrong PIN</span>}
    </form>
  )
}

function RemovePin() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [wrong, setWrong] = useState(false)
  if (!open) return <Button onClick={() => setOpen(true)}>Remove PIN</Button>
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!checkPin(current)) return setWrong(true)
        savePinSettings(null)
        setOpen(false)
      }}
    >
      {pinInput(current, (v) => (setCurrent(v), setWrong(false)), 'Current PIN', true)}
      <Button type="submit" disabled={current.length < 4}>
        Remove
      </Button>
      <Button onClick={() => setOpen(false)}>Cancel</Button>
      {wrong && <span className="text-sm text-red-400">Wrong PIN</span>}
    </form>
  )
}
