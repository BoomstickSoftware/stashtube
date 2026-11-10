// Content-neutral redaction (wiki/runbooks/neutral-observability.md). Allow-list based: object
// keys, numbers, booleans, null and strings of a recognised neutral SHAPE (id, uuid, hash, date,
// duration, version, mime type, resolution, route path) are kept; a free string is kept only
// under an enum-like key; every other string becomes a token `<str:LEN #HASH>` whose short hash
// is salted, so equal strings can be told apart and correlated without being readable.
// Pure functions, no dependencies beyond node:crypto; the same rules serve the API inspector,
// the Stash / Whisparr / Postgres readers, the log reader and the neutral screenshots.
import { createHash } from 'node:crypto'

// --- shapes ---------------------------------------------------------------------------------
const RE = {
  int: /^-?\d{1,18}$/,
  num: /^-?\d{1,18}\.\d{1,12}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  hex: /^[0-9a-f]{16,128}$/i,
  date: /^\d{4}-\d{2}-\d{2}$/,
  datetime: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
  time: /^\d{1,2}:\d{2}(:\d{2})?(\.\d+)?$/,
  duration: /^(\d+(\.\d+)?(ms|s|m|h|d))+$/,
  timespan: /^(\d+\.)?\d{2}:\d{2}:\d{2}(\.\d+)?$/,
  bool: /^(true|false)$/i,
  version: /^v?\d+(\.\d+){1,3}(-[0-9A-Za-z.]{1,24})?$/,
  mime: /^(application|audio|image|text|video|font)\/[a-z0-9.+-]{1,40}$/,
  res: /^\d{2,5}x\d{2,5}$|^\d{3,4}p$/,
  bytes: /^\d+(\.\d+)?\s?(B|KB|MB|GB|TB|K|M|G|T|KiB|MiB|GiB|TiB)$/,
  percent: /^\d+(\.\d+)?%$/,
  ip: /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/,
  enumTok: /^[A-Za-z][A-Za-z0-9_.+-]{0,31}$/,
  rowKey: /^[a-z][a-z-]{0,23}(:\d{1,12})?$/,
}

// A string of one of these shapes says nothing about content.
export function shapeOf(s) {
  if (s === '') return 'empty'
  if (RE.int.test(s)) return 'int'
  if (RE.num.test(s)) return 'num'
  if (RE.uuid.test(s)) return 'uuid'
  if (RE.hex.test(s)) return 'hex'
  if (RE.date.test(s)) return 'date'
  if (RE.datetime.test(s)) return 'datetime'
  if (RE.bool.test(s)) return 'bool'
  if (RE.duration.test(s) || RE.timespan.test(s)) return 'duration'
  if (RE.ip.test(s)) return 'ip'
  if (RE.version.test(s)) return 'version'
  if (RE.mime.test(s)) return 'mime'
  if (RE.res.test(s)) return 'res'
  if (RE.bytes.test(s)) return 'bytes'
  if (RE.percent.test(s)) return 'percent'
  return null
}

// Keys whose string values are enums (a closed set the code defines), kept when one token long.
export const ENUM_KEYS = new Set([
  '__typename', 'kind', 'status', 'state', 'type', 'action', 'outcome', 'sort', 'dir', 'mode', 'source', 'level', 'scope',
  'container', 'videoCodec', 'audioCodec', 'video_codec', 'audio_codec', 'format', 'protocol', 'method', 'eventType',
  'trackedDownloadState', 'trackedDownloadStatus', 'performerGender', 'itemType', 'mediaType', 'resolution', 'data_type',
  'udt_name', 'table', 'column', 'table_name', 'column_name', 'app', 'result', 'priority', 'trigger', 'commandName',
  'databaseType', 'runtimeName', 'osName', 'branch', 'authentication', 'updateMechanism', 'packageUpdateMechanism',
  'minimumAvailability', 'movieFileStatus', 'command', 'sortKey', 'sortDirection', 'databaseSchema', 'appSchema',
])

