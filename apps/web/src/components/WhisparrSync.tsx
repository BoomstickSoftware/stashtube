import type { SyncItem } from '@flix/shared'
import type { JSX } from 'react'
import { Radar, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useFeatures, usePerformerWatch, useRunSync, useSettings, useSyncStatus, useUpdateSettings } from '../lib/api'
import { ago } from '../lib/format'
import { Button, Switch } from './ui'

// Settings → Library: the follow sync (server sync.ts). On: Whisparr watches the new releases of
// every followed performer, and nothing blocked stays monitored. Off: the sync only plans, and
// this shows what it would do. Hidden without Whisparr.
export function WhisparrSyncSetting(): JSX.Element | null {
  const { data: features } = useFeatures()
  const { data: settings } = useSettings()
  const save = useUpdateSettings()
  const { data: s } = useSyncStatus()
  const run = useRunSync()
  const [all, setAll] = useState(false)
  if (!features?.whisparr) return null
  const on = !!settings?.whisparrSync
  const changes = s?.items.filter((i) => i.action === 'monitor' || i.action === 'adopt' || i.action === 'unmonitor') ?? []
  const hands = s?.items.filter((i) => i.action === 'missing' || i.action === 'unmanaged') ?? []
  const shown = all ? hands : hands.slice(0, 5)
  return (
    <section>
      <label className="flex max-w-xl cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="flex items-center gap-2 text-sm font-medium">
            <Radar size={16} className="text-accent" /> Watch followed performers for new scenes
          </span>
          <span className="mt-0.5 block text-sm text-muted">
            Whisparr monitors the new releases of everyone you follow, never their older scenes and never with a search, and
            anything you block is unmonitored. Off: flix only shows what it would change.
          </span>
        </span>
        <Switch on={on} disabled={!settings} onChange={(v) => save.mutate({ whisparrSync: v })} className="mt-0.5" />
      </label>
      {s && (
        <div className="mt-3 max-w-xl rounded-2xl bg-surface p-4 text-sm ring-1 ring-line">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">
                {s.running ? 'Checking Whisparr…' : s.lastRun ? `Last checked ${ago(s.lastRun)}` : 'Not checked yet'}
                {s.managed > 0 && <span className="text-muted"> · watching {s.managed}</span>}
              </div>
              {s.detail && <div className={s.outcome === 'failed' || s.outcome === 'skipped' ? 'mt-0.5 text-amber-300' : 'mt-0.5 text-muted'}>{s.detail}</div>}
            </div>
            <Button onClick={() => run.mutate()} disabled={s.running || run.isPending} title="Check Whisparr now">
              <RefreshCw size={14} className={s.running || run.isPending ? 'animate-spin' : ''} /> Check now
            </Button>
          </div>
          {changes.length > 0 && <Items title={s.outcome === 'applied' || s.outcome === 'failed' ? 'Changed' : 'Would change'} items={changes} />}
          {hands.length > 0 && (
            <>
              <Items title="Needs a hand in Whisparr" items={shown} />
              {hands.length > shown.length && (
                <button className="mt-1 text-xs text-muted underline hover:text-fg" onClick={() => setAll(true)}>
                  {hands.length - shown.length} more
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

const VERB: Record<SyncItem['action'], string> = { monitor: 'Watch', adopt: 'Keep watching', unmonitor: 'Stop', missing: 'Not in Whisparr', unmanaged: 'Set by hand' }

function Items({ title, items }: { title: string; items: SyncItem[] }) {
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</div>
      <ul className="mt-1 space-y-1">
        {items.map((i) => (
          <li key={`${i.kind}:${i.name}:${i.action}`} className="flex min-w-0 gap-2">
            <span className="w-28 shrink-0 text-muted">{VERB[i.action]}</span>
            <span className="min-w-0">
              <span className="font-medium">{i.name}</span>
              {i.kind === 'studio' && <span className="text-muted"> (studio)</span>}
              <span className="block text-xs text-muted">{i.error ? `failed: ${i.error}` : i.reason}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// A performer page's line under the facts: "Watching for new scenes · 2 downloading".
export function WatchLine({ id }: { id: string }): JSX.Element | null {
  const { data } = usePerformerWatch(id)
  if (!data || (!data.watching && !data.downloading)) return null
  const parts = [
    data.watching && (data.managed ? 'Watching for new scenes' : 'Watched for new scenes in Whisparr'),
    data.downloading > 0 && `${data.downloading} downloading`,
  ].filter(Boolean)
  return (
    <div className="mt-2 flex items-center gap-1.5 text-sm text-accent">
      <Radar size={14} className="shrink-0" />
      <span>{parts.join(' · ')}</span>
    </div>
  )
}
