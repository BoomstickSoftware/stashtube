import type { JSX, ReactNode } from 'react'
import clsx from 'clsx'
import type { BlockKind, Ref } from '@flix/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Ban, ChevronRight, Copy, EyeOff, Search, Trash2, Users, Vault as VaultIcon, X } from 'lucide-react'
import { useState } from 'react'
import { CachePanel } from '../components/CachePanel'
import { FeaturedDials } from '../components/FeaturedDials'
import { ManageRows } from '../components/ManageRows'
import { PeopleControls } from '../components/People'
import { PrivacySetting } from '../components/Privacy'
import { ShortcutList } from '../components/Shortcuts'
import { StudioCategoriesSetting } from '../components/StudioCategories'
import { WhisparrSyncSetting } from '../components/WhisparrSync'
import { Button, Chip, Switch } from '../components/ui'
import { clearLog, useDiag } from '../lib/diag'
import { useDebounced } from '../lib/hooks'
import { authApi, useBlock, useBlocklist, useCast, useSearch, useSyncCast, useSetSceneCast, useSettings, useUnlist, useUnlisted, useUnlistedScenes, useUnlistScene, useUpdateSettings } from '../lib/api'
import { castText } from '../lib/cast'
import { KEEP_PLAYING_KEY } from '../lib/nowPlaying'
import { asBool, useStored } from '../lib/storage'
import { showToast } from '../lib/toast'
import { sized } from '@flix/shared'

// One page in five headed groups, with a strip of in-page links that stays under the header:
// Library (the tools and the lists that shape it), Feed, Playback, Privacy, Advanced. Device-only
// settings (Keep playing, Discreet, the PIN) sit beside the shared ones; what a setting changes
// elsewhere stays next to that page (the player's gear menu, the Performers switch).
const GROUPS = [
  ['library', 'Library'],
  ['feed', 'Feed'],
  ['playback', 'Playback'],
  ['privacy', 'Privacy'],
  ['advanced', 'Advanced'],
] as const

export function Settings(): JSX.Element {
  const session = useQuery({ queryKey: ['session'], queryFn: authApi.session, staleTime: Infinity })

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-black">Settings</h1>
      <nav
        aria-label="Settings sections"
        className="no-scrollbar sticky top-16 z-10 -mx-4 mt-3 flex gap-2 overflow-x-auto bg-bg/85 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6"
      >
        {GROUPS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="inline-flex shrink-0 items-center rounded-full bg-raised px-3 py-1 text-[13px] whitespace-nowrap text-fg/90 hover:bg-line touch:min-h-11"
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="mt-6 space-y-14">
        <Group id="library" title="Library">
          <LibraryTools />
          <WhisparrSyncSetting />
          <HideVrSetting />
          <CastSetting />
          <StudioCategoriesSetting />
          <HiddenSetting />
        </Group>
        <Group id="feed" title="Feed">
          <PeopleSetting />
          <FeaturedDials />
          <ManageRows />
        </Group>
        <Group id="playback" title="Playback">
          <PlaybackSetting />
        </Group>
        <Group id="privacy" title="Privacy">
          <PrivacySetting />
        </Group>
        <Group id="advanced" title="Advanced">
          <PanicSetting />
          <section className="touch:hidden">
            <h3 className="text-lg font-bold">Keyboard</h3>
            <p className="mt-1 text-sm text-muted">
              Press <kbd className="rounded bg-raised px-1">?</kbd> anywhere to see these.
            </p>
            <div className="mt-3">
              <ShortcutList />
            </div>
          </section>
          <section>
            <h3 className="mb-3 text-lg font-bold">Cache</h3>
            <CachePanel />
          </section>
          <Diagnostics />
          {session.data?.required && <Button onClick={() => authApi.logout().then(() => location.reload())}>Sign out</Button>}
        </Group>
      </div>
    </div>
  )
}

// A headed group the strip links to; `scroll-mt` keeps the heading clear of the header and strip.
function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-32 space-y-10">
      <h2 id={`${id}-heading`} className="border-b border-line pb-2 text-xl font-black">
        {title}
      </h2>
      {children}
    </section>
  )
}

// The two pages that only live here: Clean up and Duplicates.
function LibraryTools() {
  const card = 'flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line hover:bg-raised'
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Link to="/cleanup" className={card}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400">
          <Trash2 size={18} />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">Clean up</span>
          <span className="block text-sm text-muted">
            Find low-resolution, never-watched, low-rated, unmatched or duplicate videos and delete them
          </span>
        </span>
        <ChevronRight size={18} className="ml-auto shrink-0 text-muted" />
      </Link>
      <Link to="/duplicates" className={card}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
          <Copy size={18} />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">Duplicates</span>
          <span className="block text-sm text-muted">The same video more than once, side by side, the worse copy pre-selected</span>
        </span>
        <ChevronRight size={18} className="ml-auto shrink-0 text-muted" />
      </Link>
    </div>
  )
}

