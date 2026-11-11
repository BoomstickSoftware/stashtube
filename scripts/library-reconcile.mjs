#!/usr/bin/env node
// Reconciles the video files on disk with Stash and Whisparr: files Stash never scanned, files
// Whisparr does not track, records whose file is gone, Stash scenes with no StashDB id although
// Whisparr's folder name carries one (linkable), and scenes whose StashDB id differs between the
// two. Read-only unless asked: --scan queues a Stash scan of the unscanned folders, --link sets
// the StashDB id on the linkable scenes and queues one Identify for them, --fill scrapes every
// linked scene that is still bare (Identify matches by fingerprint only, so a file StashDB has no
// fingerprint for stays untitled) by its StashDB id and writes title, date, details, urls,
// studio, performers, tags and cover, creating missing studios, performers and tags. Whisparr is
// never written: a file it does not track is a film to add by hand (the report prints the lookup).
//
// Runs inside the flix pod, which has the keys and the NFS mount, no .env needed on the Mac:
//   kubectl -n flix exec -i deploy/flix -- node - < scripts/library-reconcile.mjs            # report
//   kubectl -n flix exec -i deploy/flix -- node - --scan --link --fill < scripts/library-reconcile.mjs
// Or anywhere with STASH_URL, STASH_API_KEY, WHISPARR_URL, WHISPARR_API_KEY, MEDIA_PATH_MAP and
// WHISPARR_PATH_MAP in the environment and the library mounted where MEDIA_PATH_MAP says.
// env: DISK_ROOT overrides the mount (default: the right side of MEDIA_PATH_MAP).
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const doScan = args.includes('--scan')
const doLink = args.includes('--link')
const doFill = args.includes('--fill')
// counts and ids by default; --names prints paths, folders and titles (wiki/decisions/content-neutral-sessions.md)
const NAMES = args.includes('--names')
const env = (k) => process.env[k] ?? (() => { throw new Error(`${k} is not set`) })()
const [stashPrefix, localRoot] = env('MEDIA_PATH_MAP').split('=')
const [, whisparrRoot] = env('WHISPARR_PATH_MAP').split('=')
const root = process.env.DISK_ROOT ?? localRoot
const VIDEO = /\.(mp4|m4v|mkv|avi|wmv|mov|mpg|mpeg|flv|webm|ts)$/i

const gql = async (query, variables = {}) => {
  const r = await fetch(`${env('STASH_URL')}/graphql`, { method: 'POST', headers: { 'content-type': 'application/json', ApiKey: env('STASH_API_KEY') }, body: JSON.stringify({ query, variables }) })
  const j = await r.json()
  if (j.errors) throw new Error(`Stash: ${JSON.stringify(j.errors).slice(0, 300)}`)
  return j.data
}
const whisparr = async (path) => {
  const r = await fetch(`${env('WHISPARR_URL')}/api/v3/${path}`, { headers: { 'X-Api-Key': env('WHISPARR_API_KEY') } })
  if (!r.ok) throw new Error(`Whisparr ${path}: HTTP ${r.status}`)
  return r.json()
}

// 1. disk, as Stash paths (/data/adult/…), so one key form serves all three
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : VIDEO.test(e.name) ? [join(dir, e.name)] : []))
const disk = new Set(walk(root).map((p) => stashPrefix + p.slice(localRoot.length)))

// 2. Stash and Whisparr
const { findScenes } = await gql(`{ findScenes(filter:{per_page:-1}) { scenes { id title studio { id name } stash_ids { endpoint stash_id } files { path } } } }`)
const scenes = findScenes.scenes
const byStashPath = new Map(scenes.flatMap((s) => s.files.map((f) => [f.path, s])))
const movies = await whisparr('movie')
const toStash = (p) => (p && p.startsWith(whisparrRoot) ? stashPrefix + p.slice(whisparrRoot.length) : p)
const byWhisparrPath = new Map(movies.filter((m) => m.movieFile?.path).map((m) => [toStash(m.movieFile.path), m]))
const stashBox = scenes.find((s) => s.stash_ids.length)?.stash_ids[0].endpoint ?? 'https://stashdb.org/graphql'
const isUuid = (v) => /^[0-9a-f-]{36}$/.test(v ?? '')

