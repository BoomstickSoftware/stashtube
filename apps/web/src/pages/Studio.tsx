import type { SceneQuery, StudioDetail } from '@flix/shared'
import type { JSX } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { AddFilterButton } from '../components/AddFilter'
import { BlockButton, BlockedNotice, FollowButton, HeaderSkeleton, UnlistButton, UnlistedNotice } from '../components/EntityHeader'
import { SceneBrowser } from '../components/SceneBrowser'
import { StudioCategories } from '../components/StudioCategories'
import { Chip, ErrorBox } from '../components/ui'
import { WantedShelf } from '../components/WantedRow'
import { useFavoriteStudio, useStudio } from '../lib/api'
import { sized } from '@flix/shared'

const route = getRouteApi('/studio/$id')

// Header skeleton over a grid that fetches from the first paint; the wanted shelf follows the
// library, collapsed to its heading ([[library-before-wanted-shelf]]).
export function StudioPage(): JSX.Element {
  const { id } = route.useParams()
  const query = route.useSearch()
  const navigate = route.useNavigate()
  const { data: s, error } = useStudio(id)

  if (error) return <ErrorBox error={error} />

  return (
    <div>
      {s ? <StudioHeader id={id} s={s} /> : <HeaderSkeleton shape="studio" />}
      <BlockedNotice kind="studio" id={id} />
      <UnlistedNotice kind="studio" id={id} />
      <SceneBrowser
        query={query}
        base={{ studios: id }}
        onChange={(patch) => navigate({ to: ".", search: (prev: SceneQuery) => ({ ...prev, ...patch }), replace: true })}
      />
      <WantedShelf kind="studio" id={id} />
    </div>
  )
}

function StudioHeader({ id, s }: { id: string; s: StudioDetail }) {
  const fav = useFavoriteStudio()
  return (
    <section className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-center">
      <div className="flex h-28 w-56 shrink-0 items-center justify-center rounded-2xl bg-surface p-5 ring-1 ring-white/5">
        {s.image ? <img src={sized(s.image, 320)} alt={s.name} className="max-h-full max-w-full object-contain" /> : <span className="text-2xl font-black">{s.name}</span>}
      </div>
      <div className="min-w-0">
        {s.parent && (
          <Link to="/studio/$id" params={{ id: s.parent.id }} className="text-sm text-muted hover:text-accent">
            {s.parent.name}
          </Link>
        )}
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{s.name}</h1>
        <div className="mt-1 text-sm text-muted">{s.sceneCount.toLocaleString()} videos</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <FollowButton favorite={s.favorite} onToggle={() => fav.mutate({ id, favorite: !s.favorite })} />
          <AddFilterButton kind="studio" id={id} name={s.name} variant="button" />
          <UnlistButton kind="studio" id={id} name={s.name} />
          <BlockButton kind="studio" id={id} name={s.name} />
        </div>
        <StudioCategories id={id} name={s.name} />
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
  )
}
