#!/usr/bin/env node
// Wiki tooling for wiki/ (see wiki/CONVENTIONS.md). No dependencies; run from the repo root.
//
//   node scripts/wiki.mjs search <words…> [--kind k] [--tag t] [-n 10]
//   node scripts/wiki.mjs index          # regenerate wiki/index.md from frontmatter
//   node scripts/wiki.mjs lint           # exit 1 on errors; warnings go to stderr
//   node scripts/wiki.mjs tags           # tag counts
//   node scripts/wiki.mjs stale [days]   # pages whose `verified` is older than days (30)
//   node scripts/wiki.mjs show <slug>    # print a page's path and frontmatter
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WIKI = join(ROOT, 'wiki')
// Pages that name library content (performers, studios, indexers, download history) live in the
// gitignored private/wiki/ with the same layout; loaded when present, never in wiki/index.md.
const PRIVATE = join(ROOT, 'private', 'wiki')
const KINDS = ['architecture', 'feature', 'integration', 'decision', 'runbook', 'gotcha', 'history', 'hub']
const KIND_DIR = {
  architecture: 'architecture',
  feature: 'features',
  integration: 'integrations',
  decision: 'decisions',
  runbook: 'runbooks',
  gotcha: 'gotchas',
  history: 'history',
  hub: '.',
}
const STATUSES = ['current', 'superseded', 'proposed', 'record']
const REQUIRED = ['title', 'kind', 'summary', 'tags', 'status', 'verified', 'updated']
const GENERATED = new Set(['index.md', 'log.md'])
const MAX_BODY_LINES = 120
const STALE_DAYS = 60
const ISO = /^\d{4}-\d{2}-\d{2}$/

// ---------- loading ----------

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.md')) out.push(p)
  }
  return out
}

// A deliberately small YAML reader: scalars, [a, b] lists, "- item" lists, >- folded blocks.
function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return { fm: null, body: text, error: 'no frontmatter' }
  const end = text.indexOf('\n---', 4)
  if (end < 0) return { fm: null, body: text, error: 'unterminated frontmatter' }
  const raw = text.slice(4, end)
  const body = text.slice(end + 4).replace(/^\n/, '')
  const fm = {}
  const lines = raw.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith('#')) continue
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!m) return { fm, body, error: `cannot parse frontmatter line ${i + 1}: ${line}` }
    const key = m[1]
    let value = m[2].replace(/\s+#.*$/, '').trim()
    if (value === '>-' || value === '>' || value === '|' || value === '|-') {
      const parts = []
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim())
      value = parts.join(' ')
    } else if (value === '') {
      const items = []
      while (i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1])) items.push(unquote(lines[++i].replace(/^\s+-\s/, '')))
      fm[key] = items
      continue
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      fm[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s.trim()))
        .filter(Boolean)
    } else fm[key] = unquote(value)
  }
  return { fm, body, error: null }
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1)
  return s
}

// Links inside fenced blocks or inline code are examples, not references.
function stripCode(body) {
  return body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
}

const SPECIAL = new Set(['index', 'log'])

function loadPages() {
  const pages = []
  const sources = [[WIKI, false]]
  if (existsSync(PRIVATE)) sources.push([PRIVATE, true])
  for (const [base, priv] of sources) for (const path of walk(base)) {
    const rel = relative(base, path)
    const file = rel.split('/').pop()
    if (GENERATED.has(rel)) continue
    const text = readFileSync(path, 'utf8')
    const { fm, body, error } = parseFrontmatter(text)
    pages.push({
      path,
      rel,
      private: priv,
      where: `${priv ? 'private/wiki' : 'wiki'}/${rel}`,
      dir: rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.',
      slug: file.replace(/\.md$/, ''),
      fm: fm ?? {},
      body,
      error,
      links: [...stripCode(body).matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim()),
    })
  }
  return pages.sort((a, b) => a.slug.localeCompare(b.slug))
}

// ---------- index ----------