// 3. the differences
const notInStash = [...disk].filter((p) => !byStashPath.has(p)).sort()
const notInWhisparr = [...disk].filter((p) => !byWhisparrPath.has(p)).sort()
const stashGone = [...byStashPath.keys()].filter((p) => !disk.has(p)).sort()
const whisparrGone = [...byWhisparrPath.keys()].filter((p) => !disk.has(p)).sort()
const unlinked = scenes.filter((s) => !s.stash_ids.length && s.files.length)
// an id another Stash scene already holds is not linked again: that scene's fingerprint or a
// resolved conflict says it is that video, so Whisparr's label on this file is wrong
const held = new Set(scenes.flatMap((s) => s.stash_ids.map((x) => x.stash_id)))
const candidates = unlinked.map((s) => ({ s, m: byWhisparrPath.get(s.files[0].path) })).filter(({ m }) => isUuid(m?.stashId ?? m?.foreignId))
const linkable = candidates.filter(({ m }) => !held.has(m.stashId ?? m.foreignId))
const taken = candidates.filter(({ m }) => held.has(m.stashId ?? m.foreignId))
const rest = unlinked.filter((s) => !candidates.some((l) => l.s === s))
// StashDB has no feature films (Whisparr matches those by TMDB), so a film without an id is normal
const films = rest.filter((s) => s.files[0].path.startsWith(`${stashPrefix}/movies/`))
const unlinkable = rest.filter((s) => !films.includes(s))
const disagree = scenes.filter((s) => s.stash_ids.length).map((s) => ({ s, m: byWhisparrPath.get(s.files[0]?.path) })).filter(({ s, m }) => m && isUuid(m.stashId ?? m.foreignId) && (m.stashId ?? m.foreignId) !== s.stash_ids[0].stash_id)
const noFile = movies.filter((m) => !m.hasFile)
const bare = scenes.filter((s) => s.stash_ids.length && !(s.title && s.studio) && !s.files[0]?.path.startsWith(`${stashPrefix}/movies/`))

const idOf = (i) => i?.s?.id ?? i?.id
const show = (title, items, f = (x) => x) => { console.log(`\n${title}: ${items.length}`); if (!NAMES) { const ids = items.map(idOf).filter((x) => x !== undefined); if (ids.length) console.log(`  ids: ${ids.slice(0, 50).join(' ')}${ids.length > 50 ? ' …' : ''}`); return } for (const i of items.slice(0, 50)) console.log(`  ${f(i)}`); if (items.length > 50) console.log(`  … ${items.length - 50} more`) }
console.log(`disk ${disk.size} videos under ${root} | Stash ${scenes.length} scenes | Whisparr ${movies.length} records, ${byWhisparrPath.size} with a file`)
show('On disk, not in Stash (needs a scan)', notInStash)
show('On disk, not in Whisparr (a film: add it by hand, GET movie/lookup?term=<title>, POST movie with the folder as path, then RescanMovie)', notInWhisparr)
show('In Stash, file gone from disk', stashGone)
show('In Whisparr, file gone from disk', whisparrGone)
show('Stash scenes without a StashDB id that Whisparr can supply (--link)', linkable, ({ s, m }) => `${s.id} -> ${m.stashId ?? m.foreignId}  ${s.files[0].path.split('/').slice(-2, -1)[0].slice(0, 70)}`)
show("Stash scenes without a StashDB id whose Whisparr id is already on another scene (Whisparr's label is wrong; left unlinked)", taken, ({ s, m }) => `${s.id} (Whisparr says ${m.stashId ?? m.foreignId})  ${s.files[0].path.split('/').pop().slice(0, 60)}`)
show('Stash scenes without a StashDB id and none in Whisparr either (scrape by hand)', unlinkable, (s) => `${s.id}  ${s.files[0].path.replace(stashPrefix, '').slice(0, 90)}`)
console.log(`\nFeature films without a StashDB id (normal, StashDB has no films): ${films.length}`)
show('StashDB id differs between Stash and Whisparr (left as is; StashDB duplicates or a Whisparr mismatch)', disagree, ({ s, m }) => `${s.id} ${s.stash_ids[0].stash_id} vs ${m.stashId ?? m.foreignId}  ${s.title.slice(0, 50)}`)
show('Whisparr records without a file (fetching or waiting, not on disk)', noFile, (m) => `${m.id} ${m.itemType} ${m.studioTitle ?? ''} | ${m.title.slice(0, 50)}`)
show('Linked to StashDB but still bare, Identify found no fingerprint (--fill scrapes them by id)', bare, (s) => `${s.id} ${s.stash_ids[0].stash_id}  ${s.files[0].path.split('/').slice(-2, -1)[0].slice(0, 70)}`)