// Keys that hold names, titles and prose: nothing under them is kept, whatever its shape.
export const CONTENT_KEYS = new Set([
  'name', 'title', 'details', 'description', 'aliases', 'alias', 'alias_list', 'disambiguation', 'overview', 'why', 'code',
  'director', 'tag', 'studio', 'performers', 'measurements', 'tattoos', 'piercings', 'country', 'ethnicity', 'ethnicities',
  'sortTitle', 'cleanTitle', 'originalTitle', 'sourceTitle', 'releaseGroup', 'indexer', 'sceneName', 'text', 'label', 'q',
  'term', 'hairColor', 'eyeColor', 'hair_color', 'eye_color', 'fakeTits', 'fake_tits', 'gender', 'synopsis', 'credits',
  'genres', 'keywords', 'tagline', 'studioTitle', 'foreignTitle', 'displayName', 'fullName', 'cleanName', 'sortName',
  'downloadClient', 'downloadClientName', 'outputPath', 'subTasks',
])

// Keys that hold a filesystem path: reduced to depth, extension and hash.
export const PATH_KEYS = new Set(['path', 'relativePath', 'folder', 'folderName', 'rootFolderPath', 'originalFilePath', 'basename', 'filename', 'file', 'importedPath', 'droppedPath', 'sourcePath'])

// Keys that hold a sentence about what happened (errors, reasons): word-level redaction.
export const TEXT_KEYS = new Set(['error', 'message', 'detail', 'reason', 'errorMessage', 'exception', 'statusMessages', 'messages', 'hint'])

const ID_KEY = /(^id$|^ids$|Ids?$|_ids?$|^movieId$|^key$)/

// Path segments that are flix, Stash or Whisparr route words, not content.
export const ROUTE_WORDS = new Set(
  `api media stash remote play scene scenes performer performers studio studios tag tags screenshot preview stream vtt sprite
  image thumbnail webp hls home featured rows stations previews resume history stats related facets hidden duplicates features
  jobs search settings favorites playlists items blocklist studio-categories categories cast unlisted whisparr new activity admin
  stashdb type sync watch discover details names entity from cleanup waiting queue-status queue cache healthz readyz graphql v1 v3
  movie moviefile wanted missing cutoff health system status command log logs assets browse station vault playlist order markers o
  rating watched tiles intro favorite run get get-remote get-many continue clear identify auth login logout session delete
  restore-film restore remove index.html manifest.webmanifest app apps server src web packages shared scripts node_modules lib dist
  file node internal you edu performer studio tag edit unlisted lookup calendar blocklist exclusions importlistexclusion rootfolder
  qualityprofile diskspace task backup update indexer downloadclient notification config naming mediamanagement host ui
  customformat release manualimport parse rename credit collection alttitle extrafile language localization metadata
  autotagging delayprofile releaseprofile remotepathmapping importlist qualitydefinition master.m3u8 stream.m3u8 funscript caption
  interactive_heatmap`.split(/\s+/),
)
const EXT = new Set('mp4 m4v mkv avi wmv mov mpg mpeg flv webm ts mjs js cjs tsx jsx json css html svg png jpg jpeg webp gif ico vtt m3u8 woff2 map txt py sh md'.split(' '))
const HOSTS = new Set(['localhost', 'stashdb.org', 'example.invalid', 'github.com', 'registry.npmjs.org'])

// --- tokens ---------------------------------------------------------------------------------
export const hashOf = (s, salt = '') => createHash('sha256').update(`${salt}\0${s}`).digest('hex').slice(0, 6)
export const token = (s, salt) => `<str:${[...s].length} #${hashOf(s, salt)}>`

const KEY_OK = /^([a-z_][A-Za-z0-9_]{0,47}|[A-Z]|__typename)$/
// Object keys are schema names; a key that looks like data (a capital, a space, punctuation) is
// content used as a map key and is tokenised like a value.
export function redactKey(k, salt) {
  if (KEY_OK.test(k) || RE.int.test(k) || RE.num.test(k) || RE.uuid.test(k)) return k
  return `<key:${[...k].length} #${hashOf(k, salt)}>`
}

// Our own machines (an address, a bare service name, a .lan name) and the few public sites flix talks about.
const knownHost = (name) => RE.ip.test(name) || HOSTS.has(name.toLowerCase()) || /^[a-z0-9-]+$/i.test(name) || /\.(lan|local|svc|internal)$/i.test(name) || /\.cluster\.local$/i.test(name)
const hostTok = (host, salt) => {
  const h = host.replace(/^[^@]*@/, '') // never credentials
  const name = h.replace(/:\d+$/, '')
  const port = h.slice(name.length)
  if (knownHost(name)) return name + port
  return `<host #${hashOf(name.toLowerCase(), salt)}>${port}`
}