// Cast (wiki features/cast): each mix of performers, how many videos it holds, and whether it
// shows normally, is Unlisted or is Blocked (the category's own block and unlist).
const MIX_LABEL: Record<string, string> = {
  'Cast: F': 'Women only',
  'Cast: M': 'Men only',
  'Cast: X': 'Other only',
  'Cast: F+M': 'Women & men',
  'Cast: F+X': 'Women & other',
  'Cast: M+X': 'Men & other',
  'Cast: F+M+X': 'Women, men & other',
  'Cast: Unknown': 'Unknown',
}
function CastSetting() {
  const { data } = useCast()
  const sync = useSyncCast()
  const setCast = useSetSceneCast()
  const { data: blocked } = useBlocklist()
  const { data: unl } = useUnlisted()
  const block = useBlock()
  const unlist = useUnlist()
  // Normal or Unlisted only: Block stops downloads, and the StashDB scenes Discover offers carry no
  // Cast categories, so a block here would do nothing. Either choice clears an old block.
  const level = (id: string) => (unl?.tags.some((t) => t.id === id) ? 'unlisted' : 'normal')
  const setLevel = (id: string, to: 'normal' | 'unlisted') => {
    if (blocked?.tags.some((t) => t.id === id)) block.mutate({ kind: 'tag', id, blocked: false })
    if (to !== level(id)) unlist.mutate({ kind: 'tag', id, unlisted: to === 'unlisted' })
  }
  const last = data?.lastSync
  return (
    <section>
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <Users size={20} className="text-accent" /> Cast
      </h3>
      <p className="mt-1 max-w-xl text-sm text-muted">
        flix files every video by who is in it, from the performers’ gender in Stash: women (F), men (M) and everyone else (X: trans,
        non-binary, intersex). Each video gets one mix below plus counts (“Cast: Women 2+”) to filter by in Browse. Unknown: no
        performers yet, or one without a gender. These are Stash categories flix keeps up to date.
      </p>
      <ul className="mt-4 max-w-xl divide-y divide-line rounded-xl bg-surface">
        {data?.mixes.map((m) => {
          const now = level(m.id)
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
              <Link to="/tag/$id" params={{ id: m.id }} className="min-w-0 flex-1 hover:text-accent">
                <span className="block text-sm font-medium">{MIX_LABEL[m.name] ?? m.name}</span>
                <span className="block text-xs text-muted">
                  {m.name} · {m.scenes.toLocaleString()} videos
                </span>
              </Link>
              <div role="radiogroup" aria-label={`${MIX_LABEL[m.name] ?? m.name}: how it shows`} className="flex shrink-0 rounded-full bg-raised p-0.5 text-[13px]">
                {(['normal', 'unlisted'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={now === l}
                    onClick={() => setLevel(m.id, l)}
                    className={clsx(
                      'rounded-full px-3 py-1 capitalize touch:min-h-11 touch:px-3.5',
                      now === l ? 'bg-white text-black' : 'text-muted hover:text-fg',
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
        {!data && <li className="px-3 py-3 text-sm text-muted">Loading…</li>}
      </ul>
      {!!data?.overrides.length && (
        <>
          <h4 className="mt-5 text-sm font-semibold">Set by hand</h4>
          <p className="mt-0.5 max-w-xl text-xs text-muted">Videos whose cast you set on their page because Stash’s performers missed someone.</p>
          <ul className="mt-2 max-w-xl divide-y divide-line rounded-xl bg-surface">
            {data.overrides.map((o) => (
              <li key={o.sceneId} className="flex items-center gap-3 px-3 py-2">
                <Link to="/scene/$id" params={{ id: o.sceneId }} className="min-w-0 flex-1 hover:text-accent">
                  <span className="block truncate text-sm font-medium">{o.title || `Video ${o.sceneId}`}</span>
                  <span className="block text-xs text-muted">{castText(o)}</span>
                </Link>
                <Button onClick={() => setCast.mutate({ id: o.sceneId, cast: null })} disabled={setCast.isPending} className="shrink-0">
                  Use performers
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-3 flex max-w-xl flex-wrap items-center gap-3 text-xs text-muted">
        <span>
          {last
            ? last.error
              ? `Last sync failed: ${last.error}`
              : `Last sync ${new Date(last.at).toLocaleString()}: ${last.scenes.toLocaleString()} videos, ${last.added + last.removed} changes`
            : 'Synced after each start and after Stash changes.'}
        </span>
        <Button onClick={() => sync.mutate()} disabled={sync.isPending} className="ml-auto">
          {sync.isPending ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>
    </section>
  )
}

// Discover's VR filter (shared; on by default): a scene whose title, category or studio says VR.
function HideVrSetting() {
  const { data: settings } = useSettings()
  const save = useUpdateSettings()
  return (
    <section>
      <label className="flex max-w-xl cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Leave VR scenes out of Discover</span>
          <span className="mt-0.5 block text-sm text-muted">
            A StashDB scene counts as VR when its title or a category says so ([VR], VR, Virtual Reality, 180°, 360°) or its studio’s
            name carries VR or starts with “Virtual”. “Show blocked & VR” on Discover brings them back for that view.
          </span>
        </span>
        <Switch on={settings?.hideVr ?? true} disabled={!settings} onChange={(v) => save.mutate({ hideVr: v })} className="mt-0.5" />
      </label>
    </section>
  )
}

// Unlisted (wiki features/vault): find a category, performer or studio to unlist; remove one with
// its chip's ×; the videos unlisted by hand below, to undo.
type Marks = { tags: Ref[]; performers: Ref[]; studios: Ref[] }
const idsOf = (m?: Marks) => new Set([...(m?.tags ?? []), ...(m?.performers ?? []), ...(m?.studios ?? [])].map((x) => x.id))

// One place for the two ways to keep something out of sight (decisions/hide-means-delete-block-or-unlist):
// Unlist keeps what you have off the views flix picks for you, Block stops it being downloaded.
// They are independent, so one performer can be both. "Not interested" is a delete, not a mark.
function HiddenSetting() {
  const { data: u } = useUnlisted()
  const unlist = useUnlist()
  const { data: b } = useBlocklist()
  const block = useBlock()
  const { data: scenes } = useUnlistedScenes()
  const unlistScene = useUnlistScene()
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 150)
  const { data: found } = useSearch(dq)
  const unlisted = idsOf(u)
  const blocked = idsOf(b)
  const hits: { kind: BlockKind; id: string; name: string; sub: string }[] = found
    ? [
        ...found.tags.map((t) => ({ kind: 'tag' as const, id: t.id, name: t.name, sub: 'Category' })),
        ...found.performers.map((p) => ({ kind: 'performer' as const, id: p.id, name: p.name, sub: 'Performer' })),
        ...found.studios.map((s) => ({ kind: 'studio' as const, id: s.id, name: s.name, sub: 'Studio' })),
      ]
    : []
  const mark = 'shrink-0 rounded-full px-3 py-1 text-xs disabled:text-muted disabled:hover:bg-transparent touch:min-h-11'
  return (
    <section id="hidden" className="scroll-mt-32">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <EyeOff size={20} className="text-accent" /> Hidden
      </h3>
      <div className="mt-1 max-w-xl space-y-1 text-sm text-muted">
        <p>
          <b className="text-fg">Unlist</b> keeps the videos you have off Home, Featured, stations and recommendations. Browse, search
          and the <Link to="/vault" className="text-fg underline decoration-line underline-offset-2 hover:text-accent">Vault</Link> still
          show them.
        </p>
        <p>
          <b className="text-fg">Block</b> stops flix downloading more: kept out of Discover, the not-downloaded row on Home and the
          automatic Gets. Videos you already have show as normal.
        </p>
        <p>To be rid of a video, delete it: “Not interested” on its menu.</p>
      </div>
      <label className="mt-4 flex h-10 items-center gap-2 rounded-full bg-raised px-4 ring-1 ring-white/5 focus-within:ring-accent/60 touch:h-11">
        <Search size={16} className="text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a category, performer or studio"
          className="w-full bg-transparent text-base outline-none placeholder:text-muted sm:text-sm"
        />
      </label>
      {dq.length >= 2 && (
        <div className="mt-2 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
          {hits.map((h) => (
            <div key={`${h.kind}${h.id}`} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-white/5">
              <Link to={h.kind === 'tag' ? '/tag/$id' : h.kind === 'performer' ? '/performer/$id' : '/studio/$id'} params={{ id: h.id }} className="min-w-0 truncate hover:text-accent">
                {h.name}
              </Link>
              <span className="shrink-0 text-xs text-muted">{h.sub}</span>
              <button
                onClick={() => unlist.mutate({ kind: h.kind, id: h.id, unlisted: true })}
                disabled={unlisted.has(h.id)}
                className={clsx(mark, 'ml-auto text-accent hover:bg-accent/15')}
              >
                {unlisted.has(h.id) ? 'Unlisted' : 'Unlist'}
              </button>
              <button
                onClick={() => block.mutate({ kind: h.kind, id: h.id, blocked: true })}
                disabled={blocked.has(h.id)}
                className={clsx(mark, 'text-red-400 hover:bg-red-500/15')}
              >
                {blocked.has(h.id) ? 'Blocked' : 'Block'}
              </button>
            </div>
          ))}
          {!hits.length && <div className="px-4 py-3 text-sm text-muted">No matches</div>}
        </div>
      )}
      <h4 className="mt-6 flex items-center gap-2 font-semibold">
        <VaultIcon size={16} className="text-accent" /> Unlisted
      </h4>
      <MarkLists marks={u} tone="include" verb="Show" onRemove={(kind, id) => unlist.mutate({ kind, id, unlisted: false })} />
      {!!scenes?.length && (
        <div className="mt-4">
          <h5 className="mb-2 text-sm font-semibold text-muted">
            Videos unlisted one by one <span className="font-normal">({scenes.length})</span>
          </h5>
          <ul className="max-w-xl divide-y divide-line rounded-xl bg-surface">
            {scenes.map((s) => (
              <li key={s.id} className="flex items-center gap-3 p-2">
                <Link to="/scene/$id" params={{ id: s.id }} className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-raised">
                  <img src={sized(s.screenshot, 320)} alt="" loading="lazy" className="size-full object-cover" />
                </Link>
                <Link to="/scene/$id" params={{ id: s.id }} className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.title}</div>
                  <div className="truncate text-xs text-muted">{[s.studio?.name, s.performers.map((p) => p.name).join(', ')].filter(Boolean).join(' · ')}</div>
                </Link>
                <Button onClick={() => unlistScene.mutate({ id: s.id, unlisted: false })}>Show again</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <h4 className="mt-6 flex items-center gap-2 font-semibold">
        <Ban size={16} className="text-red-400" /> Blocked from downloading
      </h4>
      <MarkLists marks={b} tone="exclude" verb="Unblock" onRemove={(kind, id) => block.mutate({ kind, id, blocked: false })} />
    </section>
  )
}

function MarkLists({ marks, tone, verb, onRemove }: { marks?: Marks; tone: 'include' | 'exclude'; verb: string; onRemove: (kind: BlockKind, id: string) => void }) {
  return (
    <div className="mt-2 space-y-4">
      {(
        [
          ['tag', 'Categories', marks?.tags],
          ['performer', 'Performers', marks?.performers],
          ['studio', 'Studios', marks?.studios],
        ] as [BlockKind, string, Ref[] | undefined][]
      ).map(([kind, label, items]) => (
        <div key={kind}>
          <h5 className="mb-2 text-sm font-semibold text-muted">
            {label} <span className="font-normal">({items?.length ?? 0})</span>
          </h5>
          <div className="flex flex-wrap gap-2">
            {items?.map((x) => (
              <Chip key={x.id} tone={tone} onClick={() => onRemove(kind, x.id)}>
                {x.name} <X size={13} aria-label={`${verb} ${x.name}`} />
              </Chip>
            ))}
            {!items?.length && <span className="text-sm text-muted/70">None</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function PeopleSetting() {
  const { data: settings } = useSettings()
  const save = useUpdateSettings()
  return (
    <section>
      <h3 className="text-lg font-bold">Performer preferences</h3>
      <p className="mt-1 mb-4 max-w-xl text-sm text-muted">
        Every list, the home feed and related videos keep to these: a video needs one performer who matches. A list’s own
        People filter replaces them, and “Show blocked” turns them off.
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
      <label className="flex max-w-xl cursor-pointer items-start justify-between gap-4">
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
            Leaving a video’s page docks it in a corner, still playing; click or tap it to go back. Off: leaving the page stops it.
          </span>
        </span>
        <Switch on={keep} onChange={setKeep} className="mt-0.5" />
      </label>
      <p className="mt-4 max-w-xl text-sm text-muted">Quality, speed and a studio’s intro skip are in the player’s gear menu.</p>
    </section>
  )
}

// Desktop only (touch:hidden): Esc twice has no touch equivalent.
function PanicSetting() {
  const { data: settings } = useSettings()
  const save = useUpdateSettings()
  const [url, setUrl] = useState<string | null>(null)
  const value = url ?? settings?.panicUrl ?? ''
  return (
    <section className="touch:hidden">
      <h3 className="text-lg font-bold">Panic key</h3>
      <p className="mt-1 text-sm text-muted">
        Press <kbd className="rounded bg-raised px-1">Esc</kbd> twice quickly anywhere in flix: video stops and the tab jumps to
        this page, replacing flix in the tab’s history.
      </p>
      <form
        className="mt-3 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate({ panicUrl: value }, { onSuccess: () => setUrl(null) })
        }}
      >
        <label htmlFor="panic-url" className="block text-sm font-medium">
          Go to
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="panic-url"
            type="url"
            required
            value={value}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            className="min-w-0 flex-1 rounded-full bg-raised px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
          />
          <Button type="submit" disabled={url === null || save.isPending}>
            {save.isSuccess && url === null ? 'Saved' : 'Save'}
          </Button>
        </div>
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
      <h3 className="text-lg font-bold">Diagnostics</h3>
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
