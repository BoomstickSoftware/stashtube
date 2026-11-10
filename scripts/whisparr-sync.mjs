#!/usr/bin/env node
// Runs the Whisparr guard on the flix server and prints what it did or would do: every performer
// and studio in Whisparr is unmonitored (flix discovers followed ones' new releases from its
// StashDB mirror and fetches them itself), and a monitored scene stays monitored only if flix
// fetched it or it is downloading (wiki/architecture/whisparr-sync.md). Never a search.
// Needs no keys: the server has them.
//
//   node scripts/whisparr-sync.mjs [server]            # dry run (default http://flix.lan)
//   node scripts/whisparr-sync.mjs [server] --apply    # do it, whatever the Settings switch says
//   node scripts/whisparr-sync.mjs [server] --apply --force   # also when it would watch far fewer than before
const args = process.argv.slice(2)
const server = (args.find((a) => !a.startsWith('--')) ?? 'http://flix.lan').replace(/\/$/, '')
const apply = args.includes('--apply')
const force = args.includes('--force')

const res = await fetch(`${server}/api/sync/run`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: server }, // the server refuses other origins' writes
  body: JSON.stringify({ apply, force }),
  signal: AbortSignal.timeout(15 * 60_000),
})
if (!res.ok) {
  console.error(`POST /api/sync/run: HTTP ${res.status}${names ? ` ${await res.text()}` : ' (--names prints the body)'}`)
  process.exit(1)
}
const s = await res.json()
const by = (a) => s.items.filter((i) => i.action === a)
// counts by default; --names lists each performer and studio (wiki/decisions/content-neutral-sessions.md)
const names = args.includes('--names')
const show = (title, items) => {
  if (!items.length) return
  const kinds = Object.entries(Object.groupBy(items, (i) => i.kind)).map(([k, v]) => `${v.length} ${k}`).join(', ')
  console.log(`\n${title} (${items.length}: ${kinds}${items.some((i) => i.error) ? `; ${items.filter((i) => i.error).length} FAILED` : ''})`)
  if (!names) return
  for (const i of items) console.log(`  ${i.kind.padEnd(9)} ${i.name}${i.error ? `  FAILED: ${i.error}` : ''}${i.action === 'unmonitor' ? `  (${i.reason})` : ''}`)
}
console.log(`${s.outcome}: ${s.detail}`)
show(apply ? 'Watched now' : 'Would watch', by('monitor'))
show(apply ? 'Tagged' : 'Would tag (already watched)', by('adopt'))
show(apply ? 'Unmonitored' : 'Would unmonitor', by('unmonitor'))
show('Followed but not in Whisparr (add them there)', by('missing'))
console.log(`\nfollowing ${s.managed} performers and studios; other scenes ${apply ? 'unmonitored' : 'to unmonitor'}: ${s.scenes}`)
if (!apply && s.outcome === 'planned') console.log('dry run: nothing changed; add --apply to do it')
process.exit(s.outcome === 'failed' || s.outcome === 'skipped' ? 1 : 0)
