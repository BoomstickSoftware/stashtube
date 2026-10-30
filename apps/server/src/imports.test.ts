// The runtime image copies apps/server/src and the server's production deps, not
// packages/shared: a value import from @flix/shared passes typecheck and the tests in the
// build stage (where shared is present) and then crashes the pod at boot with
// ERR_MODULE_NOT_FOUND (2026-10-30). Only `import type` may cross that line.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const SRC = new URL('.', import.meta.url).pathname

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* files(p)
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) yield p
  }
}

describe('server imports', () => {
  it('take only types from @flix/shared', () => {
    const offenders: string[] = []
    for (const f of files(SRC)) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/^import\s+([\s\S]*?)\s+from\s+'@flix\/shared'/gm)) {
        const clause = m[1]!
        // `import type { … }` is fine; `import { type A, B }` is not unless every name is a type
        if (clause.startsWith('type ')) continue
        const names = clause.replace(/^\{|\}$/g, '').split(',').map((n) => n.trim()).filter(Boolean)
        if (names.every((n) => n.startsWith('type '))) continue
        offenders.push(`${f.slice(SRC.length)}: ${m[0].split('\n')[0]}`)
      }
    }
    assert.deepEqual(offenders, [])
  })
})
