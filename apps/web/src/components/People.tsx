import type { PeopleFilter } from '@flix/shared'
import { ethnicities } from '@flix/shared'
import { useRef, useState } from 'react'
import { Users } from 'lucide-react'
import { Chip, useClickOutside } from './ui'

// Age at filming and ethnicity of a performer (of the Settings gender): one performer must
// match both. Used by the filter bar and by Settings (defaults for every list).
const agePresets: { label: string; min?: number; max?: number }[] = [
  { label: '18–22', min: 18, max: 22 },
  { label: '18–25', min: 18, max: 25 },
  { label: '25–35', min: 25, max: 35 },
  { label: '35+', min: 35 },
  { label: '40+', min: 40 },
]

export function PeopleControls({ value, onChange }: { value: PeopleFilter; onChange: (v: PeopleFilter) => void }) {
  const eth = value.ethnicities ?? []
  const num = (v: string) => {
    const n = Number(v)
    return v && Number.isFinite(n) && n >= 18 && n <= 99 ? Math.round(n) : undefined
  }
  const input = 'w-16 rounded-lg bg-raised px-2 py-1 text-base outline-none focus:ring-1 focus:ring-accent sm:text-sm'
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Age at filming</div>
        <div className="flex flex-wrap items-center gap-2">
          {agePresets.map((a) => {
            const on = value.minAge === a.min && value.maxAge === a.max
            return (
              <Chip key={a.label} tone={on ? 'active' : 'default'} onClick={() => onChange({ ...value, minAge: on ? undefined : a.min, maxAge: on ? undefined : a.max })}>
                {a.label}
              </Chip>
            )
          })}
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted">
          <input
            key={`min${value.minAge}`}
            defaultValue={value.minAge ?? ''}
            inputMode="numeric"
            placeholder="min"
            aria-label="Minimum age"
            onBlur={(e) => onChange({ ...value, minAge: num(e.target.value) })}
            className={input}
          />
          to
          <input
            key={`max${value.maxAge}`}
            defaultValue={value.maxAge ?? ''}
            inputMode="numeric"
            placeholder="max"
            aria-label="Maximum age"
            onBlur={(e) => onChange({ ...value, maxAge: num(e.target.value) })}
            className={input}
          />
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Ethnicity (any of)</div>
        <div className="flex flex-wrap gap-2">
          {ethnicities.map((e) => {
            const on = eth.includes(e)
            return (
              <Chip
                key={e}
                tone={on ? 'include' : 'default'}
                onClick={() => {
                  const next = on ? eth.filter((x) => x !== e) : [...eth, e]
                  onChange({ ...value, ethnicities: next.length ? next : undefined })
                }}
              >
                {e}
              </Chip>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Filter-bar chip with a popover.
export function PeopleFilterChip({ value, onChange }: { value: PeopleFilter; onChange: (v: PeopleFilter) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  const active = !!(value.minAge || value.maxAge || value.ethnicities?.length)
  return (
    <div ref={ref} className="relative shrink-0">
      <Chip tone={open || active ? 'active' : 'default'} onClick={() => setOpen((v) => !v)}>
        <Users size={14} /> People
      </Chip>
      {open && (
        <div className="fixed top-32 right-4 left-4 z-50 rounded-2xl bg-surface p-4 shadow-2xl ring-1 ring-line sm:absolute sm:top-10 sm:right-auto sm:left-0 sm:w-96">
          <PeopleControls value={value} onChange={onChange} />
          <p className="mt-4 text-xs text-muted">
            One performer (Settings › performer gender) must match both. Age is to about six months. This replaces your Settings
            defaults for this list.
          </p>
        </div>
      )}
    </div>
  )
}
