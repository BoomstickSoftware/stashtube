import type { DeleteResult } from '@flix/shared'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useDeleteScenes } from '../lib/api'
import { Button, Spinner } from './ui'

// Confirmation before deleting videos for good: the file goes from the NAS, the scene from
// Stash, and Whisparr drops it and will not download it again. Shows per-video results.
export function DeleteScenesDialog({
  scenes,
  onClose,
  onDeleted,
}: {
  scenes: { id: string; title: string }[]
  onClose: () => void
  onDeleted: (ids: string[]) => void
}) {
  const del = useDeleteScenes()
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<DeleteResult[] | null>(null)
  const n = scenes.length
  const running = del.isPending
  const failed = results?.filter((r) => !r.ok) ?? []
  const deleted = results?.filter((r) => r.ok).map((r) => r.id) ?? []

  const close = () => {
    if (deleted.length) onDeleted(deleted)
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !running) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const run = () =>
    del.mutate({ ids: scenes.map((s) => s.id), onProgress: setProgress }, { onSuccess: (r) => setResults(r) })

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" onClick={() => !running && close()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        {results ? (
          <>
            <h2 id="delete-title" className="text-lg font-bold">
              {failed.length ? `Deleted ${deleted.length} of ${n}` : `Deleted ${n === 1 ? 'the video' : `${n} videos`}`}
            </h2>
            {failed.length > 0 && (
              <ul className="mt-3 max-h-60 space-y-2 overflow-y-auto text-sm">
                {failed.map((r) => (
                  <li key={r.id} className="rounded-lg bg-raised p-2.5">
                    <div className="font-medium break-words">{r.title ?? `Scene ${r.id}`}</div>
                    <div className="mt-0.5 text-xs break-words text-red-400">{r.error}</div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex justify-end">
              <Button variant="solid" onClick={close}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400">
                <AlertTriangle size={20} />
              </span>
              <div className="min-w-0">
                <h2 id="delete-title" className="text-lg font-bold">
                  Delete {n === 1 ? 'this video' : `${n} videos`}?
                </h2>
                <p className="mt-1 text-sm text-white/80">
                  The {n === 1 ? 'file is' : 'files are'} deleted from the NAS and removed from Stash. Whisparr drops{' '}
                  {n === 1 ? 'it' : 'them'} and won't download {n === 1 ? 'it' : 'them'} again. This can't be undone.
                </p>
              </div>
            </div>
            <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-raised p-3 text-sm">
              {scenes.map((s) => (
                <li key={s.id} className="break-words">
                  {s.title}
                </li>
              ))}
            </ul>
            {del.error && <div className="mt-3 text-sm break-words text-red-400">{del.error.message}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={close} disabled={running}>
                Cancel
              </Button>
              <button
                onClick={run}
                disabled={running}
                className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                {running ? <Spinner className="size-4 border-2" /> : <Trash2 size={16} />}
                {running ? `Deleting… ${progress}/${n}` : `Delete ${n === 1 ? 'video' : `${n} videos`}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
