import type { SavedRow } from '@flix/shared'
import { ArrowDown, ArrowUp, Check, Pencil, PinOff, Rows3 } from 'lucide-react'
import { useState } from 'react'
import { useRowMutations, useRows } from '../lib/api'
import { showToast } from '../lib/toast'
import { QuerySummary } from './QuerySummary'

// Settings › Feed › Home rows (decisions/five-tab-navigation): every row pinned from a list, in
// Home's order, to rename, move or unpin in one place. Home's rows keep their own controls too.
export function ManageRows() {
  const { data: rows } = useRows()
  const m = useRowMutations()
  const move = (i: number, by: number) => {
    if (!rows) return
    const ids = rows.map((r) => r.id)
    ;[ids[i], ids[i + by]] = [ids[i + by], ids[i]]
    m.reorder.mutate(ids)
  }
  const unpin = (r: SavedRow) =>
    m.unpin.mutate(r.id, {
      onSuccess: () =>
        showToast(
          `Unpinned “${r.title}”`,
          <button onClick={() => m.pin.mutate({ title: r.title, query: r.query })} className="rounded-full bg-raised px-3 py-1 text-xs font-semibold hover:bg-line">
            Undo
          </button>,
        ),
    })
  return (
    <section id="home-rows" className="scroll-mt-32">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <Rows3 size={20} className="text-accent" /> Home rows
      </h3>
      <p className="mt-1 max-w-xl text-sm text-muted">Rows you pinned from a list (its filter bar’s Pin to Home), in the order Home shows them.</p>
      {rows && !rows.length ? (
        <p className="mt-3 text-sm text-muted/70">None pinned yet.</p>
      ) : (
        <ul className="mt-3 max-w-xl divide-y divide-line rounded-xl bg-surface">
          {rows?.map((r, i) => (
            <RowItem key={r.id} row={r} first={i === 0} last={i === rows.length - 1} onMove={(by) => move(i, by)} onUnpin={() => unpin(r)} />
          ))}
        </ul>
      )}
    </section>
  )
}

function RowItem({ row, first, last, onMove, onUnpin }: { row: SavedRow; first: boolean; last: boolean; onMove: (by: number) => void; onUnpin: () => void }) {
  const m = useRowMutations()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(row.title)
  const btn = 'rounded-full p-2 text-muted hover:bg-raised hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent touch:size-11 touch:flex touch:items-center touch:justify-center touch:p-0'
  const save = () => {
    if (title.trim() && title.trim() !== row.title) m.rename.mutate({ id: row.id, title: title.trim() })
    setEditing(false)
  }
  return (
    <li className="flex items-center gap-1 py-1 pr-1 pl-3">
      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={save}
            aria-label="Row title"
            className="min-w-0 flex-1 rounded-lg bg-raised px-2 py-1.5 text-base outline-none focus:ring-1 focus:ring-accent/60 sm:text-sm"
          />
          <button type="submit" className={btn} aria-label="Save title">
            <Check size={16} />
          </button>
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{row.title}</span>
            <span className="block truncate text-xs text-muted">
              <QuerySummary query={row.query} />
            </span>
          </span>
          <button className={btn} onClick={() => setEditing(true)} aria-label={`Rename ${row.title}`} title="Rename">
            <Pencil size={15} />
          </button>
        </>
      )}
      <button className={btn} disabled={first} onClick={() => onMove(-1)} aria-label="Move up" title="Move up">
        <ArrowUp size={15} />
      </button>
      <button className={btn} disabled={last} onClick={() => onMove(1)} aria-label="Move down" title="Move down">
        <ArrowDown size={15} />
      </button>
      <button className={btn} onClick={onUnpin} aria-label={`Unpin ${row.title}`} title="Unpin">
        <PinOff size={15} />
      </button>
    </li>
  )
}