const decode = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function segTok(raw, vocab, foreign) {
  const seg = decode(raw)
  if (seg === '' || seg === '.' || seg === '..') return seg
  if (foreign) return RE.int.test(seg) || RE.uuid.test(seg) ? seg : (seg.match(/\.([A-Za-z0-9]{1,5})$/) && EXT.has(seg.match(/\.([A-Za-z0-9]{1,5})$/)[1].toLowerCase()) ? `*.${seg.match(/\.([A-Za-z0-9]{1,5})$/)[1].toLowerCase()}` : '*')
  const pos = seg.match(/(:\d+){1,2}$/)?.[0] ?? '' // file.ts:12:3 in a stack trace
  const core = pos ? seg.slice(0, -pos.length) : seg
  if (RE.int.test(core) || RE.uuid.test(core) || RE.hex.test(core) || ROUTE_WORDS.has(core)) return seg
  const dot = core.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [core.slice(0, dot), core.slice(dot + 1).toLowerCase()] : [core, '']
  const known = (w) => ROUTE_WORDS.has(w) || RE.int.test(w) || (vocab && wordKnown(w, vocab))
  if (ext && EXT.has(ext)) return known(stem) || stem.split(/[.-]/).every(known) ? seg : `*.${ext}${pos}`
  if (vocab && /^[A-Za-z0-9._-]+$/.test(core) && core.split(/[._-]/).every(known)) return seg
  return '*'
}

function queryTok(q, salt) {
  return q
    .split('&')
    .filter(Boolean)
    .map((kv) => {
      const i = kv.indexOf('=')
      const [k, v] = i < 0 ? [kv, null] : [kv.slice(0, i), decode(kv.slice(i + 1).replace(/\+/g, ' '))]
      const key = redactKey(decode(k), salt)
      if (v === null) return key
      const shape = CONTENT_KEYS.has(k) ? null : shapeOf(v)
      const idList = !/^(q|term|text|name|title)$/.test(k) && /^[0-9a-f-]+(,[0-9a-f-]+)*$/i.test(v) && v.split(',').every((x) => RE.int.test(x) || RE.uuid.test(x))
      if (shape || idList || (ENUM_KEYS.has(k) && RE.enumTok.test(v))) return `${key}=${v}`
      return `${key}=<s:${[...v].length}>`
    })
    .join('&')
}

export const looksLikeUrl = (s) => /^[a-z][a-z0-9+.-]{1,12}:\/\/\S+$/i.test(s) || /^\/[^\s/][^\s]*$/.test(s) || s === '/'

// A URL or path reduced to its route: ids and route words stay, every other segment is `*`,
// query keys stay with neutral values, an unknown host becomes a hashed token.
export function redactUrl(s, { salt = '', vocab = null } = {}) {
  const m = s.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)(.*)$/i)
  const prefix = m ? `${m[1].toLowerCase()}://${hostTok(m[2], salt)}` : ''
  let rest = m ? m[3] : s
  const hash = rest.indexOf('#')
  if (hash >= 0) rest = rest.slice(0, hash)
  const qi = rest.indexOf('?')
  const foreign = prefix.includes('<host ') // a site we do not know: its path words are content
  const path = (qi < 0 ? rest : rest.slice(0, qi)).split('/').map((x) => segTok(x, vocab, foreign)).join('/')
  const query = qi < 0 ? '' : `?${queryTok(rest.slice(qi + 1), salt)}`
  return prefix + path + query + (hash >= 0 ? '#…' : '')
}

// The route pattern of a redacted URL, for grouping: ids become :id, query values are dropped.
export const urlPattern = (redacted) =>
  redacted
    .replace(/\?.*$/, (q) => `?${q.slice(1).split('&').map((kv) => kv.split('=')[0]).join('&')}`)
    .split('/')
    .map((seg) => (RE.int.test(seg) || RE.uuid.test(seg) || RE.hex.test(seg) ? ':id' : seg))
    .join('/')

const pathTok = (s, salt) => {
  const parts = s.split(/[\\/]/).filter(Boolean)
  const ext = parts.at(-1)?.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase()
  return `<path:depth=${parts.length}${ext && EXT.has(ext) ? ` ext=${ext}` : ''} #${hashOf(s, salt)}>`
}

