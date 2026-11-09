import type { SceneQuery } from '@flix/shared'
import { getRouteApi } from '@tanstack/react-router'
import { ListX } from 'lucide-react'
import type { JSX } from 'react'
import { SceneBrowser } from '../components/SceneBrowser'
import { useClearContinue, useSettings, useUpdateSettings } from '../lib/api'
import { WatchTabs } from './History'

const route = getRouteApi('/continue')

// Videos started but not finished (Stash keeps a resume point until the last ~15 s),
// most recently watched first. Select → Remove clears resume points; ones untouched for the
// chosen number of days leave on their own (decisions/continue-clears-and-expires).
export function Continue(): JSX.Element {
  const query = route.useSearch()
  const navigate = route.useNavigate()
  const clear = useClearContinue()
  return (
    <div>
      <WatchTabs />
      <ExpirySetting />
      <SceneBrowser
        query={query}
        base={{ inProgress: true }}
        defaultSort="last_played_at"
        onChange={(patch) => navigate({ to: '.', search: (prev: SceneQuery) => ({ ...prev, ...patch }), replace: true })}
        bulkActions={[{ label: 'Remove', icon: <ListX size={16} />, run: (ids) => clear.mutateAsync(ids), done: 'Removed from Continue' }]}
      />
    </div>
  )
}

const CHOICES = [7, 14, 30, 60, 90, 0] as const

// Next to the list it changes (decisions/settings-next-to-page).
function ExpirySetting() {
  const { data: settings } = useSettings()
  const save = useUpdateSettings()
  if (!settings) return null
  return (
    <p className="-mt-2 mb-4 text-[13px] text-muted">
      Remove untouched videos{' '}
      <select
        value={settings.continueDays}
        onChange={(e) => save.mutate({ continueDays: Number(e.target.value) })}
        aria-label="How long a video stays in Continue"
        className="rounded-full bg-raised px-2 py-1 text-fg hover:bg-line focus:ring-1 focus:ring-accent focus:outline-none touch:py-2"
      >
        {CHOICES.map((d) => (
          <option key={d} value={d}>
            {d ? `after ${d} days` : 'never'}
          </option>
        ))}
      </select>
    </p>
  )
}
