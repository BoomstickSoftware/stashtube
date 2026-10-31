import type { PerformerDetail, SceneQuery } from '@flix/shared'
import type { JSX } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { ChevronDown, ChevronUp, ExternalLink, Info } from 'lucide-react'
import { useState } from 'react'
import { AddFilterButton } from '../components/AddFilter'
import { BlockButton, BlockedNotice, FollowButton, HeaderSkeleton, Stat } from '../components/EntityHeader'
import { SceneBrowser } from '../components/SceneBrowser'
import { Avatar, Button, ErrorBox, Stars } from '../components/ui'
import { WantedShelf } from '../components/WantedRow'
import { useFavoritePerformer, usePerformer, useRatePerformer } from '../lib/api'
import { age, ageAt, date } from '../lib/format'
import { sized } from '@flix/shared'

const route = getRouteApi('/performer/$id')

// The grid needs only the id, so it renders (and fetches) from the first paint under a header
// skeleton; the header fills in when the record arrives, and the wanted shelf follows the
// library, collapsed to its heading ([[library-before-wanted-shelf]]).
export function PerformerPage(): JSX.Element {
  const { id } = route.useParams()
  const query = route.useSearch()
  const navigate = route.useNavigate()
  const { data: p, error } = usePerformer(id)

  if (error) return <ErrorBox error={error} />

  return (
    <div>
      {p ? <PerformerHeader id={id} p={p} /> : <HeaderSkeleton shape="performer" />}
      <BlockedNotice kind="performer" id={id} />
      <SceneBrowser
        omitPerformer={id}
        query={query}
        base={{ performers: id, unblocked: undefined }}
        onChange={(patch) => navigate({ to: ".", search: (prev: SceneQuery) => ({ ...prev, ...patch }), replace: true })}
        cardMeta={
          p
            ? (s) => {
                const a = ageAt(p.birthdate, s.date)
                return a ? `age ${a}` : null
              }
            : undefined
        }
      />
      <WantedShelf kind="performer" id={id} />
    </div>
  )
}

// Stash's URL list repeats itself (the same page with and without `www`, a trailing slash, two
// casings): one link per distinct page, labelled by host, numbered when a host has several.
// A malformed URL is dropped rather than thrown on.
function dedupeLinks(urls: string[]): { href: string; label: string }[] {
  const seen = new Set<string>()
  const perHost = new Map<string, number>()
  const out: { href: string; label: string }[] = []
  for (const href of urls) {
    let u: URL
    try {
      u = new URL(href)
    } catch {
      continue
    }
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    const key = `${host}${u.pathname.replace(/\/+$/, '').toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    const n = (perHost.get(host) ?? 0) + 1
    perHost.set(host, n)
    out.push({ href, label: n > 1 ? `${host} (${n})` : host })
  }
  return out
}

function PerformerHeader({ id, p }: { id: string; p: PerformerDetail }) {
  const fav = useFavoritePerformer()
  const rate = useRatePerformer()
  const [more, setMore] = useState(false)
  const [showLinks, setShowLinks] = useState(false)
  const years = p.careerStart ? `${p.careerStart}–${p.careerEnd ?? 'now'}` : null
  const facts = [p.birthdate, p.ethnicity, p.hairColor, p.eyeColor, p.heightCm, p.measurements, p.fakeTits, p.tattoos, p.piercings].filter(Boolean).length
  const links = dedupeLinks(p.urls)
  const hasAbout = facts > 0 || !!p.details || links.length > 0

  return (
    <section className="relative -mx-4 -mt-6 mb-6 overflow-hidden sm:-mx-6">
      {p.image && <img src={sized(p.image, 320)} alt="" className="absolute inset-0 size-full scale-125 object-cover opacity-30 blur-3xl" />}
      <div className="absolute inset-0 bg-gradient-to-t from-bg to-bg/30" />
      <div className="relative mx-auto flex max-w-[1920px] flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:px-6">
        <Avatar src={p.image} name={p.name} sizes="208px" className="aspect-[3/4] w-40 shrink-0 rounded-2xl object-top shadow-2xl ring-1 ring-white/10 sm:w-52" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">{p.name}</h1>
          {p.disambiguation && <div className="mt-1 text-muted">{p.disambiguation}</div>}
          {p.aliases.length > 0 && <div className="mt-1 line-clamp-1 text-sm text-muted">aka {p.aliases.join(', ')}</div>}
          <div className="mt-3 text-sm text-white/80">
            {[`${p.sceneCount.toLocaleString()} videos`, age(p.birthdate) && `${age(p.birthdate)} years old`, p.country, years].filter(Boolean).join(' · ')}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <FollowButton favorite={p.favorite} onToggle={() => fav.mutate({ id, favorite: !p.favorite })} />
            <div className="rounded-full bg-raised px-2 py-1">
              <Stars value={p.rating} onChange={(rating) => rate.mutate({ id, rating })} />
            </div>
            <AddFilterButton kind="performer" id={id} name={p.name} variant="button" />
            <BlockButton kind="performer" id={id} name={p.name} />
            {/* A real button like its neighbours (desktop audit, item 14): muted text read as a label. */}
            {hasAbout && (
              <Button active={more} aria-expanded={more} onClick={() => setMore((v) => !v)} title="Facts, biography and links">
                <Info size={16} /> About
                {!more && facts > 0 && <span className="text-muted">{facts}</span>}
                {more ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </Button>
            )}
          </div>
        </div>
      </div>
      {more && (
        <div className="relative mx-auto max-w-[1920px] px-4 pb-8 sm:px-6">
          {facts > 0 && (
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
          )}
          {p.details && <p className="mt-4 max-w-3xl text-sm whitespace-pre-line text-white/80">{p.details}</p>}
          {links.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowLinks((v) => !v)}
                aria-expanded={showLinks}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-raised px-3 text-xs font-semibold text-fg hover:bg-line touch:min-h-11"
              >
                <ExternalLink size={13} /> Links ({links.length}) {showLinks ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {showLinks && (
                <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                  {links.map((l) => (
                    <li key={l.href}>
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface/80 px-3 ring-1 ring-line backdrop-blur hover:text-fg touch:min-h-11"
                      >
                        <ExternalLink size={12} /> {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
