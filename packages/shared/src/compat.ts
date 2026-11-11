// Where a video plays without being transcoded (wiki features/compatibility-badge). From the
// container and codecs alone, so a card can say it without probing the browser.
//
// everywhere: MP4 with H.264 and AAC (or MP3, or no sound): every phone, computer and TV plays
//             the file itself, and so does AirPlay.
// device:     an MP4 whose codec only some devices decode (HEVC, AV1, AC-3…): the file plays
//             directly where the device can, and is transcoded elsewhere.
// transcode:  any other container (MKV, AVI, WMV…): Apple devices cannot open it, so Stash
//             transcodes it on the fly.
export type Compatibility = 'everywhere' | 'device' | 'transcode'

const MP4_FAMILY = new Set(['mp4', 'mov', 'm4v'])
const COMMON_AUDIO = new Set(['aac', 'mp3', ''])

export function compatibility(f: { container: string; videoCodec: string; audioCodec: string }): Compatibility {
  if (!MP4_FAMILY.has(f.container.toLowerCase())) return 'transcode'
  return f.videoCodec.toLowerCase() === 'h264' && COMMON_AUDIO.has(f.audioCodec.toLowerCase()) ? 'everywhere' : 'device'
}

export const compatibilityLabel: Record<Compatibility, string> = {
  everywhere: 'Plays everywhere',
  device: 'Plays on some devices',
  transcode: 'Transcodes',
}

// What Stash's path filter is given for "transcodes": a file whose extension is not in the MP4
// family (the container, read from the name: Stash has no container filter).
export const NOT_MP4_PATH = '(?i)\\.(mp4|m4v|mov)$'
