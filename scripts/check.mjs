#!/usr/bin/env node
// The pre-commit checks, in the order the wiki's run-checks runbook lists them, stopping at the
// first failure: server+shared typecheck, the web's tsc (it has no typecheck script), oxlint
// against the known-warning baseline, the server tests, and with --docker the image build that CI
// runs, and the privacy check that keeps library names out of git. Prints one line per check and a summary. Run from anywhere in the repo.
//
//   node scripts/check.mjs
//   node scripts/check.mjs --docker
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// oxlint warnings we have accepted (React-compiler advisories in Player, PinLock, Station). Add
// none: a higher count fails the check; a lower one means the baseline can come down.
const LINT_WARNINGS_BASELINE = 5
const docker = process.argv.includes('--docker')

const steps = [
  ['typecheck (server, shared)', 'pnpm', ['typecheck']],
  ['typecheck (web)', 'npx', ['tsc', '-b'], resolve(ROOT, 'apps/web')],
  ['lint (web)', 'pnpm', ['--filter', '@flix/web', 'lint'], ROOT, lintOk],
  ['tests (server)', 'pnpm', ['test']],
  ['privacy (no library names in tracked files)', 'node', ['scripts/privacy-check.mjs']],
]
if (docker) steps.push(['docker build', 'docker', ['build', '-t', 'flix', '.']])

const t0 = Date.now()
for (const [name, cmd, args, cwd = ROOT, judge] of steps) {
  const started = Date.now()
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const verdict = judge ? judge(r, out) : r.status === 0 ? null : `exit ${r.status}`
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  if (verdict) {
    console.log(`FAIL  ${name}  (${secs}s): ${verdict}`)
    console.log(out.trim().split('\n').slice(-40).join('\n'))
    process.exit(1)
  }
  console.log(`ok    ${name}  (${secs}s)${summary(name, out)}`)
}
console.log(`all checks passed in ${((Date.now() - t0) / 1000).toFixed(0)}s${docker ? '' : ' (image build skipped; --docker runs it)'}`)

// oxlint prints one `path:line:col: warning|error ...` line per finding and, outside a terminal,
// no summary line, so count the findings.
function lintCounts(out) {
  const warnings = (out.match(/^\S+:\d+:\d+: warning/gm) ?? []).length
  const errors = (out.match(/^\S+:\d+:\d+: error/gm) ?? []).length
  return { warnings, errors }
}

function lintOk(r, out) {
  const { warnings, errors } = lintCounts(out)
  if (errors > 0 || (r.status !== 0 && !warnings)) return `${errors} lint error(s) (exit ${r.status})`
  if (warnings > LINT_WARNINGS_BASELINE) return `${warnings} warnings, baseline is ${LINT_WARNINGS_BASELINE}: fix the new one(s)`
  return null
}

function summary(name, out) {
  if (name.startsWith('lint')) return `  ${lintCounts(out).warnings} warnings (baseline ${LINT_WARNINGS_BASELINE})`
  if (name.startsWith('tests')) {
    const pass = out.match(/\bpass (\d+)/)
    const fail = out.match(/\bfail (\d+)/)
    return pass ? `  pass ${pass[1]} / fail ${fail?.[1] ?? '?'}` : ''
  }
  return ''
}
