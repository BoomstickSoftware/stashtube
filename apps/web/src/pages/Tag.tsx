import { ReelShelf } from '../components/ReelShelf'
import type { SceneQuery, TagDetail } from '@flix/shared'
import type { JSX } from 'react'
import { getRouteApi, Link } from '@tanstack/react-router'
import { AddFilterButton } from '../components/AddFilter'
import { BlockButton, BlockedNotice, FollowButton, HeaderSkeleton, UnlistButton, UnlistedNotice } from '../components/EntityHeader'
import { SceneBrowser } from '../components/SceneBrowser'
import { Chip, ErrorBox } from '../components/ui'
import { useFavoriteTag, useTag } from '../lib/api'

const route = getRouteApi('/tag/$id')

// Header skeleton over a grid that fetches from the first paint. Tags are "Categories" wherever
// the user reads it ([[categories-and-us-spelling]]).
export function TagPage(): JSX.Element {
  const { id } = route.useParams()
  const query = route.useSearch()
  const navigate = route.useNavigate()
  const { data: t, error } = useTag(id)

  if (error) return <ErrorBox error={error} />

  return (
    <div>
      {t ? <TagHeader id={id} t={t} /> : <HeaderSkeleton shape="tag" />}
      <BlockedNotice kind="tag" id={id} />
      <UnlistedNotice kind="tag" id={id} />
      <ReelShelf title="Reels" filter={{ tag: id, state: 'published' }} className="mb-6" />
      <SceneBrowser
        query={query}
        base={{ tags: id }}
        onChange={(patch) => navigate({ to: ".", search: (prev: SceneQuery) => ({ ...prev, ...patch }), replace: true })}
      />
    </div>
  )
}

function TagHeader({ id, t }: { id: string; t: TagDetail }) {
  const pin = useFavoriteTag()
  return (
    <section className="mb-6">
      <div className="text-sm font-semibold text-accent">Category</div>
      <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{t.name}</h1>
      <div className="mt-1 text-sm text-muted">
        {t.sceneCount.toLocaleString()} videos{t.aliases.length > 0 && ` · also ${t.aliases.join(', ')}`}
      </div>
      {t.description && <p className="mt-2 max-w-3xl text-sm text-white/70">{t.description}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FollowButton favorite={t.favorite} onToggle={() => pin.mutate({ id, favorite: !t.favorite })} />
        <AddFilterButton kind="tag" id={id} name={t.name} variant="button" />
        <UnlistButton kind="tag" id={id} name={t.name} />
        <BlockButton kind="tag" id={id} name={t.name} />
        {[...t.parents, ...t.children].map((r) => (
          <Link key={r.id} to="/tag/$id" params={{ id: r.id }}>
            <Chip>{r.name}</Chip>
          </Link>
        ))}
      </div>
    </section>
  )
}

