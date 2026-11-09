import type { SceneQuery } from '@flix/shared'
import type { JSX } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { Settings2, Vault as VaultIcon } from 'lucide-react'
import { SceneBrowser } from '../components/SceneBrowser'
import { Chip } from '../components/ui'
import { useUnlisted } from '../lib/api'
import { idList, toggleId } from '../lib/query'

const route = getRouteApi('/vault')
const BASE: SceneQuery = { vault: true }

// The Vault (wiki features/vault): every Unlisted video, whatever unlists it (a category, a
// performer, a studio, or by hand), with Browse's filters, search and sort. The chips narrow to
// what unlists them; Manage opens the list in Settings. These videos are kept off Home, stations
// and recommendations.
export function Vault(): JSX.Element {
  const query = route.useSearch()
  const navigate = route.useNavigate()
  const { data: u } = useUnlisted()
  const onChange = (patch: Partial<SceneQuery>) => navigate({ to: '.', search: (prev: SceneQuery) => ({ ...prev, ...patch }), replace: true })
  const chips = u
    ? [
        ...(u.sceneTag ? [{ key: 'tags' as const, id: u.sceneTag, name: 'Unlisted by hand' }] : []),
        ...u.tags.map((t) => ({ key: 'tags' as const, id: t.id, name: t.name })),
        ...u.performers.map((p) => ({ key: 'performers' as const, id: p.id, name: p.name })),
        ...u.studios.map((s) => ({ key: 'studios' as const, id: s.id, name: s.name })),
      ]
    : []
  const empty = u && !u.tags.length && !u.performers.length && !u.studios.length && !u.sceneTag

  return (
    <div>
      <section className="mb-5">
        <div className="text-sm font-semibold text-accent">Unlisted</div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Vault</h1>
          <Link
            to="/settings"
            hash="library"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted hover:bg-raised hover:text-fg touch:min-h-11"
          >
            <Settings2 size={16} /> Manage
          </Link>
        </div>
        {chips.length > 0 && (
          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {chips.map((c) => (
              <Chip key={`${c.key}${c.id}`} tone={idList(query[c.key]).includes(c.id) ? 'include' : 'default'} onClick={() => onChange({ [c.key]: toggleId(query[c.key], c.id) })}>
                {c.name}
              </Chip>
            ))}
          </div>
        )}
      </section>
      {empty ? (
        <div className="mx-auto max-w-md rounded-2xl bg-surface p-6 text-center ring-1 ring-line">
          <VaultIcon size={28} className="mx-auto text-accent" />
          <p className="mt-3 font-semibold">Nothing unlisted yet</p>
          <p className="mt-1 text-sm text-muted">
            Tap <b>Unlist</b> on a video, a category, a performer or a studio. Their videos collect here and stay off Home, stations and
            recommendations; Browse and search still find them.
          </p>
          <Link to="/settings" hash="library" className="mt-4 inline-flex rounded-full bg-raised px-4 py-2 text-sm font-semibold hover:bg-line touch:min-h-11 touch:items-center">
            Open Settings
          </Link>
        </div>
      ) : (
        <SceneBrowser query={query} base={BASE} onChange={onChange} defaultSort="date" />
      )}
    </div>
  )
}
