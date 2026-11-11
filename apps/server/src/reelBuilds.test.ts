import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clipArgs, clipKey, concatList, dominantFps, fitBox, overSource, type RenderClip } from '@flix/shared'
import { BREATHER_MS, easternHour, inWindow, nextBuild } from './reelBuilds.ts'

// 2026-11-11 is in standard time (UTC-5); 2026-07-01 in daylight time (UTC-4)
const at = (iso: string) => new Date(iso)
const q = (id: number, now = false, queuedAt = '2026-11-10T12:00:00Z') => ({ id, now, queuedAt: at(queuedAt) })

test('the window is 02:00 to 05:00 US Eastern, in winter and in summer', () => {
  assert.equal(easternHour(at('2026-11-11T07:00:00Z')), 2)
  assert.equal(easternHour(at('2026-07-01T06:00:00Z')), 2)
  assert.equal(easternHour(at('2026-11-11T05:00:00Z')), 0) // midnight is hour 0, not 24
  assert.equal(inWindow(at('2026-11-11T06:59:59Z')), false)
  assert.equal(inWindow(at('2026-11-11T07:00:00Z')), true)
  assert.equal(inWindow(at('2026-11-11T09:59:59Z')), true)
  assert.equal(inWindow(at('2026-11-11T10:00:00Z')), false) // 05:00: no new builds
  assert.equal(inWindow(at('2026-07-01T06:00:00Z')), true)
  assert.equal(inWindow(at('2026-07-01T09:00:00Z')), false)
})

test('a queued reel waits for the window; the oldest goes first', () => {
  const s = { queued: [q(2, false, '2026-11-10T13:00:00Z'), q(1)], building: false, lastEndedAt: null }
  assert.equal(nextBuild(at('2026-11-11T01:00:00Z'), s), null) // 20:00 Eastern
  assert.equal(nextBuild(at('2026-11-11T07:30:00Z'), s), 1)
  assert.equal(nextBuild(at('2026-11-11T10:00:00Z'), s), null)
})

test('"Build now" is offered at any hour and ahead of the queue', () => {
  const s = { queued: [q(1), q(2, true, '2026-11-10T15:00:00Z')], building: false, lastEndedAt: null }
  assert.equal(nextBuild(at('2026-11-11T18:00:00Z'), s), 2)
  assert.equal(nextBuild(at('2026-11-11T07:30:00Z'), s), 2)
})

test('one build at a time: nothing is offered while one is being rendered', () => {
  const s = { queued: [q(1, true)], building: true, lastEndedAt: null }
  assert.equal(nextBuild(at('2026-11-11T07:30:00Z'), s), null)
})

test('five minutes pass between window builds; "Build now" does not wait', () => {
  const ended = at('2026-11-11T07:30:00Z')
  const window = { queued: [q(1)], building: false, lastEndedAt: ended }
  assert.equal(nextBuild(new Date(ended.getTime() + BREATHER_MS - 1000), window), null)
  assert.equal(nextBuild(new Date(ended.getTime() + BREATHER_MS), window), 1)
  assert.equal(nextBuild(new Date(ended.getTime() + 1000), { ...window, queued: [q(1, true)] }), 1)
})

test('an empty queue offers nothing', () => {
  assert.equal(nextBuild(at('2026-11-11T07:30:00Z'), { queued: [], building: false, lastEndedAt: null }), null)
})

test('the picture is fitted without stretching and centred, on even numbers', () => {
  assert.deepEqual(fitBox(1920, 1080), { w: 1920, h: 1080, x: 0, y: 0 })
  assert.deepEqual(fitBox(3840, 2160), { w: 1920, h: 1080, x: 0, y: 0 })
  assert.deepEqual(fitBox(1440, 1080), { w: 1440, h: 1080, x: 240, y: 0 }) // 4:3: bars left and right
  assert.deepEqual(fitBox(4096, 2160), { w: 1920, h: 1012, x: 0, y: 34 }) // wider than 16:9: bars above and below
  assert.deepEqual(fitBox(640, 360), { w: 1920, h: 1080, x: 0, y: 0 }) // scaled up
  assert.deepEqual(fitBox(1080, 1920), { w: 608, h: 1080, x: 656, y: 0 }) // portrait
  assert.deepEqual(fitBox(0, 0), { w: 1920, h: 1080, x: 0, y: 0 })
  for (const [w, h] of [[853, 480], [1279, 719], [1998, 1080]]) { const b = fitBox(w, h); for (const n of [b.w, b.h, b.x, b.y]) assert.equal(n % 2, 0) }
})

test('the reel takes the frame rate most of its running time has', () => {
  assert.equal(dominantFps([{ fps: 23.976, length: 60 }, { fps: 29.97, length: 20 }, { fps: 59.94, length: 30 }]), 24)
  assert.equal(dominantFps([{ fps: 29.97, length: 10 }, { fps: 30, length: 10 }, { fps: 24, length: 15 }]), 30)
  assert.equal(dominantFps([{ fps: 24, length: 10 }, { fps: 60, length: 10 }]), 60) // a tie goes to the higher
  assert.equal(dominantFps([{ fps: 0, length: 10 }]), 30)
  assert.equal(dominantFps([]), 30)
})

