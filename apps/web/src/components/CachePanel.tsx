import type { CacheScope } from '@flix/shared'
import { Database, HardDrive, RefreshCw, Server } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCacheStats, useClearCache } from '../lib/api'
import { ago, bytes } from '../lib/format'
import { Button, Spinner } from './ui'

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–')

export function CachePanel() {
  const { data: s, error } = useCacheStats()
  const clear = useClearCache()
  const run = (scope: CacheScope, what: string) => {
    if (window.confirm(`Clear ${what}? The next views fetch from Stash again.`)) clear.mutate(scope)
  }

  if (error) return <div className="text-sm text-red-400">Cache stats unavailable</div>
  if (!s) return <Spinner />

  const dataServed = s.data.hits + s.data.staleHits + s.data.coalesced
  const assetServed = s.assets.hits + s.assets.revalidated
  const sent = s.upstream.queries + s.upstream.mutations + s.upstream.assets + s.upstream.changeChecks

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        flix answers from its own cache whenever it can, so Stash only does real work: new data, writes, and video. Query
        results are dropped when you change something in flix, and within {s.changePollSeconds}s of a change made in Stash
        itself (scans, Identify, edits). Counters reset when the server restarts, last {ago(s.since)}.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card icon={<Database size={16} />} title="Query results" sub={`memory · TTL ${s.data.ttlMinutes} min`}>
          <Row k="Entries">{s.data.entries.toLocaleString()}</Row>
          <Row k="Served from cache">
            {dataServed.toLocaleString()} <span className="text-muted">({pct(dataServed, dataServed + s.data.misses)})</span>
          </Row>
          <Row k="Misses">{s.data.misses.toLocaleString()}</Row>
          <Row k="Dropped by changes">{s.data.invalidations.toLocaleString()}</Row>
        </Card>
        <Card icon={<HardDrive size={16} />} title="Images & previews" sub={`disk · TTL ${s.assets.ttlHours / 24} days`}>
          <Row k="Stored">
            {s.assets.files.toLocaleString()} files · {bytes(s.assets.bytes)}
          </Row>
          <Row k="Limit">
            {bytes(s.assets.maxBytes)} <span className="text-muted">({pct(s.assets.bytes, s.assets.maxBytes)} used)</span>
          </Row>
          <Row k="Served from disk">
            {assetServed.toLocaleString()} <span className="text-muted">({pct(assetServed, assetServed + s.assets.misses + s.assets.refetched)})</span>
          </Row>
          <Row k="Fetched">{(s.assets.misses + s.assets.refetched).toLocaleString()}</Row>
          {s.assets.staleServed > 0 && <Row k="Stale (Stash down)">{s.assets.staleServed}</Row>}
        </Card>
        <Card icon={<Server size={16} />} title="Sent to Stash" sub="since restart">
          <Row k="Queries">{s.upstream.queries.toLocaleString()}</Row>
          <Row k="Writes">{s.upstream.mutations.toLocaleString()}</Row>
          <Row k="Assets">{s.upstream.assets.toLocaleString()}</Row>
          <Row k="Change checks">{s.upstream.changeChecks.toLocaleString()}</Row>
          <Row k="Video streams">{s.upstream.streams.toLocaleString()}</Row>
          <Row k="Total (excl. video)">{sent.toLocaleString()}</Row>
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run('data', 'cached query results')} disabled={clear.isPending}>
          <RefreshCw size={15} /> Refresh data
        </Button>
        <Button onClick={() => run('assets', 'all cached images and previews')} disabled={clear.isPending}>
          <HardDrive size={15} /> Clear images & previews
        </Button>
        <Button variant="danger" onClick={() => run('all', 'every cache')} disabled={clear.isPending}>
          Clear everything
        </Button>
      </div>
    </div>
  )
}

function Card({ icon, title, sub, children }: { icon: ReactNode; title: string; sub: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-white/5">
      <div className="flex items-center gap-2 font-semibold">
        <span className="text-accent">{icon}</span> {title}
      </div>
      <div className="mb-3 text-xs text-muted">{sub}</div>
      <dl className="space-y-1 text-sm">{children}</dl>
    </div>
  )
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  )
}
