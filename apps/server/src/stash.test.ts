// The filter builder: Stash accepts one criterion per field per level and no AND beside an
// OR, and SQLite's parser overflows on long OR chains. These rules only show up as 500s from
// Stash, so they are pinned here.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type Exclusions, findFilter, sceneFilter, isBlocked } from './stash.ts'

const none: Exclusions = { tags: [], performers: [], studios: [] }

// Walks an AND chain into a list of levels.
const levels = (f: Record<string, unknown>) => {
  const out: Record<string, unknown>[] = []
  for (let node = f; node; node = node.AND as Record<string, unknown>) out.push(Object.fromEntries(Object.entries(node).filter(([k]) => k !== 'AND')))
  return out
}

describe('sceneFilter', () => {
  it('puts plain criteria on one level', () => {
    const f = sceneFilter({ tags: '1,2', performers: '3', studios: '4', minRating: 4, minHeight: 1080, unwatched: true }, none)
    assert.deepEqual(levels(f), [
      {
        tags: { value: ['1', '2'], modifier: 'INCLUDES_ALL', depth: 0 },
        performers: { value: ['3'], modifier: 'INCLUDES_ALL' },
        studios: { value: ['4'], modifier: 'INCLUDES', depth: -1 },
        rating100: { value: 79, modifier: 'GREATER_THAN' },
        resolution: { value: 'STANDARD_HD', modifier: 'GREATER_THAN' },
        play_count: { value: 0, modifier: 'EQUALS' },
      },
    ])
  })

  it('nests a repeated field one AND deeper', () => {
    const f = sceneFilter({ minHeight: 720, maxHeight: 1080, minRating: 1, maxRating: 3 }, none)
    const [a, b, c] = levels(f)
    assert.equal(a.resolution && (a.resolution as { modifier: string }).modifier, 'GREATER_THAN')
    assert.deepEqual(b, { resolution: { value: 'STANDARD_HD', modifier: 'LESS_THAN' } })
    assert.deepEqual(c, { rating100: { value: 61, modifier: 'LESS_THAN' } })
  })

  it('applies the blocklist as exclusions, one per level', () => {
    const f = sceneFilter({}, { tags: ['9'], performers: ['8'], studios: ['7'] })
    assert.deepEqual(levels(f), [
      {},
      { tags: { value: ['9'], modifier: 'EXCLUDES', depth: -1 } },
      { performers: { value: ['8'], modifier: 'EXCLUDES' } },
      { studios: { value: ['7'], modifier: 'EXCLUDES', depth: -1 } },
    ])
  })

  it('lets an explicitly included id override its block, and merges xtags into the exclusions', () => {
    const f = sceneFilter({ tags: '9', xtags: '5,9', performers: '8' }, { tags: ['9', '6'], performers: ['8'], studios: [] })
    const [, ex] = levels(f)
    assert.deepEqual(ex, { tags: { value: ['6', '5'], modifier: 'EXCLUDES', depth: -1 } })
    assert.equal(levels(f).length, 2)
  })

  it('drops every exclusion with unblocked', () => {
    const f = sceneFilter({ unblocked: true }, { tags: ['9'], performers: ['8'], studios: ['7'], people: { gender: null, firstYear: 2000, minAge: 20 } })
    assert.deepEqual(levels(f), [{}])
  })

  it('puts the people criterion (an OR chain) last, with at most 16 date buckets', () => {
    const f = sceneFilter({ maxHeight: 720 }, { ...none, people: { gender: { value: 'FEMALE', modifier: 'INCLUDES' }, firstYear: 1990, minAge: 18, maxAge: 25 } })
    const last = levels(f).at(-1)!
    assert.ok(last.date && last.performers_filter, 'the last level is the first age bucket')
    let n = 0
    for (let node = last; node; node = node.OR as Record<string, unknown>) {
      n++
      assert.equal(node.AND, undefined, 'no AND beside an OR')
    }
    assert.ok(n <= 16, `${n} buckets`)
    assert.ok(n >= 2)
  })

  it('a list with its own age filter replaces the Settings default', () => {
    const blocked: Exclusions = { ...none, people: { gender: null, firstYear: 2020, ethnicities: ['Asian'] } }
    const own = sceneFilter({ minAge: 30 }, blocked)
    const chain = JSON.stringify(own)
    assert.ok(chain.includes('birthdate'))
    assert.ok(!chain.includes('Asian'))
  })
})

describe('findFilter', () => {
  it('turns a random sort into a seeded one and pages from 1', () => {
    assert.deepEqual(findFilter({ sort: 'random', seed: 42 }), { q: undefined, sort: 'random_42', direction: 'DESC', page: 1, per_page: 40 })
    assert.equal(findFilter({ sort: 'date', dir: 'asc', page: 3, perPage: 10 }).direction, 'ASC')
  })

describe('isBlocked', () => {
  const ex = { tags: ['9'], performers: ['8'], studios: ['7'] }
  const scene = (o: object) => ({ tags: [], performers: [], studio: null, ...o }) as Parameters<typeof isBlocked>[0]
  it('excludes by tag, performer, studio and the studio\'s parent', () => {
    assert.equal(isBlocked(scene({ tags: [{ id: '9' }] }), ex), true)
    assert.equal(isBlocked(scene({ performers: [{ id: '1' }, { id: '8' }] }), ex), true)
    assert.equal(isBlocked(scene({ studio: { id: '7' } }), ex), true)
    assert.equal(isBlocked(scene({ studio: { id: '70', parent_studio: { id: '7' } } }), ex), true)
    assert.equal(isBlocked(scene({ tags: [{ id: '1' }], performers: [{ id: '2' }], studio: { id: '3' } }), ex), false)
  })
})
})