// --- one string -----------------------------------------------------------------------------
// What a string value under `key` may show: { kind, out }. `kind` names why it was kept
// (a shape, 'enum', 'url') or how it was reduced ('path', 'text', 'str').
export function classify(key, s, opts = {}) {
  const { salt = '', vocab = null } = opts
  if (s === '') return { kind: 'empty', out: '' }
  if (PATH_KEYS.has(key)) return { kind: 'path', out: pathTok(s, salt) }
  if (!CONTENT_KEYS.has(key)) {
    const shape = shapeOf(s)
    if (shape) return { kind: shape, out: s }
    if (ENUM_KEYS.has(key) && RE.enumTok.test(s)) return { kind: 'enum', out: s }
    if (key === 'key' && RE.rowKey.test(s)) return { kind: 'enum', out: s }
    if (looksLikeUrl(s)) return { kind: 'url', out: redactUrl(s, { salt, vocab }) }
    if (TEXT_KEYS.has(key)) return { kind: 'text', out: redactText(s, opts) }
  }
  return { kind: 'str', out: token(s, salt) }
}

// --- whole values ---------------------------------------------------------------------------
// The value with every string classified; arrays longer than `items` keep their first `items`
// entries and say how many were dropped.
export function redactValue(v, opts = {}, key = '') {
  const { items = 5, salt = '' } = opts
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return v
  if (typeof v === 'string') return classify(key, v, opts).out
  if (Array.isArray(v)) {
    const head = v.slice(0, items).map((x) => redactValue(x, opts, key))
    return v.length > items ? [...head, `<+${v.length - items} more>`] : head
  }
  if (typeof v === 'object') {
    const out = {}
    const dict = isDict(v)
    for (const [k, x] of Object.entries(v)) out[dict ? `<key:${[...k].length} #${hashOf(k, salt)}>` : redactKey(k, salt)] = redactValue(x, opts, k)
    return out
  }
  return `<${typeof v}>`
}

// A map keyed by data rather than a record with schema keys: many keys, all values numbers or
// booleans, keys that are not ids.
function isDict(o) {
  const keys = Object.keys(o)
  if (keys.length < 16) return false
  if (keys.every((k) => RE.int.test(k) || RE.uuid.test(k))) return false
  return Object.values(o).every((x) => typeof x === 'number' || typeof x === 'boolean')
}

// --- shape summary --------------------------------------------------------------------------
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null
}
const round = (n) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100)

