import type { DuplicateGroup, DuplicateScene } from '@flix/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { Copy, Trash2 } from 'lucide-react'
import { type JSX, useState } from 'react'
import { DeleteScenesDialog } from '../components/DeleteScenes'
import { Button, Chip, Empty, ErrorBox, Spinner } from '../components/ui'
import { useDuplicates, useFeatures } from '../lib/api'
import { bytes, duration, resolution } from '../lib/format'
import { sized } from '@flix/shared'

// Stash's perceptual-hash duplicates, side by side. The server names the copy to keep (most
// pixels, then bit rate, then size, then the one already watched) and pre-selects the rest;
// every tick here is an override on that suggestion until Delete or Reset.
const DISTANCES = [
  { label: 'Exact', hint: 'identical hashes', value: 0 },
  { label: 'Close', hint: 'a few bits apart: the same encode, trimmed or re-muxed', value: 4 },
  { label: 'Loose', hint: 'likely re-encodes; check before deleting', value: 8 },
]
const TOLERANCES = [
  { label: 'Any length', value: -1 },
  { label: '±1 s', value: 1 },
  { label: '±5 s', value: 5 },
  { label: '±30 s', value: 30 },
]

export function Duplicates(): JSX.Element {
  const [distance, setDistance] = useState(0)
  const [tolerance, setTolerance] = useState(-1)
  const { data, isPending, error } = useDuplicates(distance, tolerance)
  const { data: features } = useFeatures()
  const canDelete = !!features?.deleteScenes
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [deleting, setDeleting] = useState(false)
  const qc = useQueryClient()

  const groups = data?.groups ?? []
  const suggested = new Set(groups.flatMap((g) => g.suggested))
  const isSelected = (id: string) => picked[id] ?? suggested.has(id)
  const selected = groups.flatMap((g) => g.scenes).filter((s) => isSelected(s.id))
  const frees = selected.reduce((a, s) => a + s.size, 0)
  const toggle = (id: string) => setPicked((p) => ({ ...p, [id]: !isSelected(id) }))
  const setGroup = (g: DuplicateGroup, mode: 'suggested' | 'none') =>
    setPicked((p) => {
      const next = { ...p }
      for (const s of g.scenes) {
        if (mode === 'suggested') delete next[s.id]
        else next[s.id] = false
      }
      return next
    })

  return (
    <div className={clsx(canDelete && selected.length > 0 && 'pb-24')}>
      <section className="mb-5">
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
          <Copy size={26} className="text-amber-400" /> Duplicates
        </h1>
        <p className="mt-1 text-sm text-muted">
          Videos Stash's perceptual hashes say are the same. The best copy is marked Keep and the rest are selected; untick
          anything you want to leave, then Delete. Blocked and hidden videos are included.{' '}
          <Link to="/cleanup" className="text-fg underline-offset-2 hover:underline">
            Other clean-up lists
          </Link>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {DISTANCES.map((d) => (
            <Chip key={d.value} tone={distance === d.value ? 'active' : 'default'} onClick={() => setDistance(d.value)}>
              <span title={d.hint}>{d.label}</span>
            </Chip>
          ))}
          <span className="mx-1 hidden self-center text-line sm:inline">|</span>
          {TOLERANCES.map((t) => (
            <Chip key={t.value} tone={tolerance === t.value ? 'active' : 'default'} onClick={() => setTolerance(t.value)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </section>

      {features && !canDelete && <Empty>Deleting needs Whisparr: set WHISPARR_URL and WHISPARR_API_KEY on the server. Groups are listed anyway.</Empty>}

      {error ? (
        <ErrorBox error={error} />
      ) : isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <Empty>No duplicates at this distance{distance < 8 ? '. Try Close or Loose for re-encodes.' : '.'}</Empty>
      ) : (
        <div className="space-y-8">
          <p className="text-sm text-muted">
            {groups.length} {groups.length === 1 ? 'group' : 'groups'} · {groups.reduce((a, g) => a + g.scenes.length, 0)} videos
          </p>
          {groups.map((g) => (
            <section key={g.keep}>
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold">
                  {g.scenes.length} copies · {bytes(g.scenes.reduce((a, s) => a + s.size, 0))}
                </span>
                {canDelete && (
                  <span className="ml-auto flex gap-1">
                    <Chip onClick={() => setGroup(g, 'suggested')}>Select suggested</Chip>
                    <Chip onClick={() => setGroup(g, 'none')}>Clear</Chip>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {g.scenes.map((s) => (
                  <CopyCard key={s.id} scene={s} keep={s.id === g.keep} selected={isSelected(s.id)} canDelete={canDelete} onToggle={() => toggle(s.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {canDelete && selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--dock-h))] z-(--z-bulk) flex justify-center px-4 lg:bottom-6">
          <div className="flex items-center gap-3 rounded-full bg-surface px-4 py-2 shadow-2xl ring-1 ring-white/10">
            <span className="text-sm">
              <span className="font-semibold">{selected.length}</span> {selected.length === 1 ? 'video' : 'videos'} · frees {bytes(frees)}
            </span>
            <Button variant="ghost" onClick={() => setPicked({})}>
              Reset
            </Button>
            <Button variant="danger" onClick={() => setDeleting(true)}>
              <Trash2 size={16} /> Delete…
            </Button>
          </div>
        </div>
      )}

      {deleting && (
        <DeleteScenesDialog
          scenes={selected.map((s) => ({ id: s.id, title: s.title, size: s.size }))}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setPicked({})
            qc.invalidateQueries({ queryKey: ['duplicates'] })
          }}
        />
      )}
    </div>
  )
}

function CopyCard({ scene: s, keep, selected, canDelete, onToggle }: { scene: DuplicateScene; keep: boolean; selected: boolean; canDelete: boolean; onToggle: () => void }) {
  return (
    <div className={clsx('overflow-hidden rounded-xl bg-surface ring-1', selected ? 'ring-red-500/60' : keep ? 'ring-emerald-500/50' : 'ring-line')}>
      <Link to="/scene/$id" params={{ id: s.id }} className="block">
        <div className="relative aspect-video bg-raised">
          {s.screenshot && <img src={sized(s.screenshot, 320)} alt="" loading="lazy" className="size-full object-cover" />}
          <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[11px] tabular-nums">{duration(s.durationSec)}</span>
          {keep && <span className="absolute top-1 left-1 rounded bg-emerald-500/90 px-1.5 text-[11px] font-semibold text-black">Keep</span>}
        </div>
      </Link>
      <div className="space-y-0.5 p-2 text-xs">
        <div className="truncate font-medium" title={s.title}>
          {s.title}
        </div>
        <div className="text-muted">
          {resolution(s.height) ?? `${s.height}p`} · {mbps(s.file.bitrate)} · {bytes(s.size)}
        </div>
        <div className="text-muted">
          {s.file.videoCodec || '?'} · {s.playCount} {s.playCount === 1 ? 'play' : 'plays'}
          {s.rating ? ` · ★${s.rating}` : ''}
        </div>
        <div className="truncate text-muted/70" title={s.file.path}>
          {tail(s.file.path)}
        </div>
        {canDelete && (
          <label className="mt-1.5 flex cursor-pointer items-center gap-2 select-none">
            <input type="checkbox" checked={selected} onChange={onToggle} className="size-4 accent-red-500" />
            <span className={selected ? 'text-red-400' : 'text-muted'}>{selected ? 'Delete' : 'Leave'}</span>
          </label>
        )}
      </div>
    </div>
  )
}

const mbps = (bitsPerSecond: number) => (bitsPerSecond ? `${(bitsPerSecond / 1e6).toFixed(1)} Mb/s` : '? Mb/s')
const tail = (path: string) => path.split('/').slice(-2).join('/')
