#!/usr/bin/env node
// The script registry (scripts/manifest.json): find a script before doing a thing by hand, and
// keep the manifest true. No dependencies; run from anywhere.
//
//   node scripts/scripts.mjs list              # every script, one line each
//   node scripts/scripts.mjs search <words…>   # ranked by name, tags, does, usage
//   node scripts/scripts.mjs show <name>       # the whole entry
//   node scripts/scripts.mjs lint              # every file in scripts/ registered, every entry's
//                                              # file present, required keys set, wiki slugs exist
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = join(ROOT, 'scripts', 'manifest.json')
const REQUIRED = ['name', 'file', 'does', 'usage', 'writes', 'tags', 'wiki']

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const [cmd = 'list', ...rest] = process.argv.slice(2)

const line = (s) => `${s.name.padEnd(14)} ${s.does}\n${' '.repeat(15)}${s.usage[0]}`

if (cmd === 'list') {
  for (const s of manifest.scripts) console.log(line(s))
  if (manifest.external?.length) {
    console.log('\nIn other repos (read-only from flix):')
    for (const s of manifest.external) console.log(`${s.name.padEnd(14)} [${s.repo}] ${s.does}\n${' '.repeat(15)}${s.usage[0]}`)
  }
} else if (cmd === 'search') {
  const words = rest.map((w) => w.toLowerCase()).filter(Boolean)
  if (!words.length) fail('usage: scripts.mjs search <words…>')
  const score = (s) => {
    const fields = [
      [s.name, 5],
      [(s.tags ?? []).join(' '), 4],
      [s.does, 2],
      [s.usage.join(' '), 1],
      [JSON.stringify(s.env ?? {}), 1],
    ]
    return words.reduce((n, w) => n + fields.reduce((m, [text, k]) => m + (text.toLowerCase().includes(w) ? k : 0), 0), 0)
  }
  const hits = [...manifest.scripts, ...(manifest.external ?? []).map((s) => ({ ...s, tags: [s.repo], writes: '' }))]
    .map((s) => [score(s), s])
    .filter(([n]) => n > 0)
    .sort((a, b) => b[0] - a[0])
  if (!hits.length) {
    console.log('no script matches; if the task is scriptable, write one and register it (CLAUDE.md "Scripts are the hands")')
    process.exit(1)
  }
  for (const [n, s] of hits) console.log(`${String(n).padStart(3)}  ${s.repo ? `[${s.repo}] ` : ''}${line(s)}`)
} else if (cmd === 'show') {
  const s = [...manifest.scripts, ...(manifest.external ?? [])].find((x) => x.name === rest[0])
  if (!s) fail(`no script named ${rest[0]}`)
  console.log(JSON.stringify(s, null, 2))
} else if (cmd === 'lint') {
  const errors = []
  const names = new Set()
  const files = new Set()
  for (const s of manifest.scripts) {
    for (const k of REQUIRED) if (s[k] === undefined || (Array.isArray(s[k]) && !s[k].length)) errors.push(`${s.name ?? '?'}: missing ${k}`)
    if (names.has(s.name)) errors.push(`duplicate name ${s.name}`)
    names.add(s.name)
    if (s.file) {
      files.add(s.file)
      if (!existsSync(join(ROOT, s.file))) errors.push(`${s.name}: ${s.file} does not exist`)
    }
    if (s.wiki && !wikiHas(s.wiki)) errors.push(`${s.name}: wiki page [[${s.wiki}]] does not exist`)
  }
  for (const f of readdirSync(join(ROOT, 'scripts'))) {
    if (!/\.(mjs|js|ts|sh|py)$/.test(f)) continue
    const rel = relative(ROOT, join(ROOT, 'scripts', f))
    if (!files.has(rel)) errors.push(`${rel} is not registered in scripts/manifest.json`)
  }
  for (const s of manifest.external ?? []) {
    for (const k of ['name', 'repo', 'file', 'does', 'usage']) if (!s[k]) errors.push(`external ${s.name ?? '?'}: missing ${k}`)
  }
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`)
    process.exit(1)
  }
  console.log(`ok: ${manifest.scripts.length} scripts, ${manifest.external?.length ?? 0} external`)
} else {
  fail(`unknown command ${cmd}; see the header of scripts/scripts.mjs`)
}

function wikiHas(slug) {
  const stack = [join(ROOT, 'wiki')]
  while (stack.length) {
    const dir = stack.pop()
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) stack.push(join(dir, e.name))
      else if (e.name === `${slug}.md`) return true
    }
  }
  return false
}

function fail(msg) {
  console.error(msg)
  process.exit(2)
}