// One line per JSON path: how often it occurs, its types and null rate, numeric and length
// distributions, date ranges, enum value counts, URL route patterns and, for id-like keys, the
// first ids. Nothing a line prints is a free string.
export function shapeLines(value, opts = {}) {
  const { salt = '', maxIds = 12 } = opts
  const stats = new Map()
  const at = (path) => {
    let s = stats.get(path)
    if (!s) stats.set(path, (s = { n: 0, nulls: 0, bools: [0, 0], nums: [], strs: new Map(), lens: [], hashes: new Set(), enums: new Map(), urls: new Map(), ids: [], idN: 0, texts: new Set(), idSet: new Set(), dates: [], arrays: [], objects: 0, keyCounts: [] }))
    return s
  }
  const walk = (v, path, key) => {
    const s = at(path)
    s.n++
    const idKey = ID_KEY.test(key)
    if (v === null || v === undefined) s.nulls++
    else if (typeof v === 'boolean') s.bools[v ? 1 : 0]++
    else if (typeof v === 'number') {
      s.nums.push(v)
      if (idKey) {
        s.idN++
        if (!s.idSet.has(v)) (s.idSet.add(v), s.ids.push(v))
      }
    } else if (typeof v === 'string') {
      const c = classify(key, v, opts)
      s.strs.set(c.kind, (s.strs.get(c.kind) ?? 0) + 1)
      if (c.kind === 'enum' || c.kind === 'bool' || c.kind === 'mime' || c.kind === 'res' || c.kind === 'version') s.enums.set(c.out, (s.enums.get(c.out) ?? 0) + 1)
      else if (c.kind === 'url') s.urls.set(urlPattern(c.out), (s.urls.get(urlPattern(c.out)) ?? 0) + 1)
      else if (c.kind === 'date' || c.kind === 'datetime') s.dates.push(v)
      else if (c.kind === 'int' || c.kind === 'uuid') {
        s.idN++
        if (!s.idSet.has(v)) (s.idSet.add(v), s.ids.push(v))
      } else if (c.kind === 'num') s.nums.push(Number(v))
      else if (c.kind === 'str' || c.kind === 'text' || c.kind === 'path') {
        s.lens.push([...v].length)
        s.hashes.add(hashOf(v, salt))
        if (c.kind === 'text' && s.texts.size < 3) s.texts.add(c.out.slice(0, 160))
      }
    } else if (Array.isArray(v)) {
      s.arrays.push(v.length)
      for (const x of v) walk(x, `${path}[]`, key)
    } else if (typeof v === 'object') {
      s.objects++
      const keys = Object.keys(v)
      s.keyCounts.push(keys.length)
      const idMap = keys.length > 0 && keys.every((k) => RE.int.test(k) || RE.uuid.test(k))
      const dict = !idMap && isDict(v)
      for (const k of keys) walk(v[k], `${path}.${idMap ? '{id}' : dict || redactKey(k, salt) !== k ? '{key}' : k}`, k)
    }
  }
  walk(value, '$', '')
  const lines = []
  const width = Math.min(52, Math.max(...[...stats.keys()].map((p) => p.length)))
  for (const [path, s] of stats) {
    const parts = []
    if (s.objects) parts.push(`object ×${s.objects}`)
    if (s.arrays.length) parts.push(`array ×${s.arrays.length} len ${dist(s.arrays)}`)
    if (s.bools[0] + s.bools[1]) parts.push(`bool true ${s.bools[1]} false ${s.bools[0]}`)
    const idish = s.ids.length > 0
    if (s.nums.length && !(idish && typeof s.ids[0] === 'number')) parts.push(`number ×${s.nums.length} ${dist(s.nums)}`)
    for (const [kind, n] of s.strs) {
      if (kind === 'str' || kind === 'text' || kind === 'path' || kind === 'empty') continue
      if (kind === 'int' || kind === 'uuid' || kind === 'num' || kind === 'date' || kind === 'datetime' || kind === 'url') continue
      if (kind === 'enum' || kind === 'bool' || kind === 'mime' || kind === 'res' || kind === 'version') continue
      parts.push(`${kind} ×${n}`)
    }
    if (idish) parts.push(`id ×${s.idN} distinct ${s.idSet.size}: ${s.ids.slice(0, maxIds).join(',')}${s.ids.length > maxIds ? ',…' : ''}`)
    if (s.dates.length) {
      const d = [...s.dates].sort()
      parts.push(`date ×${d.length} ${d[0]} .. ${d.at(-1)}`)
    }
    if (s.enums.size) parts.push(`enum ${[...s.enums].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}=${n}`).join(' ')}${s.enums.size > 12 ? ' …' : ''}`)
    if (s.urls.size) parts.push(`url ×${[...s.urls.values()].reduce((a, b) => a + b, 0)} ${[...s.urls].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ×${n}`).join(' | ')}${s.urls.size > 3 ? ` | +${s.urls.size - 3} patterns` : ''}`)
    if (s.lens.length) parts.push(`text ×${s.lens.length} len ${dist(s.lens)} distinct ${s.hashes.size}`)
    if (s.texts.size) parts.push(`said: ${[...s.texts].join(' | ')}`)
    if (s.strs.get('empty')) parts.push(`empty ×${s.strs.get('empty')}`)
    if (s.nulls) parts.push(`null ×${s.nulls} (${Math.round((100 * s.nulls) / s.n)}%)`)
    if (s.keyCounts.length && (path.endsWith('{id}') || path.endsWith('{key}') || stats.has(`${path}.{id}`) || stats.has(`${path}.{key}`))) parts.push(`keys ${dist(s.keyCounts)}`)
    lines.push(`${path.padEnd(width)}  ${parts.join('; ')}`)
  }
  return lines
}
const dist = (xs) => {
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  return lo === hi ? `${round(lo)}` : `${round(lo)}/${round(median(xs))}/${round(hi)}`
}

