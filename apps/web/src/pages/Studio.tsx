import type { SceneQuery } from '@flix/shared'
import type { JSX } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { BlockButton, BlockedNotice, FollowButton } from '../components/EntityHeader'
import { SceneBrowser } from '../components/SceneBrowser'
import { Chip, ErrorBox, Spinner } from '../components/ui'
import { useFavoriteStudio, useStudio } from '../lib/api'

const route = getRouteApi('/studio/$id')

export function StudioPage(): JSX.Element {
  const { id } = route.useParams()
  const query = route.useSearch()
  const navigate = route.useNavigate()
  const { data: s, error, isLoading } = useStudio(id)
  const fav = useFavoriteStudio()

  if (error) return <ErrorBox error={error} />
  if (isLoading || !s) return <Spinner className="mx-auto mt-32" />

  return (
    <div>
      <section className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex h-28 w-56 shrink-0 items-center justify-center rounded-2xl bg-surface p-5 ring-1 ring-white/5">
          {s.image ? <img src={s.image} alt={s.name} className="max-h-full max-w-full object-contain" /> : <span className="text-2xl font-black">{s.name}</span>}
        </div>
        <div className="min-w-0">
          {s.parent && (
            <Link to="/studio/$id" params={{ id: s.parent.id }} className="text-sm text-muted hover:text-accent">
              {s.parent.name}
            </Link>
          )}
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{s.name}</h1>
          <div className="mt-1 text-sm text-muted">{s.sceneCount} videos</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <FollowButton favorite={s.favorite} onToggle={() => fav.mutate({ id, favorite: !s.favorite })} />
            <BlockButton kind="studio" id={id} />
          </div>
          {s.children.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {s.children.map((c) => (
                <Link key={c.id} to="/studio/$id" params={{ id: c.id }}>
                  <Chip>{c.name}</Chip>
                </Link>
              ))}
            </div>
          )}
          {s.details && <p className="mt-3 max-w-3xl text-sm text-white/70">{s.details}</p>}
        </div>
      </section>
      <BlockedNotice kind="studio" id={id} />
      <SceneBrowser
        query={query}
        base={{ studios: id }}
        onChange={(patch) => navigate({ to: ".", search: (prev: SceneQuery) => ({ ...prev, ...patch }), replace: true })}
      />
    </div>
  )
}
