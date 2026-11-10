import type { JSX, ReactNode } from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { BarChart3, ChevronRight, EyeOff, Heart, History, ListVideo, PlayCircle, Settings, Vault } from 'lucide-react'
import { useContinueCount, usePlaylists } from '../lib/api'

// The You tab (decisions/five-tab-navigation): what is yours rather than the library's. Each
// row opens the page it names; the pages and their URLs are unchanged.
export function You(): JSX.Element {
  const { data: unfinished } = useContinueCount()
  const { data: playlists } = usePlaylists()
  const favorites = playlists?.find((p) => p.favorites)
  const others = playlists?.filter((p) => !p.favorites).length
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-black">You</h1>
      <Group>
        <Item to="/continue" icon={<PlayCircle size={20} />} title="Continue watching" sub="Videos you started" count={unfinished} accent={!!unfinished} />
        <Item to="/history" icon={<History size={20} />} title="History" sub="Everything you played, by day" />
        <Item to="/stats" icon={<BarChart3 size={20} />} title="Stats" sub="Hours, plays and who you watch most" />
      </Group>
      <Group>
        {favorites ? (
          <Item to="/playlist/$id" params={{ id: String(favorites.id) }} icon={<Heart size={20} />} title="Favorites" sub="Videos you hearted" count={favorites.itemCount} />
        ) : null}
        <Item to="/playlists" icon={<ListVideo size={20} />} title="Playlists" sub="Lists you made" count={others} />
      </Group>
      <Group>
        <Item to="/vault" icon={<Vault size={20} />} title="Vault" sub="Unlisted: kept off Home, there when you look" />
        <Item to="/settings" hash="hidden" icon={<EyeOff size={20} />} title="Hidden and blocked" sub="What you unlisted, and what flix will not download" />
        <Item to="/settings" icon={<Settings size={20} />} title="Settings" />
      </Group>
    </div>
  )
}

function Group({ children }: { children: ReactNode }) {
  return <div className="mt-5 divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ring-line">{children}</div>
}

function Item({
  icon,
  title,
  sub,
  count,
  accent,
  ...link
}: { icon: ReactNode; title: string; sub?: string; count?: number; accent?: boolean } & Pick<LinkProps, 'to' | 'params' | 'hash'>) {
  return (
    <Link {...link} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-raised">
      <span className="shrink-0 text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
      {count !== undefined && count > 0 && (
        <span className={accent ? 'rounded-full bg-accent px-2 text-xs leading-5 font-semibold text-white tabular-nums' : 'text-sm text-muted tabular-nums'}>{count}</span>
      )}
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Link>
  )
}
