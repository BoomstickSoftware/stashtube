// What discovery may fetch and when a catalogue refresh stops: the pure rules behind the
// automatic Gets (getqueue.ts) and the mirror (catalog.ts), plus the statements that replaced
// per-row writes and spliced SQL. Nothing here reaches Postgres: statements are only rendered.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { copyWhole, FULL_SCOPE, mirrorWhere, refreshDone } from './catalog.ts'
import { db } from './db/index.ts'
import { sdbScenes } from './db/schema.ts'
import { type DiscoveryContext, eligible } from './getqueue.ts'
import { reorderStatement } from './playlists.ts'

const scene = (over: Partial<{ id: string; performerIds: string[]; studioId: string | null; tags: { name: string }[] }> = {}) => ({ id: 'AbC', performerIds: ['p1', 'p2'], studioId: 's1', tags: [{ name: 'Outdoor' }], ...over })
const ctx = (over: Partial<DiscoveryContext> = {}): DiscoveryContext => ({
  owned: new Map<string, string>(),
  known: new Set(),
  excluded: new Set(),
  blocked: { performers: new Set(), studios: new Set(), tagNames: new Set() },
  ...over,
})
const blocked = (b: Partial<DiscoveryContext['blocked']>) => ctx({ blocked: { performers: new Set(), studios: new Set(), tagNames: new Set(), ...b } })

describe('discovery eligibility', () => {
  it('fetches a release nothing has and nothing blocks', () => assert.equal(eligible(scene(), ctx()), true))
  it('skips a release the studio name filter or the VR switch keeps out', () => {
    const names = { studioWords: ['example'], hideVr: true }
    assert.equal(eligible({ ...scene(), studioName: 'An Example Studio' }, { ...ctx(), names }), false)
    assert.equal(eligible({ ...scene(), studioName: 'Plain Studio', title: 'Morning (VR)' }, { ...ctx(), names }), false)
    assert.equal(eligible({ ...scene(), studioName: 'Plain Studio', title: 'Morning' }, { ...ctx(), names }), true)
    assert.equal(eligible({ ...scene(), studioName: 'An Example Studio' }, ctx()), true) // no filters given
  })
  it('skips a scene the library has', () => assert.equal(eligible(scene(), ctx({ owned: new Map([['AbC', '12']]) })), false))
  it('skips a scene Whisparr holds with a file or monitored', () => assert.equal(eligible(scene(), ctx({ known: new Set(['AbC']) })), false))
  it('never fetches a scene deleted before, whatever the case of its id', () => {
    assert.equal(eligible(scene(), ctx({ excluded: new Set(['abc']) })), false)
    assert.equal(eligible(scene({ id: 'abc' }), ctx({ excluded: new Set(['abc']) })), false)
  })
  it('skips a scene with a blocked performer, even a co-performer', () => assert.equal(eligible(scene(), blocked({ performers: new Set(['p2']) })), false))
  it('skips a scene of a blocked studio', () => {
    assert.equal(eligible(scene(), blocked({ studios: new Set(['s1']) })), false)
    assert.equal(eligible(scene({ studioId: null }), blocked({ studios: new Set(['s1']) })), true)
  })
  it('skips a scene with a blocked category, by name without case', () => {
    assert.equal(eligible(scene(), blocked({ tagNames: new Set(['outdoor']) })), false)
    assert.equal(eligible(scene({ tags: [] }), blocked({ tagNames: new Set(['outdoor']) })), true)
  })
})

describe('catalogue refresh', () => {
  it('goes on while every scene of a page is new and pages remain', () => assert.equal(refreshDone({ fresh: 100, got: 100, page: 1, count: 250 }), false))
  it('stops at the first page holding a scene already known', () => assert.equal(refreshDone({ fresh: 99, got: 100, page: 1, count: 250 }), true))
  it('stops at once when nothing changed', () => assert.equal(refreshDone({ fresh: 0, got: 100, page: 1, count: 250 }), true))
  it('stops at the last page', () => {
    assert.equal(refreshDone({ fresh: 50, got: 50, page: 3, count: 250 }), true)
    assert.equal(refreshDone({ fresh: 100, got: 100, page: 2, count: 250 }), false)
    assert.equal(refreshDone({ fresh: 0, got: 0, page: 1, count: 0 }), true)
  })
  it('copies a catalogue whole only up to FULL_SCOPE scenes', () => {
    assert.equal(copyWhole(FULL_SCOPE), true)
    assert.equal(copyWhole(FULL_SCOPE + 1), false)
  })
})

describe('statements', () => {
  const evil = "x'] ; drop table sdb_scenes; --"
  it('binds the mirror filter\'s ids as parameters, never into the SQL text', () => {
    const q = db.select().from(sdbScenes).where(mirrorWhere({ performers: ['a', evil], tags: ['t'], studios: ['s'] })).toSQL()
    assert.match(q.sql, /"performer_ids" @> \$1 and "sdb_scenes"\."tag_ids" @> \$2 and "sdb_scenes"\."studio_id" in \(\$3\)/)
    assert.ok(!q.sql.includes('drop table'))
    assert.equal(q.params.length, 3)
    assert.equal(mirrorWhere({ performers: [], tags: [], studios: [] }), undefined)
  })
  it('reorders a playlist in one UPDATE; a repeated id takes its last position', () => {
    const q = new PgDialect().sqlToQuery(reorderStatement(4, ['10', '20', '10', evil]))
    assert.equal(q.sql.match(/update/g)?.length, 1)
    assert.ok(!q.sql.includes('drop table'))
    assert.deepEqual(q.params, ['10', 2, '20', 1, evil, 3, 4])
  })
})
