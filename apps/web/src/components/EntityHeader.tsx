import type { BlockKind } from '@flix/shared'
import clsx from 'clsx'
import { Ban, Heart } from 'lucide-react'
import type { ReactNode } from 'react'
import { useBlock, useIsBlocked } from '../lib/api'
import { showToast } from '../lib/toast'
import { bone, Button } from './ui'

// A row of button-shaped bones, the size of the real Follow / filter / Block pills.
function ButtonBones({ className }: { className?: string }) {
  return (
    <div className={clsx('flex flex-wrap gap-2', className)} aria-hidden>
      <div className={clsx(bone, 'h-9 w-28 rounded-full')} />
      <div className={clsx(bone, 'h-9 w-32 rounded-full')} />
      <div className={clsx(bone, 'h-9 w-24 rounded-full')} />
    </div>
  )
}

// The header's shape while the record loads: the same blocks as the real one (picture, name,
// facts line, button row) so the grid underneath starts at once and nothing moves when the name
// arrives. `performer` is the hero with a portrait; `studio` the logo tile; `tag` the eyebrow;
// `playlist` the cover card that is the playlist page's left column.
export function HeaderSkeleton({ shape }: { shape: 'performer' | 'studio' | 'tag' | 'playlist' }) {
  if (shape === 'playlist') {
    return (
      <section role="status" aria-label="Loading" className="rounded-3xl bg-gradient-to-b from-accent/30 to-surface p-5">
        <div className={clsx(bone, 'aspect-video w-full rounded-xl')} />
        <div className={clsx(bone, 'mt-4 h-8 w-48 max-w-full')} />
        <div className={clsx(bone, 'mt-2 h-4 w-32')} />
        <ButtonBones className="mt-5" />
      </section>
    )
  }
  if (shape === 'performer') {
    return (
      <section role="status" aria-label="Loading" className="relative -mx-4 -mt-6 mb-6 overflow-hidden sm:-mx-6">
        <div className="relative mx-auto flex max-w-[1920px] flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:px-6">
          <div className={clsx(bone, 'aspect-[3/4] w-40 shrink-0 rounded-2xl sm:w-52')} />
          <div className="min-w-0 flex-1">
            <div className={clsx(bone, 'h-9 w-64 max-w-full sm:h-12 sm:w-96')} />
            <div className={clsx(bone, 'mt-4 h-4 w-72 max-w-full')} />
            <ButtonBones className="mt-5" />
          </div>
        </div>
      </section>
    )
  }
  if (shape === 'studio') {
    return (
      <section role="status" aria-label="Loading" className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className={clsx(bone, 'h-28 w-56 shrink-0 rounded-2xl')} />
        <div className="min-w-0">
          <div className={clsx(bone, 'h-9 w-56 sm:h-10 sm:w-72')} />
          <div className={clsx(bone, 'mt-2 h-4 w-24')} />
          <ButtonBones className="mt-4" />
        </div>
      </section>
    )
  }
  return (
    <section role="status" aria-label="Loading" className="mb-6">
      <div className={clsx(bone, 'h-4 w-16')} />
      <div className={clsx(bone, 'mt-1.5 h-9 w-56 sm:h-10 sm:w-72')} />
      <div className={clsx(bone, 'mt-2 h-4 w-32')} />
      <ButtonBones className="mt-4" />
    </section>
  )
}

// One tap blocks; the toast's Undo is the way back without a trip to Settings > Blocklist.
export function BlockButton({ kind, id, name }: { kind: BlockKind; id: string; name: string }) {
  const blocked = useIsBlocked(kind, id)
  const block = useBlock()
  return (
    <Button
      variant={blocked ? 'danger' : 'ghost'}
      onClick={() => {
        block.mutate({ kind, id, blocked: !blocked })
        if (!blocked)
          showToast(
            `Blocked ${name} everywhere`,
            <button onClick={() => block.mutate({ kind, id, blocked: false })} className="rounded-full bg-raised px-3 py-1 text-xs font-semibold hover:bg-line">
              Undo
            </button>,
          )
      }}
      title={blocked ? 'Show everywhere again' : 'Hide from every list, search and feed'}
    >
      <Ban size={16} /> {blocked ? 'Blocked' : 'Block'}
    </Button>
  )
}

export function FollowButton({ favorite, onToggle }: { favorite: boolean; onToggle: () => void }) {
  return (
    <Button variant={favorite ? 'solid' : 'accent'} onClick={onToggle}>
      <Heart size={16} className={favorite ? 'fill-accent text-accent' : ''} /> {favorite ? 'Following' : 'Follow'}
    </Button>
  )
}

export function BlockedNotice({ kind, id }: { kind: BlockKind; id: string }) {
  if (!useIsBlocked(kind, id)) return null
  return (
    <div className="mb-6 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/20">
      This {kind} is blocked, so its videos are hidden everywhere else. They are listed here only.
    </div>
  )
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div>
      <div className="text-[11px] tracking-wider text-muted uppercase">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  )
}
