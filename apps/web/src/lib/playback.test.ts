import type { Marker } from '@flix/shared'
import { describe, expect, it, vi } from 'vitest'
import { groupMarkers, jumpToMarker, nextMarker, pickSource, transportKey } from './playback'

const playback = { direct: '/media/play/1', hls: '/media/play/1/stream.m3u8?resolution=ORIGINAL&sig=x' }
const marker = (seconds: number, title = ''): Marker => ({ id: String(seconds), seconds, title, tag: '' }) as Marker

describe('pickSource', () => {
  it('plays the original in auto when the browser can', () => {
    expect(pickSource(playback, { canDirect: true })).toEqual({ mode: 'direct', res: 'ORIGINAL', src: playback.direct })
  })
  it('falls back to the untouched transcode URL after a direct error', () => {
    expect(pickSource(playback, { canDirect: true, fallback: true })).toEqual({ mode: 'hls', res: 'ORIGINAL', src: playback.hls })
  })
  it('forces the transcode at a chosen resolution', () => {
    const s = pickSource(playback, { quality: '480', canDirect: true })
    expect(s.mode).toBe('hls')
    expect(s.res).toBe('STANDARD')
    expect(s.src).toBe('/media/play/1/stream.m3u8?resolution=STANDARD&sig=x')
  })
  it('drops to the stalled resolution in auto', () => {
    const s = pickSource(playback, { quality: 'auto', autoRes: 'STANDARD_HD', canDirect: true })
    expect(s).toMatchObject({ mode: 'hls', res: 'STANDARD_HD' })
    expect(s.src).toContain('resolution=STANDARD_HD')
  })
  it('transcodes at the original size when the browser cannot play the file', () => {
    expect(pickSource(playback, { quality: 'original', canDirect: false })).toEqual({ mode: 'hls', res: 'ORIGINAL', src: playback.hls })
  })
  it('points at nothing for the dev error hook', () => {
    expect(pickSource(playback, { canDirect: true, missing: true }).src).toBe('/media/play/missing')
    expect(pickSource(playback, { canDirect: false, missing: true }).src).toBe('/media/play/missing/stream.m3u8')
  })
})

describe('markers', () => {
  const ms = [marker(10), marker(20, 'a'), marker(30)]
  it('finds the next and previous marker with slack', () => {
    expect(nextMarker(ms, 9.5, 1)?.seconds).toBe(20) // within a second of 10: moves on
    expect(nextMarker(ms, 21, -1)?.seconds).toBe(10) // within two seconds after 20: moves back past it
    expect(nextMarker(ms, 30, 1)).toBeUndefined()
  })
  it('jumps and names the marker', () => {
    const seek = vi.fn()
    const flash = vi.fn()
    jumpToMarker(ms, 12, 1, seek, flash)
    expect(seek).toHaveBeenCalledWith(20)
    expect(flash).toHaveBeenCalledWith('a')
    jumpToMarker(ms, 40, 1, seek, flash)
    expect(seek).toHaveBeenCalledTimes(1)
  })
  it('groups markers within 1% of the duration into one tick', () => {
    const ticks = groupMarkers([marker(100, 'O'), marker(105, 'O'), marker(500, 'x')], 1000)
    expect(ticks.map((t) => [t.t, t.markers.length, t.o])).toEqual([
      [100, 2, true],
      [500, 1, false],
    ])
  })
})

describe('transportKey', () => {
  const make = () => ({ toggle: vi.fn(), seekBy: vi.fn(), mark: vi.fn(), jumpMarker: vi.fn(), toggleMute: vi.fn() })
  it('handles the shared keys', () => {
    const t = make()
    for (const key of [' ', 'k', 'ArrowLeft', 'ArrowRight', 'j', 'l', 'b', ']', '[', 'm']) expect(transportKey({ key }, t)).toBe(true)
    expect(t.toggle).toHaveBeenCalledTimes(2)
    expect(t.seekBy.mock.calls.map((c) => c[0])).toEqual([-5, 5, -10, 10])
    expect(t.mark).toHaveBeenCalledTimes(1)
    expect(t.jumpMarker.mock.calls.map((c) => c[0])).toEqual([1, -1])
    expect(t.toggleMute).toHaveBeenCalledTimes(1)
  })
  it('leaves every other key to the player', () => {
    const t = make()
    for (const key of ['n', 'f', 'Escape', '5', 'q']) expect(transportKey({ key }, t)).toBe(false)
    expect(t.toggle).not.toHaveBeenCalled()
  })
})
