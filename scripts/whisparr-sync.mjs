#!/usr/bin/env node
// Runs the Whisparr sync on the flix server and prints what it did or would do. Stash favourites
// (performers and studios) are Whisparr's discovery sources and every other performer and studio
// is off; each new release of a followed one is fetched (monitored, one search per scene, spaced);
// monitored scenes that are not a Get, not downloading and not such a new release are
// unmonitored (wiki/architecture/whisparr-sync.md). No performer- or studio-wide search, ever.
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
  console.error(`POST /api/sync/run: HTTP ${res.status} ${await res.text()}`)
  process.exit(1)
}
const s = await res.json()
const by = (a) => s.items.filter((i) => i.action === a)
const show = (title, items) => {
  if (!items.length) return
  console.log(`\n${title} (${items.length})`)
  for (const i of items) console.log(`  ${i.kind.padEnd(9)} ${i.name}${i.error ? `  FAILED: ${i.error}` : ''}${i.action === 'unmonitor' ? `  (${i.reason})` : ''}`)
}
console.log(`${s.outcome}: ${s.detail}`)
show(apply ? 'Watched now' : 'Would watch', by('monitor'))
show(apply ? 'Tagged' : 'Would tag (already watched)', by('adopt'))
show(apply ? 'Unmonitored' : 'Would unmonitor', by('unmonitor'))
show('Followed but not in Whisparr (add them there)', by('missing'))
show(apply ? 'Fetched (new releases)' : 'Would fetch (new releases)', by('fetch'))
console.log(`\nwatching ${s.managed} performers and studios; scenes ${apply ? 'unmonitored' : 'to unmonitor'}: ${s.scenes}; new scenes fetched: ${s.fetched ?? 0}`)
if (!apply && s.outcome === 'planned') console.log('dry run: nothing changed; add --apply to do it')
process.exit(s.outcome === 'failed' || s.outcome === 'skipped' ? 1 : 0)
