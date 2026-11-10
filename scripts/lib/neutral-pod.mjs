// The fetcher behind scripts/neutral.mjs: runs where the keys are (inside the flix pod, piped to
// `node -` like library-reconcile.mjs, or here with --local) and answers one job with one JSON
// envelope on stdout. It only reads: Stash queries (a mutation is refused), Whisparr GETs, and
// Postgres inside a READ ONLY transaction. Its output is raw; scripts/neutral.mjs captures it and
// prints only the redacted form, so nothing this writes reaches a terminal.
// argv[2]: the job as base64 JSON: {op:'stash',query,variables} | {op:'whisparr',path}
//          | {op:'db'} | {op:'sql',sql} | {op:'batch',jobs:{name: job}}
const job = JSON.parse(Buffer.from(process.argv.at(-1), 'base64').toString('utf8'))
const env = (k) => process.env[k] ?? (() => { throw Object.assign(new Error(`${k} is not set`), { code: 'E_ENV' }) })()
const isWrite = (q) => /(^|[}\s])(mutation|subscription)\b/.test(q.replace(/"""[\s\S]*?"""|"(?:[^"\\]|\\.)*"/g, '""').replace(/#[^\n]*/g, ''))

async function http(url, init) {
  const t0 = performance.now()
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) })
  const text = await r.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = { nonJson: true, contentType: r.headers.get('content-type'), length: text.length }
  }
  return { ok: r.ok, status: r.status, ms: Math.round(performance.now() - t0), bytes: Buffer.byteLength(text), body }
}

async function stash({ query, variables }) {
  if (isWrite(query)) return { ok: false, refused: 'mutation or subscription: this tool only reads' }
  const r = await http(`${env('STASH_URL').replace(/\/$/, '')}/graphql`, { method: 'POST', headers: { 'content-type': 'application/json', ApiKey: env('STASH_API_KEY') }, body: JSON.stringify({ query, variables: variables ?? {} }) })
  return { ...r, ok: r.ok && !r.body?.errors, errors: r.body?.errors?.map((e) => ({ message: e.message, path: e.path, code: e.extensions?.code })), body: r.body?.data ?? null }
}

const whisparr = ({ path }) => http(`${env('WHISPARR_URL').replace(/\/$/, '')}/api/v3/${String(path).replace(/^\//, '')}`, { headers: { 'X-Api-Key': env('WHISPARR_API_KEY') } })

async function withDb(fn) {
  const { default: postgres } = await import('postgres')
  const sql = postgres(env('DATABASE_URL'), { max: 1, onnotice: () => {} })
  const t0 = performance.now()
  try {
    // READ ONLY: Postgres itself refuses any write this could be made to send
    const body = await sql.begin('read only', async (tx) => {
      await tx.unsafe('set local statement_timeout = 30000')
      return fn(tx)
    })
    return { ok: true, ms: Math.round(performance.now() - t0), body }
  } finally {
    await sql.end({ timeout: 2 })
  }
}

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`
const ENUM_COLS = new Set(['kind', 'mode', 'state', 'status', 'action', 'source', 'type', 'outcome'])
const db = () =>
  withDb(async (tx) => {
    const tables = await tx.unsafe(`select c.relname as table, pg_total_relation_size(c.oid)::bigint as bytes from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)
    const out = []
    for (const t of tables) {
      const cols = await tx.unsafe(`select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [t.table])
      const parts = ['count(*)::bigint as "rows"']
      for (const c of cols) {
        const q = ident(c.column_name)
        const a = (fn) => ident(`${fn}:${c.column_name}`)
        parts.push(`count(*) filter (where ${q} is null)::bigint as ${a('nulls')}`)
        if (/int|numeric|real|double|timestamp|date/.test(c.data_type)) parts.push(`min(${q})::text as ${a('min')}`, `max(${q})::text as ${a('max')}`)
        if (/text|char/.test(c.data_type)) parts.push(`count(distinct ${q})::bigint as ${a('distinct')}`, `round(avg(length(${q})))::int as ${a('avglen')}`, `count(*) filter (where ${q} ~ '^[0-9]+$' or ${q} ~ '^[0-9a-f-]{36}$')::bigint as ${a('idlike')}`)
        if (c.data_type === 'boolean') parts.push(`count(*) filter (where ${q})::bigint as ${a('true')}`)
        if (/json/.test(c.data_type)) parts.push(`round(avg(pg_column_size(${q})))::int as ${a('avgbytes')}`)
      }
      const [agg] = await tx.unsafe(`select ${parts.join(', ')} from ${ident(t.table)}`)
      const enums = {}
      const json = {}
      for (const c of cols) {
        if (ENUM_COLS.has(c.column_name) && /text|char/.test(c.data_type)) enums[c.column_name] = await tx.unsafe(`select ${ident(c.column_name)} as value, count(*)::bigint as n from ${ident(t.table)} group by 1 order by 2 desc limit 20`)
        if (/json/.test(c.data_type)) json[c.column_name] = (await tx.unsafe(`select ${ident(c.column_name)} as v from ${ident(t.table)} limit 200`)).map((r) => r.v)
      }
      out.push({ table: t.table, bytes: Number(t.bytes), columns: cols, agg, enums, json })
    }
    return out
  })

const run = async (j) => {
  try {
    if (j.op === 'stash') return await stash(j)
    if (j.op === 'whisparr') return await whisparr(j)
    if (j.op === 'db') return await db()
    if (j.op === 'sql') return await withDb((tx) => tx.unsafe(j.sql))
    if (j.op === 'batch') {
      const body = {}
      for (const [k, x] of Object.entries(j.jobs)) body[k] = await run(x) // one at a time: Stash is SQLite, Whisparr is small
      return { ok: true, body }
    }
    return { ok: false, refused: `unknown op ${j.op}` }
  } catch (e) {
    return { ok: false, thrown: { name: e.name, code: e.code ?? e.cause?.code ?? null, message: e.message } }
  }
}
process.stdout.write(JSON.stringify(await run(job), (_, v) => (typeof v === 'bigint' ? Number(v) : v)))
