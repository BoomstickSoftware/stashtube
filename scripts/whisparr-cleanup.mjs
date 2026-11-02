#!/usr/bin/env node
// Deletes Whisparr's scene records that have no file, unless downloading or grabbed, a Get from
// flix still waiting, or in flix's Get queue; then every studio with no scene record left. Never
// a file, never an import exclusion, never a record with a file. Starts with a Whisparr Backup;
// scenes go 100 at a time, 5 s apart, on the flix server (wiki/architecture/whisparr-cleanup.md).
// Dry run by default. Needs no keys: the server has them.
//
//   node scripts/whisparr-cleanup.mjs [server]                          # what would go
//   node scripts/whisparr-cleanup.mjs [server] --studio <stashdb-id>    # one studio only
//   node scripts/whisparr-cleanup.mjs [server] --studio <id> --apply    # the test: that studio's records, then the studio
//   node scripts/whisparr-cleanup.mjs [server] --apply                  # everything; waits and prints progress
const args = process.argv.slice(2)
const at = args.indexOf('--studio')
const studio = at >= 0 ? args[at + 1] : undefined
const server = (args.find((a, i) => !a.startsWith('--') && i !== at + 1) ?? 'http://flix.lan').replace(/\/$/, '')
const apply = args.includes('--apply')

const call = async (method, path, body) => {
  const res = await fetch(`${server}/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json', Origin: server } : { Origin: server },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10 * 60_000),
  })
  if (!res.ok) {
    console.error(`${method} ${path}: HTTP ${res.status} ${await res.text()}`)
    process.exit(1)
  }
  return res.json()
}

const first = await call('POST', '/whisparr/cleanup', { apply, studio })
if (!apply) {
  console.log(`${first.studio ? 'that studio' : 'Whisparr'}: ${first.total} scene records in all; would delete ${first.remove}`)
  console.log(`studios: ${first.studios} in all; would delete ${first.studiosRemove} left with no scene`)
  console.log(`kept: ${Object.entries(first.kept).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  console.log('dry run: nothing changed; add --apply to do it')
  process.exit(0)
}
let last = ''
for (;;) {
  const s = await call('GET', '/whisparr/cleanup')
  const line = `${s.phase}: scenes ${s.deleted}/${s.planned}; studios ${s.studios.deleted}/${s.studios.planned}${s.studios.failed ? ` (${s.studios.failed} failed)` : ''}${s.error ? `; ERROR ${s.error}` : ''}`
  if (line !== last) console.log(line)
  last = line
  if (!s.running) process.exit(s.error ? 1 : 0)
  await new Promise((r) => setTimeout(r, 5000))
}
