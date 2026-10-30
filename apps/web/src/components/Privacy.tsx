import { Ghost } from 'lucide-react'
import { setPrivate, useIsPrivate } from '../lib/privacy'
import { Switch } from './ui'

// Settings → Privacy: the private session switch (the ghost in the header is the same switch).
export function PrivacySetting() {
  const priv = useIsPrivate()
  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Ghost size={20} className="text-violet-300" /> Privacy
      </h2>
      <label className="mt-3 flex max-w-xl cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Private session</span>
          <span className="mt-0.5 block text-sm text-muted">
            Nothing you watch is recorded until you close flix: no plays, history or resume points, no station spots, and the
            rating, O and marker buttons do nothing. Favourites, playlists and Not interested still work. The ghost in the
            header turns it on and off too.
          </span>
        </span>
        <Switch on={priv} onChange={setPrivate} className="mt-0.5" />
      </label>
    </section>
  )
}