// 4. the writes, only when asked
if (doScan && notInStash.length) {
  const paths = [...new Set(notInStash.map((p) => p.slice(0, p.lastIndexOf('/'))))]
  const { metadataScan } = await gql(`mutation($paths:[String!]) { metadataScan(input:{paths:$paths, scanGenerateCovers:true, scanGeneratePreviews:true, scanGenerateSprites:true, scanGeneratePhashes:true}) }`, { paths })
  console.log(`\nqueued Stash scan job ${metadataScan} for ${paths.length} folders; run again with --link once it finishes to link and identify the new scenes`)
}
if (doLink && linkable.length) {
  const m = 'mutation { ' + linkable.map(({ s, m }, i) => `u${i}: sceneUpdate(input:{id:"${s.id}", stash_ids:[{endpoint:"${stashBox}", stash_id:"${m.stashId ?? m.foreignId}"}]}) { id }`).join(' ') + ' }'
  const linked = Object.keys(await gql(m)).length
  const { metadataIdentify } = await gql(`mutation($ids:[ID!]) { metadataIdentify(input:{ sceneIDs:$ids, sources:[{ source:{ stash_box_endpoint:"${stashBox}" } }], options:{ setCoverImage:true, includeMalePerformers:true, skipMultipleMatches:true, setOrganized:false } }) }`, { ids: linkable.map(({ s }) => s.id) })
  console.log(`\nlinked ${linked} scenes to StashDB and queued Identify job ${metadataIdentify}; check titles and studios when the queue is empty (scripts/stash.py jobs --wait)`)
}
if (doFill && bare.length) {
  // one scrape per scene, by its StashDB id; the stored_ids the scraper resolves are reused and
  // the rest created once (cached by StashDB id, or by name for tags)
  const studios = new Map(), performers = new Map(), tags = new Map()
  const esc = (v) => JSON.stringify(v ?? null)
  let done = 0, failed = 0
  for (const s of bare) {
    const id = s.stash_ids[0].stash_id
    try {
      const { scrapeSingleScene } = await gql(`query($q:String!) { scrapeSingleScene(source:{ stash_box_endpoint:"${stashBox}" }, input:{ query:$q }) { title code date details director urls remote_site_id image studio { stored_id name url remote_site_id } performers { stored_id name gender disambiguation url remote_site_id images } tags { stored_id name } } }`, { q: id })
      const r = scrapeSingleScene.find((x) => x.remote_site_id === id) ?? scrapeSingleScene[0]
      if (!r) throw new Error('StashDB has no such scene')
      let studioId = r.studio?.stored_id ?? null
      if (r.studio && !studioId) {
        studioId = studios.get(r.studio.remote_site_id) ?? (await gql(`mutation { studioCreate(input:{ name:${esc(r.studio.name)}, url:${esc(r.studio.url)}, stash_ids:[{endpoint:"${stashBox}", stash_id:${esc(r.studio.remote_site_id)}}] }) { id } }`)).studioCreate.id
        studios.set(r.studio.remote_site_id, studioId)
      }
      const performerIds = []
      for (const p of r.performers ?? []) {
        let pid = p.stored_id ?? performers.get(p.remote_site_id)
        if (!pid) {
          pid = (await gql(`mutation { performerCreate(input:{ name:${esc(p.name)}, disambiguation:${esc(p.disambiguation)}, gender:${p.gender ?? null}, urls:${esc(p.url ? [p.url] : [])}, image:${esc(p.images?.[0])}, stash_ids:[{endpoint:"${stashBox}", stash_id:${esc(p.remote_site_id)}}] }) { id } }`)).performerCreate.id
          performers.set(p.remote_site_id, pid)
        }
        performerIds.push(pid)
      }
      const tagIds = []
      for (const t of r.tags ?? []) {
        let tid = t.stored_id ?? tags.get(t.name)
        if (!tid) {
          tid = (await gql(`mutation { tagCreate(input:{ name:${esc(t.name)} }) { id } }`)).tagCreate.id
          tags.set(t.name, tid)
        }
        tagIds.push(tid)
      }
      await gql(`mutation($input:SceneUpdateInput!) { sceneUpdate(input:$input) { id } }`, { input: { id: s.id, title: r.title, code: r.code, date: r.date, details: r.details, director: r.director, urls: r.urls ?? [], studio_id: studioId, performer_ids: performerIds, tag_ids: tagIds, cover_image: r.image ?? undefined } })
      done++
      console.log(NAMES ? `  filled ${s.id}: ${r.title?.slice(0, 50)} | ${r.studio?.name ?? '-'} | ${(r.performers ?? []).map((p) => p.name).join(', ').slice(0, 60)}` : `  filled ${s.id}: studio ${r.studio ? 'yes' : 'no'}, ${(r.performers ?? []).length} performers, ${(r.tags ?? []).length} tags`)
    } catch (e) {
      failed++
      console.log(`  FAILED ${s.id} ${id}: ${e.message.slice(0, 200)}`)
    }
  }
  console.log(`\nfilled ${done} scenes, ${failed} failed; created ${studios.size} studios, ${performers.size} performers, ${tags.size} tags`)
}
if (!doScan && !doLink && !doFill && (notInStash.length || linkable.length || bare.length)) console.log('\ndry run: nothing changed; --scan queues the scan, --link sets the ids and identifies, --fill scrapes the bare linked scenes')