// Every value at one path of the summary (`$.items[].id`), redacted: the way to get ids out.
export function pick(value, wanted, opts = {}) {
  const out = []
  const walk = (v, path, key) => {
    if (path === wanted) out.push(redactValue(v, { ...opts, items: Infinity }, key))
    if (Array.isArray(v)) for (const x of v) walk(x, `${path}[]`, key)
    else if (v && typeof v === 'object') {
      const keys = Object.keys(v)
      const idMap = keys.length > 0 && keys.every((k) => RE.int.test(k) || RE.uuid.test(k))
      for (const k of keys) {
        walk(v[k], `${path}.${idMap ? '{id}' : redactKey(k, opts.salt) !== k ? '{key}' : k}`, k)
        if (idMap && `${path}.{id}#keys` === wanted) out.push(k)
      }
    }
  }
  walk(value, '$', '')
  return out
}

// --- free text (log lines, error messages) --------------------------------------------------
const BUILTIN_WORDS = `a an and are as at be been but by can cannot could did do does done for from had has have if in into is it its may more
  most must no not of off on once only or other out over per so some than that the then there this to too under until up was were
  what when where which while who why will with within without would yet after again all already also any because before being
  between both each either every few first last new next none now old one two three same still such these those through very
  error errors warn warning info debug trace fatal failed failure fail ok success succeeded done ready running finished cancelled
  stopped stopping started starting start stop listening request response reply status code http https get post put patch delete
  head options timeout timed aborted abort refused reset closed connect connection unreachable unavailable missing invalid
  unknown unexpected undefined null true false empty retry retrying attempt attempts skipped skipping queued waiting pending
  cache cached cleared restored queries query mutation fetch fetched checked warmed warming assets data database schema migrate
  server client proxy upstream bytes ms seconds minutes hours days ago since scene scenes performer performers studio studios
  tag tags file files path video image job jobs sync synced pruned removed added deleted changed settled refreshing unused
  node internal async promise anonymous object module at file line col stack caused cause exit signal killed memory heap
  flix stash stashdb whisparr hono postgres drizzle sharp zod kubectl pod container deploy healthz readyz login session
  exist exists value values field fields type types enum mean you expected found argument variable required syntax near column
  relation table row rows key violates constraint duplicate permission denied many large long short limit exceeded input output
  read write transaction statement canceled due like got want wanted should unable locked busy query queries name id ids
  mp4 mkv webm hevc h264 h265 av1 aac opus vaapi hls gzip br json html`.split(/\s+/)
const ERROR_CLASS = /^([A-Z][A-Za-z]*(Error|Exception|Timeout)|E[A-Z_]{3,}|HTTP|HTTPS|GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|JSON|URL|API|SQL|OK|TTL|ID|UTC|GMT)$/

// The words a log line may show: the built-in list plus every word in the given source texts
// (the server's code, so its own messages read normally while data stays hidden).
export function buildVocab(texts = []) {
  const vocab = new Set(BUILTIN_WORDS)
  for (const text of texts) for (const w of text.match(/[A-Za-z]{2,}/g) ?? []) for (const part of w.split(/(?<=[a-z])(?=[A-Z])/)) vocab.add(part.toLowerCase())
  return vocab
}
const wordKnown = (w, vocab) => w.split(/(?<=[a-z])(?=[A-Z])|[_-]/).every((p) => p === '' || RE.int.test(p) || vocab.has(p.toLowerCase()))

