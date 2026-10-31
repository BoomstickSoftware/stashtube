import clsx from 'clsx'
import { useCallback } from 'react'

// A muted, looping, inline preview clip. iOS plays a video fullscreen unless it is muted and
// `playsinline` when playback starts; React sets `muted` only as a property, so set both as
// attributes before playing. It takes no touches: taps go to the link around it.
export function PreviewVideo({ src, ready, onReady, className }: { src: string; ready: boolean; onReady: () => void; className?: string }) {
  const ref = useCallback(
    (v: HTMLVideoElement | null) => {
      if (!v) return
      v.muted = true
      v.defaultMuted = true
      v.setAttribute('muted', '')
      v.setAttribute('playsinline', '')
      v.setAttribute('webkit-playsinline', '')
      v.disableRemotePlayback = true
      v.src = src
      v.play().catch(() => {})
      // removed (the card scrolled away, the preview ended): stop the download too, or WebKit
      // keeps buffering a detached clip and the previews pile up against the player
      return () => {
        v.pause()
        v.removeAttribute('src')
        v.load()
      }
    },
    [src],
  )
  return (
    <video
      ref={ref}
      loop
      preload="metadata"
      disablePictureInPicture
      onPlaying={onReady}
      className={clsx('pointer-events-none absolute inset-0 size-full object-cover transition-opacity', ready ? 'opacity-100' : 'opacity-0', className)}
    />
  )
}
