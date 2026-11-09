import type { CastStatus, SceneQuery } from '@flix/shared'
import { useCast } from '../lib/api'
import { idList, toCsv } from '../lib/query'
import { Chip } from './ui'

// Browse's Cast filter (wiki features/cast). Every choice becomes ordinary category includes and
// excludes on the Cast categories (`tags` must have all, `xtags` must have none), so the URL,
// pinned rows and stations carry it, and it is read back from them:
//   at least k  → include "<Letter> k+"
//   exactly k   → include "<Letter> k+", exclude "<Letter> (k+1)+"
//   none        → exclude "<Letter> 1+" (and Unknown, which claims no counts)
//   mixes       → exclude every other mix and Unknown (each video has exactly one mix)

type Letter = 'Women' | 'Men' | 'Other'
type Want = 'any' | 'none' | `${number}+` | `=${number}`
const LETTERS: [Letter, number][] = [
  ['Women', 3],
  ['Men', 3],
  ['Other', 2],
]
const MIX_LABEL: Record<string, string> = {
  'Cast: F': 'Women only',
  'Cast: M': 'Men only',
  'Cast: X': 'Other only',
  'Cast: F+M': 'Women & men',
  'Cast: F+X': 'Women & other',
  'Cast: M+X': 'Men & other',
  'Cast: F+M+X': 'All three',
  'Cast: Unknown': 'Unknown',
}

type Patch = Partial<SceneQuery>

function ids(cast: CastStatus) {
  const byName = new Map([...cast.mixes, ...cast.counts].map((t) => [t.name, t.id]))
  const count = (l: Letter, n: number) => byName.get(`Cast: ${l} ${n}+`)
  return { byName, count, all: new Set(byName.values()), unknown: byName.get('Cast: Unknown') }
}

// What the URL says, per letter and for the mixes.
function read(q: SceneQuery, cast: CastStatus) {
  const { count } = ids(cast)
  const inc = new Set(idList(q.tags))
  const exc = new Set(idList(q.xtags))
  const want = {} as Record<Letter, Want>
  for (const [l, cap] of LETTERS) {
    let w: Want = 'any'
    for (let k = cap; k >= 1; k--)
      if (inc.has(count(l, k)!)) {
        w = k < cap && exc.has(count(l, k + 1)!) ? `=${k}` : `${k}+`
        break
      }
    if (w === 'any' && exc.has(count(l, 1)!)) w = 'none'
    want[l] = w
  }
  const mixes = cast.mixes.filter((m) => m.name !== 'Cast: Unknown')
  const excludedMixes = mixes.filter((m) => exc.has(m.id))
  const picked = excludedMixes.length ? mixes.filter((m) => !exc.has(m.id)).map((m) => m.id) : []
  return { want, picked }
}

// The URL for these choices: the Cast categories replaced, everything else kept.
function write(q: SceneQuery, cast: CastStatus, want: Record<Letter, Want>, picked: string[]): Patch {
  const { count, all, unknown } = ids(cast)
  const inc = idList(q.tags).filter((t) => !all.has(t))
  const exc = idList(q.xtags).filter((t) => !all.has(t))
  let none = false
  for (const [l, cap] of LETTERS) {
    const w = want[l]
    if (w === 'none') {
      exc.push(count(l, 1)!)
      none = true
    } else if (w.endsWith('+')) inc.push(count(l, Number(w.slice(0, -1)))!)
    else if (w.startsWith('=')) {
      const k = Number(w.slice(1))
      inc.push(count(l, k)!)
      if (k < cap) exc.push(count(l, k + 1)!)
    }
  }
  if (picked.length) {
    for (const m of cast.mixes) if (!picked.includes(m.id) && m.name !== 'Cast: Unknown') exc.push(m.id)
    none = true
  }
  if (none && unknown) exc.push(unknown)
  return { tags: toCsv([...new Set(inc)]), xtags: toCsv([...new Set(exc)]) }
}

export function CastFilter({ query, onChange }: { query: SceneQuery; onChange: (p: Patch) => void }) {
  const { data: cast } = useCast()
  if (!cast || !cast.counts.length) return null
  const { want, picked } = read(query, cast)
  const set = (l: Letter, w: Want) => onChange(write(query, cast, { ...want, [l]: w }, picked))
  const toggleMix = (id: string) => onChange(write(query, cast, want, picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]))
  const options = (cap: number): [Want, string][] => [
    ['any', 'Any'],
    ['none', 'None'],
    ...Array.from({ length: cap }, (_, i): [Want, string] => [`${i + 1}+`, `${i + 1}+`]),
    ...Array.from({ length: cap - 1 }, (_, i): [Want, string] => [`=${i + 1}`, `Exactly ${i + 1}`]),
  ]
  return (
    <div className="space-y-3">
      {LETTERS.map(([l, cap]) => (
        <div key={l}>
          <div className="mb-1.5 text-sm text-fg/90">{l}</div>
          <div className="flex flex-wrap gap-1.5">
            {options(cap).map(([w, label]) => (
              <Chip key={w} tone={want[l] === w ? 'active' : 'default'} onClick={() => set(l, w)}>
                {label}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      <div>
        <div className="mb-1.5 text-sm text-fg/90">
          Mix <span className="text-xs text-muted">(any of)</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cast.mixes
            .filter((m) => m.name !== 'Cast: Unknown' && m.scenes > 0)
            .map((m) => (
              <Chip key={m.id} tone={picked.includes(m.id) ? 'include' : 'default'} onClick={() => toggleMix(m.id)}>
                {MIX_LABEL[m.name] ?? m.name} <span className="text-xs text-muted tabular-nums">{m.scenes.toLocaleString()}</span>
              </Chip>
            ))}
        </div>
      </div>
      <p className="text-xs text-muted">Women, men and everyone else (other), from the performers’ gender in Stash.</p>
    </div>
  )
}
