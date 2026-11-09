import type { WantedScene } from '@flix/shared'
import { Info } from 'lucide-react'
import { useState } from 'react'
import { useSdbSceneDetails } from '../lib/api'
import { date as fmtDate } from '../lib/format'
import { Sheet } from './Sheet'
import { Spinner } from './ui'

// About on a Discover card (wiki features/discover): StashDB's description of the scene, fetched
// when opened. A bottom sheet on a phone, a small panel with a mouse.
export function SceneAbout({ scene: w, className }: { scene: WantedScene; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault() // the cover may be a link to the library's copy
          e.stopPropagation()
          setOpen(true)
        }}
        title="About this scene"
        aria-label={`About “${w.title}”`}
        className={className}
      >
        <Info size={15} />
      </button>
      {open && <AboutSheet scene={w} onClose={() => setOpen(false)} />}
    </>
  )
}

function AboutSheet({ scene: w, onClose }: { scene: WantedScene; onClose: () => void }) {
  const { data, isPending, isError } = useSdbSceneDetails(w.stashdbId)
  const meta = [fmtDate(w.date), w.studio, w.runtime ? `${w.runtime} min` : null].filter(Boolean).join(' · ')
  return (
    <Sheet title={<span className="line-clamp-2">{w.title}</span>} onClose={onClose}>
      <div className="px-4 py-3 text-sm sm:max-h-[60vh] sm:overflow-y-auto">
        {meta && <div className="text-xs text-muted">{meta}</div>}
        {w.performers.length > 0 && <div className="mt-0.5 text-xs text-muted">{w.performers.join(', ')}</div>}
        <div className="mt-3">
          {isPending ? (
            <Spinner />
          ) : isError ? (
            <p className="text-muted">Couldn’t reach StashDB for the description.</p>
          ) : data?.details ? (
            <p className="leading-relaxed whitespace-pre-line text-white/85">{data.details}</p>
          ) : (
            <p className="text-muted">StashDB has no description for this scene.</p>
          )}
        </div>
      </div>
    </Sheet>
  )
}
