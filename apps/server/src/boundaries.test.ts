// "Only the stash layer knows Stash's schema" (wiki architecture/stash-layer), pinned: the
// generated schema types may be imported under stash/ and nowhere else. A route or a feature
// module that needs something Stash-shaped asks the stash layer for a function that returns
// @flix/shared types or plain values instead.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it } from 'node:test'

const src = import.meta.dirname
const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts')).map((f) => relative(src, join(src, f)))

describe('module boundaries', () => {
  it('only stash/ imports stash.schema.ts', () => {
    const allowed = (f: string) => f.startsWith('stash/') || f === 'stash.schema.ts' || f.endsWith('.test.ts')
    const leaks = files.filter((f) => !allowed(f) && /from\s+['"][^'"]*stash\.schema(\.ts)?['"]/.test(readFileSync(join(src, f), 'utf8')))
    assert.deepEqual(leaks, [])
  })
  it('the barrel re-exports and holds no code of its own', () => {
    const barrel = readFileSync(join(src, 'stash.ts'), 'utf8')
    assert.doesNotMatch(barrel, /^(?!export \{|\s|\}|\/\/)./m)
  })
  it('the query cache is imported from cache/, not through the stash layer, by the other upstreams', () => {
    for (const f of ['whisparr.ts', 'stashdb.ts', 'catalog.ts', 'unlisted.ts', 'blocklist.ts']) {
      const text = readFileSync(join(src, f), 'utf8')
      assert.match(text, /import \{[^}]*dataCache[^}]*\} from '\.\/cache\/data\.ts'/, f)
      assert.doesNotMatch(text, /stash\.dataCache/, f)
    }
  })
})
