import type { PeopleFilter } from '@flix/shared'
import { ethnicities } from '@flix/shared'
import { Chip } from './ui'

// Age at filming and ethnicity of a performer: one performer must
// match both. Used by the filter panel and by Settings (defaults for every list).
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