const clip = (o: Partial<RenderClip> = {}): RenderClip => ({ path: '/data/adult/a b/c.mp4', start: 10, end: 16, width: 1920, height: 1080, videoCodec: 'h264', hasAudio: true, bitrate: 8_000_000, fadeIn: false, fadeOut: false, ...o })
const S = { fps: 30, qp: 18 }
const arg = (a: string[], name: string) => a[a.indexOf(name) + 1]

test('a 16:9 H.264 clip stays on the hardware path at constant quality', () => {
  const a = clipArgs(clip(), S, '/out.mp4')
  assert.equal(arg(a, '-vf'), 'scale_vaapi=w=1920:h=1080:format=nv12')
  assert.ok(a.includes('-hwaccel'))
  assert.deepEqual([arg(a, '-ss'), arg(a, '-qp'), arg(a, '-r'), arg(a, '-i')], ['10', '18', '30', '/data/adult/a b/c.mp4'])
  assert.equal(a.filter((x) => x === '-t').length, 2) // read 6 s, write 6 s
  assert.ok(!a.includes('-rc_mode'))
  assert.equal(a.at(-1), '/out.mp4')
})

test('bars are padded in hardware; fades come down to software and go back up as nv12', () => {
  assert.equal(arg(clipArgs(clip({ width: 1440, height: 1080 }), S, 'o'), '-vf'), 'scale_vaapi=w=1440:h=1080:format=nv12,pad_vaapi=w=1920:h=1080:x=240:y=0:color=black')
  const a = clipArgs(clip({ fadeIn: true, fadeOut: true }), S, 'o')
  assert.equal(arg(a, '-vf'), 'scale_vaapi=w=1920:h=1080:format=nv12,hwdownload,format=nv12,fade=t=in:st=0:d=0.3,fade=t=out:st=5.7:d=0.3,format=nv12,hwupload')
  assert.match(arg(a, '-af'), /afade=t=in:st=0:d=0\.3,afade=t=out:st=5\.7:d=0\.3,apad$/)
})

test('a codec Quick Sync does not decode is decoded and filtered in software', () => {
  const a = clipArgs(clip({ videoCodec: 'vc1', width: 640, height: 360 }), S, 'o')
  assert.ok(!a.includes('-hwaccel'))
  assert.equal(arg(a, '-vf'), 'scale=1920:1080,setsar=1,format=nv12,hwupload')
  assert.equal(arg(a, '-c:v'), 'h264_vaapi')
})

test('a clip without sound gets silence, so every intermediate has the same streams', () => {
  const a = clipArgs(clip({ hasAudio: false }), S, 'o')
  assert.ok(a.includes('anullsrc=r=48000:cl=stereo'))
  assert.deepEqual([a[a.indexOf('-map') + 1], a[a.lastIndexOf('-map') + 1]], ['0:v:0', '1:a:0'])
  assert.equal(arg(a, '-af'), 'apad')
})

test('the second pass is rate-capped; a short clip splits its length between its fades', () => {
  const a = clipArgs(clip(), S, 'o', 5_000_000)
  assert.deepEqual([arg(a, '-rc_mode'), arg(a, '-b:v'), arg(a, '-maxrate')], ['VBR', '5000000', '5000000'])
  assert.ok(!a.includes('-qp'))
  assert.match(arg(clipArgs(clip({ start: 0, end: 0.4, fadeIn: true, fadeOut: true }), S, 'o'), '-vf'), /fade=t=in:st=0:d=0\.2,fade=t=out:st=0\.2:d=0\.2/)
})

test('an intermediate is reused only for the same source, range, fades and settings', () => {
  const k = clipKey(clip(), S, null)
  assert.equal(clipKey(clip(), S, null), k)
  for (const other of [clip({ end: 16.1 }), clip({ fadeOut: true }), clip({ path: '/x.mp4' })]) assert.notEqual(clipKey(other, S, null), k)
  assert.notEqual(clipKey(clip(), { fps: 24, qp: 18 }, null), k)
  assert.notEqual(clipKey(clip(), S, 5_000_000), k)
})

test('a clip is rendered again only when it is well above a known source rate', () => {
  assert.equal(overSource(11_600_000, 1_200_000), true)
  assert.equal(overSource(8_500_000, 8_000_000), false)
  assert.equal(overSource(9_000_000, 0), false)
})

test('the join list quotes paths', () => {
  assert.equal(concatList(['/reels/.work/a.mp4', "/reels/.work/it's.mp4"]), "file '/reels/.work/a.mp4'\nfile '/reels/.work/it'\\''s.mp4'\n")
})
