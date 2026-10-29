// Preloaded by `pnpm test` (node --import): config.ts needs these at import time. Any value
// already in the environment wins. Tests never reach Stash or Postgres.
process.env.STASH_URL ??= 'http://stash.test'
process.env.STASH_API_KEY ??= 'test'
process.env.DATABASE_URL ??= 'postgres://test@127.0.0.1:1/test'
process.env.CACHE_DIR ??= `${process.cwd()}/.cache-test`
process.env.CHANGE_POLL_SECONDS ??= '0'
process.env.WARM_AT_UTC ??= ''
