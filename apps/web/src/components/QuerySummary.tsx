import type { SceneQuery } from '@flix/shared'
import { usePerformer, useStudio, useTags } from '../lib/api'
import { ageLabel, idList } from '../lib/query'

// A list's filters as short text: "Riley Reyes · Gangbang · 1080p+ · unwatched".
export function QuerySummary({ query, empty = 'Everything' }: { query: SceneQuery; empty?: string }) {
  const { data: tags } = useTags({ sort: 'name' })
  const tagName = (id: string) => tags?.items.find((t) => t.id === id)?.name ?? '…'
  const parts: React.ReactNode[] = []
  idList(query.performers).forEach((id) => parts.push(<PerformerName key={`p${id}`} id={id} />))
  idList(query.studios).forEach((id) => parts.push(<StudioName key={`s${id}`} id={id} />))
  idList(query.tags).forEach((id) => parts.push(tagName(id)))
  idList(query.xtags).forEach((id) => parts.push(`no ${tagName(id)}`))
  const age = ageLabel(query.minAge, query.maxAge)
  if (age) parts.push(age)
  if (query.ethnicities) parts.push(query.ethnicities.split(',').join(' or '))
  if (query.minHeight) parts.push(query.minHeight >= 2160 ? '4K' : `${query.minHeight}p+`)
  if (query.minRating) parts.push(`★${query.minRating}+`)
  if (query.unwatched) parts.push('unwatched')
  if (query.favorites) parts.push('favourite performers')
  if (query.minDuration || query.maxDuration) parts.push(`${query.minDuration ?? 0}–${query.maxDuration ?? '∞'} min`)
  if (query.q) parts.push(`“${query.q}”`)
  if (!parts.length) return <>{empty}</>
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {p}
        </span>
      ))}
    </>
  )
}

function PerformerName({ id }: { id: string }) {
  return <>{usePerformer(id).data?.name ?? '…'}</>
}

function StudioName({ id }: { id: string }) {
  return <>{useStudio(id).data?.name ?? '…'}</>
}
