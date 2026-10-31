import type { BlockKind } from '@flix/shared'
import { Ban, Heart } from 'lucide-react'
import type { ReactNode } from 'react'
import { useBlock, useIsBlocked } from '../lib/api'
import { showToast } from '../lib/toast'
import { Button } from './ui'

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
