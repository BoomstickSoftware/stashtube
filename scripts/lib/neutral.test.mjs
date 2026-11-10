// node --test scripts/lib/   (run by scripts/check.mjs)
// The fixtures use invented names only: nothing here is from the library.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildVocab, classify, denyScrubber, loremMask, maskValue, pick, redactKey, redactText, redactUrl, redactValue, shapeLines, shapeOf, token } from './neutral.mjs'

const SECRET = ['Zorvane Quillfeather', 'Mossgate Pictures', 'The Long Afternoon', 'Brindlewick']
const leaks = (out) => SECRET.filter((s) => JSON.stringify(out).includes(s) || s.split(' ').some((w) => w.length > 3 && JSON.stringify(out).includes(w)))

test('shapes that say nothing about content are recognised', () => {
  for (const [s, kind] of [['2775', 'int'], ['4.5', 'num'], ['3f2b8c1e-1111-4222-8333-444455556666', 'uuid'], ['a3f5c9e1b2d4f6a8', 'hex'], ['2026-11-10', 'date'], ['2026-11-10T08:15:00Z', 'datetime'], ['12ms', 'duration'], ['00:12:30', 'duration'], ['v0.28.1', 'version'], ['video/mp4', 'mime'], ['1920x1080', 'res'], ['192.168.1.152', 'ip'], ['true', 'bool']]) assert.equal(shapeOf(s), kind, s)
  for (const s of ['Brindlewick', 'The Long Afternoon', 'x', 'a b']) assert.equal(shapeOf(s), null, s)
})