function renderIndex(pages) {
  const byKind = new Map(KINDS.map((k) => [k, []]))
  for (const p of pages) (byKind.get(p.fm.kind) ?? byKind.get('hub')).push(p)
  const out = []
  out.push('---')
  out.push('title: Index')
  out.push('kind: hub')
  out.push('summary: Generated catalogue of every wiki page by kind, then by tag; regenerate with `node scripts/wiki.mjs index`.')
  out.push('tags: [wiki, meta]')
  out.push('status: current')
  out.push(`verified: ${today()}`)
  out.push(`updated: ${today()}`)
  out.push('---')
  out.push('')
  out.push('# Index')
  out.push('')
  out.push('_Generated by `node scripts/wiki.mjs index`; do not edit._ Read the summary lines to pick a page,')
  out.push('or run `node scripts/wiki.mjs search <words>`. Conventions: [[CONVENTIONS]]. Recent changes: [[log]].')
  out.push(`Pages: ${pages.length}. Last generated ${today()}.`)
  out.push('')
  const headings = {
    hub: 'Hubs',
    architecture: 'Architecture: how flix is built',
    feature: 'Features: what the user can do',
    integration: 'Integrations: the systems flix talks to',
    decision: 'Decisions: settled choices (do not reopen without the user)',
    runbook: 'Runbooks: how to do things',
    gotcha: 'Gotchas: pitfalls, by symptom',
    history: 'History: dated records of rounds and incidents',
  }
  for (const kind of ['hub', 'architecture', 'feature', 'integration', 'decision', 'runbook', 'gotcha', 'history']) {
    const list = byKind.get(kind)
    if (!list.length) continue
    out.push(`## ${headings[kind]}`)
    out.push('')
    const sorted = kind === 'history' ? [...list].sort((a, b) => b.slug.localeCompare(a.slug)) : list
    for (const p of sorted) {
      const tags = (p.fm.tags ?? []).join(', ')
      const extra = []
      if (p.fm.status && p.fm.status !== 'current' && p.fm.status !== 'record') extra.push(p.fm.status.toUpperCase())
      if (p.fm.symptom) extra.push(`symptom: "${p.fm.symptom}"`)
      out.push(`- [[${p.slug}]] — ${p.fm.summary ?? ''}${extra.length ? ' (' + extra.join('; ') + ')' : ''} · _${tags}_ · verified ${p.fm.verified ?? '?'}`)
    }
    out.push('')
  }
  const tags = new Map()
  for (const p of pages) for (const t of p.fm.tags ?? []) (tags.get(t) ?? tags.set(t, []).get(t)).push(p.slug)
  out.push('## Tags')
  out.push('')
  for (const [t, slugs] of [...tags.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`- **${t}** (${slugs.length}): ${slugs.sort().map((s) => `[[${s}]]`).join(', ')}`)
  }
  out.push('')
  return out.join('\n')
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// ---------- lint ----------

function lint(pages) {
  const errors = []
  const warnings = []
  const slugs = new Map()
  const inbound = new Map(pages.map((p) => [p.slug, 0]))
  for (const p of pages) {
    const where = p.where
    if (slugs.has(p.slug)) errors.push(`${where}: duplicate slug "${p.slug}" (also ${slugs.get(p.slug)})`)
    slugs.set(p.slug, p.where)
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p.slug) && p.slug !== 'CONVENTIONS') errors.push(`${where}: slug must be lower-kebab`)
    if (p.error) {
      errors.push(`${where}: ${p.error}`)
      continue
    }
    for (const k of REQUIRED) if (p.fm[k] === undefined || p.fm[k] === '') errors.push(`${where}: missing "${k}"`)
    if (p.fm.kind && !KINDS.includes(p.fm.kind)) errors.push(`${where}: unknown kind "${p.fm.kind}"`)
    if (p.fm.kind && KIND_DIR[p.fm.kind] && KIND_DIR[p.fm.kind] !== p.dir)
      errors.push(`${where}: kind "${p.fm.kind}" belongs in wiki/${KIND_DIR[p.fm.kind]}/`)
    if (p.fm.status && !STATUSES.includes(p.fm.status)) errors.push(`${where}: unknown status "${p.fm.status}"`)
    if (p.fm.kind === 'history' && p.fm.status !== 'record') errors.push(`${where}: history pages have status: record`)
    if (p.fm.kind === 'history' && !/^\d{4}-\d{2}-\d{2}-/.test(p.slug)) errors.push(`${where}: history slug must start with YYYY-MM-DD-`)
    if (p.fm.kind === 'gotcha' && !p.fm.symptom) errors.push(`${where}: gotcha needs "symptom"`)
    if (p.fm.kind === 'decision' && !p.fm.decided) errors.push(`${where}: decision needs "decided"`)
    if (p.fm.status === 'superseded' && !p.fm.superseded_by) warnings.push(`${where}: superseded without "superseded_by"`)
    for (const k of ['verified', 'updated', 'decided', 'date', 'found'])
      if (p.fm[k] !== undefined && !ISO.test(p.fm[k])) errors.push(`${where}: "${k}" must be YYYY-MM-DD (got "${p.fm[k]}")`)
    if (!Array.isArray(p.fm.tags) || p.fm.tags.length < 1) errors.push(`${where}: "tags" must be a list with at least one tag`)
    else for (const t of p.fm.tags) if (!/^[a-z0-9][a-z0-9-]*$/.test(t)) errors.push(`${where}: tag "${t}" must be lower-kebab`)
    if (typeof p.fm.summary === 'string' && p.fm.summary.length > 220) warnings.push(`${where}: summary is ${p.fm.summary.length} chars; keep it to one sentence`)
    const h1 = p.body.match(/^# (.+)$/m)
    if (!h1) errors.push(`${where}: no H1`)
    const bodyLines = p.body.split('\n').length
    if (bodyLines > MAX_BODY_LINES && p.fm.kind !== 'hub') warnings.push(`${where}: ${bodyLines} body lines (limit ${MAX_BODY_LINES}); split it`)
    for (const l of p.links) {
      if (SPECIAL.has(l)) continue
      const target = pages.find((q) => q.slug === l)
      if (!target) errors.push(`${where}: broken link [[${l}]]`)
      else if (target.private && !p.private) errors.push(`${where}: links private page [[${l}]]; tracked pages must not (a fresh clone has no private/)`)
      else if (l !== p.slug) inbound.set(l, (inbound.get(l) ?? 0) + 1)
    }
    for (const k of ['related', 'superseded_by']) {
      const v = p.fm[k]
      for (const l of Array.isArray(v) ? v : v ? [v] : [])
        if (SPECIAL.has(l)) continue
        else if (!pages.some((q) => q.slug === l)) errors.push(`${where}: ${k} names unknown page "${l}"`)
        else if (pages.find((q) => q.slug === l).private && !p.private) errors.push(`${where}: ${k} names private page "${l}"; tracked pages must not`)
        else inbound.set(l, (inbound.get(l) ?? 0) + 1)
    }
    if (p.fm.verified && daysAgo(p.fm.verified) > STALE_DAYS) warnings.push(`${where}: verified ${p.fm.verified}, over ${STALE_DAYS} days ago`)
  }
  for (const p of pages)
    if (!p.error && p.fm.kind !== 'hub' && p.fm.kind !== 'history' && (inbound.get(p.slug) ?? 0) === 0)
      warnings.push(`${p.where}: orphan (no [[link]] or related: from any other page)`)
  try {
    const current = readFileSync(join(WIKI, 'index.md'), 'utf8')
    if (stripDates(current) !== stripDates(renderIndex(pages.filter((p) => !p.private)))) errors.push('wiki/index.md is out of date: run `node scripts/wiki.mjs index`')
  } catch {
    errors.push('wiki/index.md is missing: run `node scripts/wiki.mjs index`')
  }
  try {
    const log = readFileSync(join(WIKI, 'log.md'), 'utf8')
    const bad = log.split('\n').filter((l) => l.startsWith('## ') && !/^## \[\d{4}-\d{2}-\d{2}\] (init|ingest|correct|decide|lint|query) \| .+/.test(l))
    for (const l of bad) errors.push(`wiki/log.md: entry does not match "## [YYYY-MM-DD] <op> | <title>": ${l}`)
  } catch {
    errors.push('wiki/log.md is missing')
  }
  return { errors, warnings }
}

function stripDates(s) {
  return s.replace(/^(verified|updated): .*$/gm, '').replace(/Last generated \d{4}-\d{2}-\d{2}\./, '')
}

function daysAgo(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// ---------- search ----------

function search(pages, words, opts) {
  const terms = words.map((w) => w.toLowerCase()).filter(Boolean)
  if (!terms.length) throw new Error('search needs at least one word')
  const results = []
  for (const p of pages) {
    if (opts.kind && p.fm.kind !== opts.kind) continue
    if (opts.tag && !(p.fm.tags ?? []).includes(opts.tag)) continue
    const title = String(p.fm.title ?? '').toLowerCase()
    const tags = (p.fm.tags ?? []).join(' ').toLowerCase()
    const summary = String(p.fm.summary ?? '').toLowerCase()
    const symptom = String(p.fm.symptom ?? '').toLowerCase()
    const slug = p.slug.toLowerCase()
    const bodyLower = p.body.toLowerCase()
    let score = 0
    let matchedTerms = 0
    for (const t of terms) {
      let s = 0
      if (title.includes(t) || slug.includes(t)) s += 6
      if (tags.includes(t)) s += 5
      if (symptom.includes(t)) s += 5
      if (summary.includes(t)) s += 3
      const n = count(bodyLower, t)
      s += Math.min(n, 8)
      if (s) matchedTerms++
      score += s
    }
    if (!score) continue
    if (matchedTerms === terms.length) score *= 2
    const lines = p.body
      .split('\n')
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => terms.some((t) => l.toLowerCase().includes(t)))
      .slice(0, 3)
    results.push({ p, score, lines })
  }
  results.sort((a, b) => b.score - a.score || a.p.slug.localeCompare(b.p.slug))
  return results.slice(0, opts.n)
}

function count(hay, needle) {
  let n = 0
  let i = 0
  while ((i = hay.indexOf(needle, i)) >= 0) {
    n++
    i += needle.length
  }
  return n
}

// ---------- main ----------

function main(argv) {
  const [cmd, ...rest] = argv
  const pages = loadPages()
  switch (cmd) {
    case 'index': {
      const pub = pages.filter((p) => !p.private)
      writeFileSync(join(WIKI, 'index.md'), renderIndex(pub))
      console.log(`wiki/index.md: ${pub.length} pages`)
      const priv = pages.filter((p) => p.private)
      if (priv.length) {
        writeFileSync(join(PRIVATE, 'index.md'), renderIndex(priv).replace('title: Index', 'title: Private index').replace('Generated catalogue of every wiki page', 'Generated catalogue of the private (gitignored) pages'))
        console.log(`private/wiki/index.md: ${priv.length} pages`)
      }
      return 0
    }
    case 'lint': {
      const { errors, warnings } = lint(pages)
      for (const w of warnings) console.error(`warn  ${w}`)
      for (const e of errors) console.error(`ERROR ${e}`)
      console.error(`${pages.length} pages, ${errors.length} errors, ${warnings.length} warnings`)
      return errors.length ? 1 : 0
    }
    case 'tags': {
      const tags = new Map()
      for (const p of pages) for (const t of p.fm.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + 1)
      for (const [t, n] of [...tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) console.log(`${String(n).padStart(3)}  ${t}`)
      return 0
    }
    case 'stale': {
      const days = Number(rest[0] ?? 30)
      for (const p of pages) if (p.fm.verified && daysAgo(p.fm.verified) > days) console.log(`${p.fm.verified}  ${p.where}`)
      return 0
    }
    case 'show': {
      const p = pages.find((q) => q.slug === rest[0])
      if (!p) {
        console.error(`no page "${rest[0]}"`)
        return 1
      }
      console.log(p.where)
      for (const [k, v] of Object.entries(p.fm)) console.log(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      return 0
    }
    case 'search': {
      const opts = { n: 10 }
      const words = []
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '--kind') opts.kind = rest[++i]
        else if (rest[i] === '--tag') opts.tag = rest[++i]
        else if (rest[i] === '-n') opts.n = Number(rest[++i])
        else words.push(rest[i])
      }
      const results = search(pages, words, opts)
      if (!results.length) {
        console.log('no matches; try fewer or different words, or read wiki/index.md')
        return 0
      }
      for (const { p, score, lines } of results) {
        console.log(`${String(score).padStart(4)}  ${p.where}  [${p.fm.kind}]  ${p.fm.title}`)
        console.log(`      ${p.fm.summary ?? ''}`)
        for (const { l, i } of lines) console.log(`      ${i + 1}: ${l.trim().slice(0, 140)}`)
      }
      return 0
    }
    default:
      console.error('usage: node scripts/wiki.mjs search <words…> [--kind k] [--tag t] [-n 10] | index | lint | tags | stale [days] | show <slug>')
      return 2
  }
}

process.exit(main(process.argv.slice(2)))
