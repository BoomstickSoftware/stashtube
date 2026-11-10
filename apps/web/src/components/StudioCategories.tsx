// A studio's default categories (wiki features/studio-default-categories): shown under its
// header, edited in a sheet. flix keeps them on every video of this studio (not sub-studios).
import type { Ref, SyncRun } from '@flix/shared'
import { Link } from '@tanstack/react-router'
import { Pencil, Tags, X } from 'lucide-react'
import { useState } from 'react'
import { useSetStudioCategories, useStudioCategories, useStudioCategoriesStatus, useSyncStudioCategories } from '../lib/api'
import { CategorySearch } from './CategorySearch'
import { Sheet } from './Sheet'
import { Button, Chip, Spinner } from './ui'

export function StudioCategories({ id, name }: { id: string; name: string }) {
  const { data } = useStudioCategories(id)
  const [editing, setEditing] = useState(false)
  const tags = data?.tags ?? []
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="mr-1 text-muted">Default categories</span>
      {tags.map((t) => (
        <Link key={t.id} to="/tag/$id" params={{ id: t.id }} className="rounded-full bg-raised px-3 py-0.5 text-fg/90 hover:text-accent touch:py-2">
          {t.name}
        </Link>
      ))}
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-muted hover:bg-raised hover:text-fg touch:min-h-11 touch:px-3"
      >
        {tags.length ? <Pencil size={12} /> : <Tags size={12} />} {tags.length ? 'Edit' : 'Set'}
      </button>
      {editing && <EditSheet id={id} name={name} initial={tags} onClose={() => setEditing(false)} />}
    </div>
  )
}

function EditSheet({ id, name, initial, onClose }: { id: string; name: string; initial: Ref[]; onClose: () => void }) {
  const save = useSetStudioCategories(id)
  const [tags, setTags] = useState(initial)
  const [result, setResult] = useState<SyncRun | null>(null)
  const changed = tags.length !== initial.length || tags.some((t) => !initial.some((i) => i.id === t.id))
  return (
    <Sheet title={`Default categories · ${name}`} onClose={onClose}>
      <div className="p-4">
        {result ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center text-sm">
            <span>
              {result.error
                ? `Saved, but the sync failed: ${result.error}`
                : result.added || result.removed
                  ? `Saved. ${[result.added && `${result.added.toLocaleString()} added`, result.removed && `${result.removed.toLocaleString()} removed`].filter(Boolean).join(', ')}.`
                  : 'Saved. Every video already matched.'}
            </span>
            <button onClick={onClose} className="rounded-lg bg-raised px-4 py-2 font-semibold hover:bg-line touch:py-3">
              Done
            </button>
          </div>
        ) : (
          <>
            <CategorySearch skip={(t) => tags.some((x) => x.id === t)} onPick={(t) => setTags((x) => [...x, t])} />
            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Chip key={t.id} tone="include" onClick={() => setTags((x) => x.filter((y) => y.id !== t.id))}>
                    {t.name} <X size={12} />
                  </Chip>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted">
              flix keeps these on every video of {name}, now and as new ones arrive, but not on its sub-studios. Taking one off here
              removes it only from the videos flix added it to.
            </p>
            <button
              disabled={!changed || save.isPending}
              onClick={() => save.mutate(tags.map((t) => t.id), { onSuccess: (r) => setResult(r.lastSync) })}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold hover:bg-accent-hover disabled:bg-raised disabled:text-muted touch:py-3"
            >
              {save.isPending && <Spinner className="size-3 border" />} {save.isPending ? 'Saving and applying…' : 'Save'}
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}

// Settings › Library: every studio with default categories, the last sync and Sync now.
export function StudioCategoriesSetting() {
  const { data } = useStudioCategoriesStatus()
  const sync = useSyncStudioCategories()
  const last = data?.lastSync
  return (
    <section>
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <Tags size={20} className="text-accent" /> Studio default categories
      </h3>
      <p className="mt-1 max-w-xl text-sm text-muted">
        Categories set on a studio’s page that flix keeps on every one of its videos (not its sub-studios), after each start and each
        Stash scan. A category taken off a studio comes off only the videos flix added it to.
      </p>
      <ul className="mt-4 max-w-xl divide-y divide-line rounded-xl bg-surface">
        {data?.studios.map((s) => (
          <li key={s.id} className="px-3 py-2">
            <Link to="/studio/$id" params={{ id: s.id }} className="text-sm font-medium hover:text-accent">
              {s.name}
            </Link>
            <span className="block text-xs text-muted">{s.tags.map((t) => t.name).join(', ')}</span>
          </li>
        ))}
        {data && !data.studios.length && <li className="px-3 py-3 text-sm text-muted">None yet. Set them from a studio’s page.</li>}
        {!data && <li className="px-3 py-3 text-sm text-muted">Loading…</li>}
      </ul>
      <div className="mt-3 flex max-w-xl flex-wrap items-center gap-3 text-xs text-muted">
        <span>
          {last
            ? last.error
              ? `Last sync failed: ${last.error}`
              : `Last sync ${new Date(last.at).toLocaleString()}: ${last.added + last.removed} changes`
            : 'Synced after each start and after Stash changes.'}
        </span>
        <Button onClick={() => sync.mutate()} disabled={sync.isPending} className="ml-auto">
          {sync.isPending ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>
    </section>
  )
}
