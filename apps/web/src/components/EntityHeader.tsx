import type { BlockKind } from '@flix/shared'
import { Ban, Heart } from 'lucide-react'
import type { ReactNode } from 'react'
import { useBlock, useBlocklist } from '../lib/api'
import { Button } from './ui'

export function useIsBlocked(kind: BlockKind, id: string) {
  const { data } = useBlocklist()
  const list = kind === 'tag' ? data?.tags : kind === 'performer' ? data?.performers : data?.studios
  return !!list?.some((x) => x.id === id)
}

export function BlockButton({ kind, id }: { kind: BlockKind; id: string }) {
  const blocked = useIsBlocked(kind, id)
  const block = useBlock()
  return (
    <Button
      variant={blocked ? 'danger' : 'ghost'}
      onClick={() => block.mutate({ kind, id, blocked: !blocked })}
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