function tokText(core, opts) {
  const { salt = '', vocab } = opts
  if (core === '') return ''
  if (!/[\p{L}\p{N}]/u.test(core)) return core // arrows, punctuation
  if (shapeOf(core) || RE.time.test(core)) return core
  if (ERROR_CLASS.test(core)) return core
  if (looksLikeUrl(core) || (core.includes('/') && /^[\w.@:/?&=%+~#-]+$/.test(core) && core.includes('.'))) return redactUrl(core, { salt, vocab })
  if (/^[A-Za-z][A-Za-z_-]*$/.test(core)) return wordKnown(core, vocab) ? core : '<w>'
  for (const sep of ['=', ':', ',', '|', '/', '(', ')', '[', ']', '{', '}', ';']) {
    if (core.includes(sep)) return core.split(sep).map((p) => tokText(p, opts)).join(sep)
  }
  const m = core.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)
  if (m && (m[1] || m[3])) return m[1] + tokText(m[2], opts) + m[3]
  return '<w>'
}

// A line of free text with data removed: quoted strings become tokens, numbers, ids, dates,
// durations, statuses and route paths stay, a word stays only if the vocabulary knows it.
export function redactText(line, opts = {}) {
  const o = { salt: '', ...opts, vocab: opts.vocab ?? buildVocab() }
  // eslint-disable-next-line no-control-regex
  let s = String(line).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
  const trimmed = s.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.stringify(redactValue(JSON.parse(trimmed), o))
    } catch {}
  }
  const held = []
  const hold = (q, inner) => {
    // a quoted number or id stays; so does one quoted identifier the vocabulary knows (a schema name in an error)
    held.push(shapeOf(inner) || (/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(inner) && wordKnown(inner, o.vocab)) ? `${q}${inner}${q}` : `${q}${token(inner, o.salt)}${q}`)
    return `\u0000${held.length - 1}\u0000`
  }
  s = s.replace(/"((?:[^"\\]|\\.)*)"/g, (_, inner) => hold('"', inner))
  s = s.replace(/`([^`]*)`/g, (_, inner) => hold('`', inner))
  s = s.replace(/(?<![\p{L}\p{N}])'([^']{1,300})'(?![\p{L}\p{N}])/gu, (_, inner) => hold("'", inner))
  const out = s
    .split(/(\s+)/)
    .map((tok) => (/^\s*$/.test(tok) ? tok : tok.split(/(\u0000\d+\u0000)/).map((p) => (/^\u0000\d+\u0000$/.test(p) ? p : tokText(p, o))).join('')))
    .join('')
    .replace(/<w>(?:(\s+)<w>)+/g, (m) => `<w×${m.split('<w>').length - 1}>`)
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => held[Number(i)])
}

// --- masking for the UI (neutral screenshots) -----------------------------------------------
const LOREM = 'loremipsumdolorsitametconsecteturadipiscingelitseddoeiusmodtemporincididuntutlaboreetdoloremagnaaliquautenimadminimveniam'
// Same length, same word lengths, same capitals, different letters: the layout a title makes
// without the title. Equal strings mask alike; the start in the filler depends on the string.
export function loremMask(s) {
  let i = parseInt(hashOf(s, 'lorem'), 16)
  let out = ''
  for (const ch of s) {
    if (/\p{Lu}/u.test(ch)) out += LOREM[i++ % LOREM.length].toUpperCase()
    else if (/\p{L}/u.test(ch)) out += LOREM[i++ % LOREM.length]
    else if (/\p{N}/u.test(ch)) out += String(i++ % 10)
    else out += ch
  }
  return out
}

// An API response for the web app with every content string masked. Keys, ids, numbers, dates,
// enums and same-site paths (media URLs carry only ids and opaque tokens) stay as they are, so
// the app works; an outside URL becomes a placeholder.
export function maskValue(v, key = '') {
  if (typeof v === 'string') {
    if (v === '') return v
    if (PATH_KEYS.has(key)) return `/${loremMask(v.replace(/^\//, ''))}`
    if (!CONTENT_KEYS.has(key)) {
      if (shapeOf(v)) return v
      if (ENUM_KEYS.has(key) && RE.enumTok.test(v)) return v
      if (key === 'key' && RE.rowKey.test(v)) return v
      if (/^\/[^\s]*$/.test(v)) return v
      const m = v.match(/^https?:\/\/([^/?#]+)/i)
      // flix's own absolute URLs (playback on MEDIA_ORIGIN) carry ids and a signed token: the player needs them
      if (m) return knownHost(m[1].replace(/^[^@]*@/, '').replace(/:\d+$/, '')) ? v : 'https://example.invalid/'
    }
    return loremMask(v)
  }
  if (Array.isArray(v)) return v.map((x) => maskValue(x, key))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskValue(x, k)]))
  return v
}

// --- the last net ---------------------------------------------------------------------------
// A deny-list pass over finished output (the privacy check's lists of library names): whatever
// the allow-list let through that names something from the library is replaced. Returns the
// text and the number of replacements; with no terms it returns the text unchanged.
export function denyScrubber(terms, allow = []) {
  const skip = new Set(allow)
  const list = [...new Set(terms)].filter((t) => t.length >= 4 && !skip.has(t)).sort((a, b) => b.length - a.length)
  if (!list.length) return (text) => ({ text, hits: 0 })
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
  return (text) => {
    let hits = 0
    return { text: text.replace(re, () => (hits++, '<deny>')), hits }
  }
}
