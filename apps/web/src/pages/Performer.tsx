import type { SceneQuery } from '@flix/shared'
import type { JSX } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { BlockButton, BlockedNotice, FollowButton, Stat } from '../components/EntityHeader'
import { SceneBrowser } from '../components/SceneBrowser'
import { Avatar, ErrorBox, Spinner, Stars } from '../components/ui'
import { useFavoritePerformer, usePerformer, useRatePerformer } from '../lib/api'
import { age, date } from '../lib/format'

const route = getRouteApi('/performer/$id')

export function PerformerPage(): JSX.Element {
  const { id } = route.useParams()
  const query = route.useSearch()
  const navigate = route.useNavigate()
  const { data: p, error, isLoading } = usePerformer(id)
  const fav = useFavoritePerformer()
  const rate = useRatePerformer()
  const [more, setMore] = useState(false)

  if (error) return <ErrorBox error={error} />
  if (isLoading || !p) return <Spinner className="mx-auto mt-32" />

  const years = p.careerStart ? `${p.careerStart}–${p.careerEnd ?? 'now'}` : null

  return (
    <div>
      <section className="relative -mx-4 -mt-6 mb-6 overflow-hidden sm:-mx-6">
        {p.image && <img src={p.image} alt="" className="absolute inset-0 size-full scale-125 object-cover opacity-30 blur-3xl" />}
        <div className="absolute inset-0 bg-gradient-to-t from-bg to-bg/30" />
        <div className="relative mx-auto flex max-w-[1920px] flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:px-6">
          <Avatar src={p.image} name={p.name} className="aspect-[3/4] w-40 shrink-0 rounded-2xl object-top shadow-2xl ring-1 ring-white/10 sm:w-52" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{p.name}</h1>
            {p.disambiguation && <div className="mt-1 text-muted">{p.disambiguation}</div>}
            {p.aliases.length > 0 && <div className="mt-1 line-clamp-1 text-sm text-muted">aka {p.aliases.join(', ')}</div>}
            <div className="mt-3 text-sm text-white/80">
              {[`${p.sceneCount} videos`, age(p.birthdate) && `${age(p.birthdate)} years old`, p.country, years].filter(Boolean).join(' · ')}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <FollowButton favorite={p.favorite} onToggle={() => fav.mutate({ id, favorite: !p.favorite })} />
              <div className="rounded-full bg-raised px-2 py-1">
                <Stars value={p.rating} onChange={(rating) => rate.mutate({ id, rating })} />
              </div>
              <BlockButton kind="performer" id={id} />
              <button onClick={() => setMore((v) => !v)} className="px-2 text-sm text-muted hover:text-fg">
                {more ? 'Less' : 'About'}
              </button>
            </div>
          </div>
        </div>
        {more && (
          <div className="relative mx-auto max-w-[1920px] px-4 pb-8 sm:px-6">
            <div className="grid grid-cols-2 gap-4 rounded-2xl bg-surface/80 p-5 backdrop-blur sm:grid-cols-4 lg:grid-cols-6">
              <Stat label="Born">{date(p.birthdate)}</Stat>
              <Stat label="Ethnicity">{p.ethnicity}</Stat>
              <Stat label="Hair">{p.hairColor}</Stat>
              <Stat label="Eyes">{p.eyeColor}</Stat>
              <Stat label="Height">{p.heightCm ? `${p.heightCm} cm` : null}</Stat>
              <Stat label="Measurements">{p.measurements}</Stat>
              <Stat label="Breasts">{p.fakeTits}</Stat>
              <Stat label="Tattoos">{p.tattoos}</Stat>
              <Stat label="Piercings">{p.piercings}</Stat>
            </div>
            {p.details && <p className="mt-4 max-w-3xl text-sm whitespace-pre-line text-white/80">{p.details}</p>}
            {p.urls.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                {p.urls.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 hover:text-fg">
                    <ExternalLink size={12} /> {new URL(u).hostname}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
      <BlockedNotice kind="performer" id={id} />
      <SceneBrowser
        query={query}
        base={{ performers: id, unblocked: undefined }}
        onChange={(patch) => navigate({ to: ".", search: (prev: SceneQuery) => ({ ...prev, ...patch }), replace: true })}
      />
    </div>
  )
}
