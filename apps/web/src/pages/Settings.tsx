import type { JSX } from 'react'
import type { BlockKind, Ref } from '@flix/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Ban, Search, X } from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
import { CachePanel } from '../components/CachePanel'
import { Button, Chip, useDebounced } from '../components/ui'
import { authApi, useBlock, useBlocklist, useSearch, useSettings, useUpdateSettings } from '../lib/api'

export function Settings(): JSX.Element {
  const { data } = useBlocklist()
  const block = useBlock()
  const session = useQuery({ queryKey: ['session'], queryFn: authApi.session, staleTime: Infinity })

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section>
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Ban size={22} className="text-accent" /> Blocklist
        </h1>
        <p className="mt-1 text-sm text-muted">
          Anything here is hidden from the home feed, browsing, search and related videos. A blocked performer, studio or tag
          still has its own page, and “Show blocked” on any list brings everything back for that list.
        </p>
        <BlockSearch />
        <div className="mt-6 space-y-5">
          {(
            [
              ['tag', 'Tags', data?.tags],
              ['performer', 'Performers', data?.performers],
              ['studio', 'Studios', data?.studios],
            ] as [BlockKind, string, Ref[] | undefined][]
          ).map(([kind, label, items]) => (
            <div key={kind}>
              <h2 className="mb-2 text-sm font-semibold text-muted">
                {label} <span className="font-normal">({items?.length ?? 0})</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {items?.map((x) => (
                  <Chip key={x.id} tone="exclude" onClick={() => block.mutate({ kind, id: x.id, blocked: false })}>
                    {x.name} <X size={13} />
                  </Chip>
                ))}
                {!items?.length && <span className="text-sm text-muted/70">None</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <PlaybackSetting />

      <PanicSetting />

      <section>
        <h2 className="mb-3 text-lg font-bold">Cache</h2>
        <CachePanel />
      </section>

      <section>
        <h2 className="text-lg font-bold">Keyboard</h2>
        <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3">
          {[
            ['/', 'Search'],
            ['Space / k', 'Play / pause'],
            ['← →', '±5 s'],
            ['j / l', '±10 s'],
            ['↑ ↓', 'Volume'],
            ['0–9', 'Jump to %'],
            ['f', 'Fullscreen'],
            ['t', 'Theater'],
            ['m', 'Mute'],
            ['< >', 'Speed'],
            ['Shift+N', 'Next video'],
            ['b', 'Mark this moment'],
            ['[ ]', 'Previous / next marker'],
            ['Esc Esc', 'Panic: leave flix'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <kbd className="rounded bg-raised px-1.5 text-xs leading-5">{k}</kbd>
              <span className="text-muted">{v}</span>
            </div>
          ))}
        </div>
      </section>

      {session.data?.required && (
        <Button onClick={() => authApi.logout().then(() => location.reload())}>Sign out</Button>
      )}
    </div>
  )
}

function BlockSearch() {
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 150)
  const { data } = useSearch(dq)
  const block = useBlock()
  const { data: list } = useBlocklist()
  const blocked = new Set([...(list?.tags ?? []), ...(list?.performers ?? []), ...(list?.studios ?? [])].map((x) => x.id))
  const hits: { kind: BlockKind; id: string; name: string; sub: string }[] = data
    ? [
        ...data.tags.map((t) => ({ kind: 'tag' as const, id: t.id, name: t.name, sub: 'Tag' })),
        ...data.performers.map((p) => ({ kind: 'performer' as const, id: p.id, name: p.name, sub: 'Performer' })),
        ...data.studios.map((s) => ({ kind: 'studio' as const, id: s.id, name: s.name, sub: 'Studio' })),
      ]
    : []
  return (
    <div className="mt-4">
      <label className="flex h-10 items-center gap-2 rounded-full bg-raised px-4 ring-1 ring-white/5 focus-within:ring-accent/60">
        <Search size={16} className="text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tag, performer or studio to block" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
      </label>
      {dq.length >= 2 && (
        <div className="mt-2 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
          {hits.map((h) => (
            <div key={`${h.kind}${h.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-white/5">
              <Link to={h.kind === 'tag' ? '/tag/$id' : h.kind === 'performer' ? '/performer/$id' : '/studio/$id'} params={{ id: h.id }} className="hover:text-accent">
                {h.name}
              </Link>
              <span className="text-xs text-muted">{h.sub}</span>
              <button
                onClick={() => block.mutate({ kind: h.kind, id: h.id, blocked: true })}
                disabled={blocked.has(h.id)}
                className="ml-auto rounded-full px-3 py-1 text-xs text-red-400 hover:bg-red-500/15 disabled:text-muted disabled:hover:bg-transparent"
              >
                {blocked.has(h.id) ? 'Blocked' : 'Block'}
              </button>
            </div>
          ))}
          {!hits.length && <div className="px-4 py-3 text-sm text-muted">No matches</div>}
        </div>
      )}
    </div>
  )
}

function PlaybackSetting() {
  const { data: settings } = useSettings()
  const save = useUpdateSettings()
  const on = !!settings?.playOnOpen
  return (
    <section>
      <h2 className="text-lg font-bold">Playback</h2>
      <label className="mt-3 flex max-w-xl cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Start playing when I open a video</span>
          <span className="mt-0.5 block text-sm text-muted">
            Off: a video’s page opens paused so you can read about it first. Play buttons, Play all and up next still start
            playback.
          </span>
        </span>
        <button
          role="switch"
          aria-checked={on}
          disabled={!settings}
          onClick={() => save.mutate({ playOnOpen: !on })}
          className={clsx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-line')}
        >
          <span className={clsx('absolute top-0.5 size-5 rounded-full bg-white transition-all', on ? 'left-5.5' : 'left-0.5')} />
        </button>
      </label>
    </section>
  )
}

function PanicSetting() {
  const { data: settings } = useSettings()
  const save = useUpdateSettings()
  const [url, setUrl] = useState<string | null>(null)
  const value = url ?? settings?.panicUrl ?? ''
  return (
    <section>
      <h2 className="text-lg font-bold">Panic key</h2>
      <p className="mt-1 text-sm text-muted">
        Press <kbd className="rounded bg-raised px-1">Esc</kbd> twice quickly anywhere in flix: video stops and the tab jumps to
        this page, replacing flix in the tab’s history.
      </p>
      <form
        className="mt-3 flex max-w-xl gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate({ panicUrl: value }, { onSuccess: () => setUrl(null) })
        }}
      >
        <input
          type="url"
          required
          value={value}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1 rounded-full bg-raised px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
        />
        <Button type="submit" disabled={url === null || save.isPending}>
          {save.isSuccess && url === null ? 'Saved' : 'Save'}
        </Button>
      </form>
      {save.isError && <div className="mt-2 text-sm text-red-400">{(save.error as Error).message}</div>}
    </section>
  )
}