test('a free string is tokenised; equal strings share a hash, the salt changes it', () => {
  const a = token('Zorvane Quillfeather', 's1')
  assert.match(a, /^<str:20 #[0-9a-f]{6}>$/)
  assert.equal(a, token('Zorvane Quillfeather', 's1'))
  assert.notEqual(a, token('Zorvane Quillfeather', 's2'))
  assert.notEqual(a, token('Zorvane Quillfeathes', 's1'))
})

test('strings are kept only by shape or under an enum key; content keys keep nothing', () => {
  assert.equal(classify('state', 'downloading').out, 'downloading')
  assert.equal(classify('state', 'two words').kind, 'str')
  assert.equal(classify('note', 'downloading').kind, 'str') // not an enum key
  assert.equal(classify('title', '1984').kind, 'str') // a number under a content key is still a title
  assert.equal(classify('name', '2026-11-10').kind, 'str')
  assert.equal(classify('id', '2775').out, '2775')
  assert.match(classify('path', '/data/Mossgate Pictures/The Long Afternoon.mp4').out, /^<path:depth=3 ext=mp4 #[0-9a-f]{6}>$/)
})

test('a whole response: keys, ids, numbers, dates and enums stay, names go', () => {
  const scene = { id: '12', title: 'The Long Afternoon', date: '2024-05-01', rating: 4.5, studio: { id: '6', name: 'Mossgate Pictures' }, performers: [{ id: '447', name: 'Zorvane Quillfeather' }], state: 'owned', screenshot: '/media/stash/scene/12/screenshot', urls: ['https://mossgate.example/watch/the-long-afternoon'], file: { path: '/data/Mossgate Pictures/x.mkv', videoCodec: 'hevc' } }
  const out = redactValue({ items: [scene], total: 1 })
  assert.deepEqual(leaks(out), [])
  assert.equal(out.items[0].id, '12')
  assert.equal(out.items[0].date, '2024-05-01')
  assert.equal(out.items[0].rating, 4.5)
  assert.equal(out.items[0].state, 'owned')
  assert.equal(out.items[0].screenshot, '/media/stash/scene/12/screenshot')
  assert.equal(out.items[0].file.videoCodec, 'hevc')
  assert.match(out.items[0].urls[0], /^https:\/\/<host #[0-9a-f]{6}>\/\*\/\*$/)
  assert.equal(out.items[0].studio.id, '6')
})

test('arrays are cut to the first items with a count of the rest', () => {
  const out = redactValue({ ids: [1, 2, 3, 4, 5, 6, 7] }, { items: 3 })
  assert.deepEqual(out.ids, [1, 2, 3, '<+4 more>'])
})

test('content used as an object key is tokenised; schema keys and id keys are not', () => {
  assert.equal(redactKey('sceneCount'), 'sceneCount')
  assert.equal(redactKey('scene_count'), 'scene_count')
  assert.equal(redactKey('2775'), '2775')
  assert.match(redactKey('Brindlewick'), /^<key:11 #/)
  assert.match(redactKey('two words'), /^<key:9 #/)
  const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`word${i}`, i]))
  assert.ok(Object.keys(redactValue(many)).every((k) => k.startsWith('<key:')))
})

test('URLs keep route and ids, lose names, tokens and unknown hosts', () => {
  assert.equal(redactUrl('/api/scenes?performers=447,807&perPage=40&q=Brindlewick&sort=date'), '/api/scenes?performers=447,807&perPage=40&q=<s:11>&sort=date')
  assert.equal(redactUrl('/media/remote/ZXlKaGJHY2lPaUpJVXpJMU5pSjk.abc?w=320'), '/media/remote/*?w=320')
  assert.equal(redactUrl('http://flix.lan/scene/2775'), 'http://flix.lan/scene/2775')
  assert.match(redactUrl('https://user:pw@cdn.mossgate.example/img/Brindlewick.jpg?token=abc'), /^https:\/\/<host #[0-9a-f]{6}>\/\*\/\*\.jpg\?token=<s:3>$/)
  assert.equal(redactUrl('/data/Mossgate Pictures/clip.mp4'.replace(/ /g, '%20')), '/*/*/*.mp4')
})

test('log lines: levels, routes, statuses and timings stay; quoted and unknown words go', () => {
  const vocab = buildVocab(['console.log(`deleted scene ${id} "${title}" (whisparr ${n})`)'])
  const a = redactText('deleted scene 2775 "The Long Afternoon" (whisparr 45)', { vocab })
  assert.match(a, /^deleted scene 2775 "<str:18 #[0-9a-f]{6}>" \(whisparr 45\)$/)
  const b = redactText('--> GET /api/scenes/2775/related \x1b[32m200\x1b[0m 12ms', { vocab })
  assert.equal(b, '--> GET /api/scenes/2775/related 200 12ms')
  const c = redactText('stash: Zorvane Quillfeather not found: ECONNREFUSED 192.168.0.10:9999', { vocab })
  assert.equal(c, 'stash: <w×2> not found: ECONNREFUSED 192.168.0.10:9999')
  assert.deepEqual(leaks([a, b, c, redactText('TypeError: Brindlewick is not a function at file:///app/apps/server/src/api.ts:12:3', { vocab })]), [])
  assert.deepEqual(leaks(redactText('{"level":"error","title":"The Long Afternoon","id":7}', { vocab })), [])
})

test('the shape summary prints counts, ids, ranges and enums, never a free string', () => {
  const page = { items: [{ id: '12', title: 'The Long Afternoon', rating: null, state: 'owned', date: '2024-05-01' }, { id: '13', title: 'Brindlewick', rating: 4, state: 'remote', date: '2025-01-09' }], total: 2 }
  const lines = shapeLines(page)
  assert.deepEqual(leaks(lines), [])
  const line = (p) => lines.find((l) => l.startsWith(`${p} `))
  assert.match(line('$.items'), /array ×1 len 2/)
  assert.match(line('$.items[].id'), /id ×2 distinct 2: 12,13/)
  assert.match(line('$.items[].title'), /text ×2 len 11\/11\/18 distinct 2/)
  assert.match(line('$.items[].rating'), /number ×1 4; null ×1 \(50%\)/)
  assert.match(line('$.items[].state'), /enum owned=1 remote=1/)
  assert.match(line('$.items[].date'), /date ×2 2024-05-01 \.\. 2025-01-09/)
  assert.deepEqual(pick(page, '$.items[].id'), ['12', '13'])
  assert.deepEqual(leaks(pick(page, '$.items[].title')), [])
})

test('masking for the UI keeps what the app needs and the shape of the text', () => {
  const m = loremMask('The Long Afternoon, Part 2')
  assert.equal(m.length, 'The Long Afternoon, Part 2'.length)
  assert.match(m, /^[A-Z][a-z]{2} [A-Z][a-z]{3} [A-Z][a-z]{8}, [A-Z][a-z]{3} \d$/)
  assert.equal(m, loremMask('The Long Afternoon, Part 2'))
  const out = maskValue({ id: '12', title: 'The Long Afternoon', screenshot: '/media/stash/scene/12/screenshot', sort: 'created_at', performerGender: 'women', key: 'for-you', urls: ['https://mossgate.example/x'], studio: { id: '6', name: 'Mossgate Pictures' }, date: '2024-05-01', n: 3 })
  assert.deepEqual(leaks(out), [])
  assert.deepEqual([out.id, out.screenshot, out.sort, out.performerGender, out.key, out.date, out.n], ['12', '/media/stash/scene/12/screenshot', 'created_at', 'women', 'for-you', '2024-05-01', 3])
  assert.equal(out.urls[0], 'https://example.invalid/')
  assert.equal(maskValue({ direct: 'http://192.168.1.152/media/play/12?st=abc' }).direct, 'http://192.168.1.152/media/play/12?st=abc')
  assert.equal(out.studio.name.length, 'Mossgate Pictures'.length)
})

test('the deny-list net replaces a library name the allow-list let through', () => {
  const scrub = denyScrubber(['Brindlewick', 'Zorvane Quillfeather', 'abc'], [])
  assert.deepEqual(scrub('status ok Brindlewick 12 Zorvane Quillfeather abc'), { text: 'status ok <deny> 12 <deny> abc', hits: 2 })
  assert.deepEqual(denyScrubber([])('x'), { text: 'x', hits: 0 })
})
