function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

// MEDIA_PATH_MAP="/data=/media" maps the path Stash reports to the path of the same
// file on this host's NFS mount. Several pairs separate with commas. Unset: every
// stream goes through Stash.
function pathMap(raw: string | undefined): [string, string][] {
  if (!raw) return []
  return raw
    .split(',')
    .map((pair) => pair.split('='))
    .filter((p) => p.length === 2 && p[0] && p[1])
    .map(([from, to]) => [from.replace(/\/$/, ''), to.replace(/\/$/, '')])
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  stashUrl: required('STASH_URL').replace(/\/$/, ''),
  stashApiKey: required('STASH_API_KEY'),
  databaseUrl: required('DATABASE_URL'),
  mediaPathMap: pathMap(process.env.MEDIA_PATH_MAP),
  // Optional login. Unset means no auth (LAN only).
  password: process.env.FLIX_PASSWORD || null,
  sessionSecret: process.env.FLIX_SESSION_SECRET || null,
  // Absolute origin for playback links (e.g. http://192.168.1.152). AirPlay receivers fetch
  // the video themselves and cannot resolve hosts-file names like flix.lan; an IP always
  // works. Unset: links stay relative to whatever host the page came from.
  mediaOrigin: (process.env.MEDIA_ORIGIN || '').replace(/\/$/, ''),
  // Built web app to serve; unset in dev, where Vite serves it.
  webDist: process.env.WEB_DIST || null,
  cache: {
    dir: process.env.CACHE_DIR || `${process.cwd()}/.cache`,
    assetMaxBytes: num('ASSET_CACHE_MAX_MB', 5120) * 1024 * 1024,
    assetTtl: num('ASSET_CACHE_TTL_HOURS', 168) * 3_600_000,
    // Query results. Change detection clears them sooner when Stash data changes.
    dataTtl: num('DATA_CACHE_TTL_MINUTES', 30) * 60_000,
    dataMaxEntries: num('DATA_CACHE_MAX_ENTRIES', 5000),
    // How often to check Stash for changes while flix is in use; 0 disables.
    pollInterval: num('CHANGE_POLL_SECONDS', 60) * 1000,
  },
}

function num(name: string, fallback: number): number {
  const v = process.env[name]
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`)
  return n
}

if (config.password && !config.sessionSecret) {
  throw new Error('FLIX_SESSION_SECRET is required when FLIX_PASSWORD is set')
}
