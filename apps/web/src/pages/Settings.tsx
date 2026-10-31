import type { JSX } from 'react'
import type { BlockKind, Ref } from '@flix/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Ban, ChevronRight, Search, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { CachePanel } from '../components/CachePanel'
import { FeaturedDials } from '../components/FeaturedDials'
import { PeopleControls } from '../components/People'
import { PrivacySetting } from '../components/Privacy'
import { ShortcutList } from '../components/Shortcuts'
import { Button, Chip, Switch } from '../components/ui'
import { clearLog, useDiag } from '../lib/diag'
import { useDebounced } from '../lib/hooks'
import { authApi, useBlock, useBlocklist, useSearch, useSettings, useUpdateSettings, useHiddenScenes, useHideScene } from '../lib/api'
import { KEEP_PLAYING_KEY } from '../lib/nowPlaying'
import { asBool, useStored } from '../lib/storage'
import { showToast } from '../lib/toast'
import { sized } from '@flix/shared'

export function Settings(): JSX.Element {
  const { data } = useBlocklist()
  const block = useBlock()
  const session = useQuery({ queryKey: ['session'], queryFn: authApi.session, staleTime: Infinity })

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <Link to="/cleanup" className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line hover:bg-raised">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400">
          <Trash2 size={18} />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">Clean up the library</span>
          <span className="block text-sm text-muted">Low resolution, never watched, low rated, unmatched, duplicates: select and delete</span>
        </span>
        <ChevronRight size={18} className="ml-auto shrink-0 text-muted" />
      </Link>
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

      <HiddenSetting />

      <PeopleSetting />

      <FeaturedDials />

      <PlaybackSetting />

      <PanicSetting />

      <PrivacySetting />

      <section>
        <h2 className="mb-3 text-lg font-bold">Cache</h2>
        <CachePanel />
      </section>

      <section className="touch:hidden">
        <h2 className="text-lg font-bold">Keyboard</h2>
        <p className="mt-1 text-sm text-muted">Press <kbd className="rounded bg-raised px-1">?</kbd> anywhere to see these.</p>
        <div className="mt-3">
          <ShortcutList />
        </div>
      </section>

      <Diagnostics />

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

// Videos marked "Not interested", so the mark can be undone.
function HiddenSetting() {
  const { data } = useHiddenScenes()
  const hide = useHideScene()
  if (!data?.length) return null
  return (
    <section>
      <h2 className="text-lg font-bold">Not interested</h2>
      <p className="mt-1 max-w-xl text-sm text-muted">
        Videos you marked “Not interested” (the tag <i>Not interested</i> in Stash). They stay out of every list until shown again.
      </p>
      <ul className="mt-3 max-w-xl divide-y divide-line rounded-xl bg-surface">
        {data.map((s) => (
          <li key={s.id} className="flex items-center gap-3 p-2">
            <Link to="/scene/$id" params={{ id: s.id }} className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-raised">
              <img src={sized(s.screenshot, 320)} alt="" loading="lazy" className="size-full object-cover" />
            </Link>
            <Link to="/scene/$id" params={{ id: s.id }} className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{s.title}</div>
              <div className="truncate text-xs text-muted">{[s.studio?.name, s.performers.map((p) => p.name).join(', ')].filter(Boolean).join(' · ')}</div>
            </Link>
            <Button onClick={() => hide.mutate({ id: s.id, hidden: false })}>
              Show again
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PeopleSetting() {
  const { data: settings } = useSettings()
  const save = useUpdateSettings()
  return (
    <section>
      <h2 className="text-lg font-bold">Performer preferences</h2>
      <p className="mt-1 mb-4 max-w-xl text-sm text-muted">
        Every list, the home feed and related videos keep to these: a video needs one performer (of your performer gender) who
        matches. A list’s own People filter replaces them, and “Show blocked” turns them off.
      </p>
      {settings && <PeopleControls value={settings.people ?? {}} onChange={(people) => save.mutate({ people })} />}
    </section>
  )
}

function PlaybackSetting() {
  const { data: settings } = useSettings()
  const save = useUpdateSettings()
  const on = !!settings?.playOnOpen
  const [keep, setKeep] = useStored(KEEP_PLAYING_KEY, asBool(true)) // per browser, like the other player prefs
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
        <Switch on={on} disabled={!settings} onChange={(v) => save.mutate({ playOnOpen: v })} className="mt-0.5" />
      </label>
      <label className="mt-4 flex max-w-xl cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Keep playing while browsing</span>
          <span className="mt-0.5 block text-sm text-muted">
            Leaving a video’s page docks it in a corner, still playing; tap it to go back. Off: leaving the page stops it.
          </span>
        </span>
        <Switch on={keep} onChange={setKeep} className="mt-0.5" />
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
    <section className="touch:hidden">
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

// The on-device console (lib/diag.ts): for a phone bug, reproduce it, come here, Copy.
function Diagnostics() {
  const entries = useDiag()
  const build = document.querySelector<HTMLMetaElement>('meta[name="flix-version"]')?.content ?? 'dev'
  const header = `flix ${build} · ${matchMedia('(display-mode: standalone)').matches ? 'installed app' : 'browser tab'} · ${navigator.userAgent}`
  const line = (e: { at: number; text: string }) => `${new Date(e.at).toLocaleTimeString()} ${e.text}`
  const copy = () =>
    navigator.clipboard
      .writeText([header, ...entries.map(line)].join('\n'))
      .then(() => showToast('Copied'))
      .catch(() => showToast('Could not copy'))
  return (
    <section>
      <h2 className="text-lg font-bold">Diagnostics</h2>
      <p className="mt-1 text-sm text-muted">
        What a desktop console would show: errors, page changes and where the player is, newest first. Kept in memory for this
        visit only. For a bug on the phone: make it happen, come here, Copy.
      </p>
      <div className="mt-3 flex gap-2">
        <Button onClick={copy}>Copy</Button>
        <Button onClick={clearLog}>Clear</Button>
      </div>
      <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-surface p-3 text-[11px] leading-relaxed break-all whitespace-pre-wrap ring-1 ring-line">
        {header}
        {[...entries].reverse().map((e) => `\n${line(e)}`)}
      </pre>
    </section>
  )
}
