import type { SceneQuery } from '@flix/shared'
import type { JSX } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { BlockButton, BlockedNotice } from '../components/EntityHeader'
import { SceneBrowser } from '../components/SceneBrowser'
import { Chip, ErrorBox, Spinner } from '../components/ui'
import { useTag } from '../lib/api'

const route = getRouteApi('/tag/$id')

export function TagPage(): JSX.Element {
  const { id } = route.useParams()
  const query = route.useSearch()
  const navigate = route.useNavigate()
  const { data: t, error, isLoading } = useTag(id)

  if (error) return <ErrorBox error={error} />
  if (isLoading || !t) return <Spinner className="mx-auto mt-32" />

  return (
    <div>
      <section className="mb-6">
        <div className="text-sm font-semibold text-accent">#</div>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{t.name}</h1>
        <div className="mt-1 text-sm text-muted">
          {t.sceneCount} videos{t.aliases.length > 0 && ` · also ${t.aliases.join(', ')}`}
        </div>
        {t.description && <p className="mt-2 max-w-3xl text-sm text-white/70">{t.description}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <BlockButton kind="tag" id={id} />
          {[...t.parents, ...t.children].map((r) => (
            <Link key={r.id} to="/tag/$id" params={{ id: r.id }}>
              <Chip>{r.name}</Chip>
            </Link>
          ))}
        </div>
      </section>
      <BlockedNotice kind="tag" id={id} />
      <SceneBrowser
        query={query}
        base={{ tags: id }}
        onChange={(patch) => navigate({ to: ".", search: (prev: SceneQuery) => ({ ...prev, ...patch }), replace: true })}
      />
    </div>
  )
}
