import type { SceneQuery } from '@flix/shared'
import type { JSX } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { GraduationCap, Settings2 } from 'lucide-react'
import { SceneBrowser } from '../components/SceneBrowser'
import { Chip } from '../components/ui'
import { useEduTags } from '../lib/api'
import { idList, toggleId } from '../lib/query'

const route = getRouteApi('/edu')
const BASE: SceneQuery = { edu: true }

// The Edu section (wiki features/edu-section): every video in one of the Edu categories, with the
// usual filters and sort. The chips narrow to one or more categories; Manage opens the list in
// Settings. These videos are kept out of Home, stations and recommendations.
export function Edu(): JSX.Element {
  const query = route.useSearch()
  const navigate = route.useNavigate()
  const { data: tags } = useEduTags()
  const onChange = (patch: Partial<SceneQuery>) => navigate({ to: '.', search: (prev: SceneQuery) => ({ ...prev, ...patch }), replace: true })
  const picked = idList(query.tags)

  return (
    <div>
      <section className="mb-5">
        <div className="text-sm font-semibold text-accent">Section</div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Edu</h1>
          <Link
            to="/settings"
            hash="library"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted hover:bg-raised hover:text-fg touch:min-h-11"
          >
            <Settings2 size={16} /> Manage
          </Link>
        </div>
        {!!tags?.length && (
          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {tags.map((t) => (
              <Chip key={t.id} tone={picked.includes(t.id) ? 'include' : 'default'} onClick={() => onChange({ tags: toggleId(query.tags, t.id) })}>
                {t.name}
              </Chip>
            ))}
          </div>
        )}
      </section>
      {tags && !tags.length ? (
        <div className="mx-auto max-w-md rounded-2xl bg-surface p-6 text-center ring-1 ring-line">
          <GraduationCap size={28} className="mx-auto text-accent" />
          <p className="mt-3 font-semibold">No Edu categories yet</p>
          <p className="mt-1 text-sm text-muted">
            Tap <b>Edu</b> on a category's page, or add categories in Settings. Their videos show here and stay out of Home, stations and
            recommendations.
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
