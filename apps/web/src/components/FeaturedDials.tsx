import { FEATURED_DEFAULTS, type FeaturedWeights } from '@flix/shared'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useFeaturedPreview, useSettings, useUpdateSettings } from '../lib/api'
import { useDebounced } from '../lib/hooks'
import { showToast } from '../lib/toast'
import { SceneCard } from './SceneCard'
import { Button } from './ui'

// The Featured row's dials: one slider per signal, -1 (avoid) to 1 (prefer), with the top
// picks for the current positions shown live underneath. Saved for every device.
const DIALS: { key: keyof FeaturedWeights; label: string; hint: string }[] = [
  { key: 'dormant', label: 'Not seen for a long time', hint: 'Since the last play; since it was added if never played' },
  { key: 'shelfAge', label: 'Downloaded long ago', hint: 'Older additions first' },
  { key: 'fresh', label: 'Newly added', hint: 'The opposite: recent additions first' },
  { key: 'performer', label: 'Performers you follow', hint: 'Followed performers, and the ones you watch most' },
  { key: 'tag', label: 'Pinned categories', hint: 'Pinned categories, and the ones your plays share' },
  { key: 'studio', label: 'Studios you follow', hint: 'Followed studios, and the ones you watch most' },
  { key: 'watched', label: 'Watched a lot', hint: 'Left of center prefers rarely watched videos' },
  { key: 'marked', label: 'Many markers', hint: 'Videos you have marked moments in' },
  { key: 'rated', label: 'Highly rated', hint: 'Your star ratings' },
  { key: 'oCount', label: 'O-counter', hint: 'The ones that worked' },
  { key: 'surprise', label: 'Surprise', hint: 'Random luck, new on every visit; 0 is fully predictable' },
]

export function FeaturedDials() {
  const { data: settings } = useSettings()
  const save = useUpdateSettings()
  const [draft, setDraft] = useState<FeaturedWeights | null>(null)
  const value = draft ?? settings?.featured ?? FEATURED_DEFAULTS
  const preview = useFeaturedPreview(useDebounced(value, 300), !!settings)
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(settings?.featured)
  const set = (key: keyof FeaturedWeights, v: number) => setDraft({ ...value, [key]: v })

  return (
    <section>
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <Sparkles size={18} className="text-accent" /> Featured
      </h3>
      <p className="mt-1 max-w-xl text-sm text-muted">
        How the Featured row and Tonight’s pick choose. Each dial says how much a signal counts, from avoid (left) through
        ignore (center) to prefer (right). The picks below update as you drag; Save applies them to Home.
      </p>
      <div className="mt-4 grid max-w-xl gap-x-8 gap-y-3 sm:grid-cols-2">
        {DIALS.map(({ key, label, hint }) => (
          <label key={key} className="block">
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{label}</span>
              <span className="text-xs text-muted tabular-nums">{value[key] > 0 ? '+' : ''}{value[key].toFixed(1)}</span>
            </span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.1}
              value={value[key]}
              disabled={!settings}
              onChange={(e) => set(key, Number(e.target.value))}
              onDoubleClick={() => set(key, 0)}
              aria-label={label}
              className="slim mt-1.5 w-full cursor-pointer"
            />
            <span className="mt-0.5 block text-xs text-muted">{hint}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="accent" disabled={!dirty || save.isPending} onClick={() => draft && save.mutate({ featured: draft }, { onSuccess: () => (setDraft(null), showToast('Saved')) })}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button onClick={() => setDraft({ ...FEATURED_DEFAULTS })} disabled={JSON.stringify(value) === JSON.stringify(FEATURED_DEFAULTS)}>
          Reset to defaults
        </Button>
        {dirty && (
          <Button onClick={() => setDraft(null)}>Discard</Button>
        )}
      </div>
      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Top picks with these dials</div>
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scroll-pl-4 sm:-mx-6 sm:px-6 sm:scroll-pl-6">
          {(preview.data ?? []).map((s) => (
            <SceneCard key={s.id} scene={s} compact sizes="(min-width: 640px) 220px, 58vw" className="w-[58vw] shrink-0 snap-start sm:w-[220px]" />
          ))}
          {preview.isPending && !preview.data && <div className="py-6 text-sm text-muted">Scoring the library…</div>}
          {preview.data && !preview.data.length && <div className="py-6 text-sm text-muted">Nothing to feature yet.</div>}
        </div>
      </div>
    </section>
  )
}
