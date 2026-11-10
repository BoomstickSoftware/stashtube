import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { byNameMatch, nameRank } from './rank.ts'

describe('byNameMatch', () => {
  it('puts the exact name first, then prefixes, then word starts, keeping order within each', () => {
    const names = ['Unwanted Creampie', 'Anal Creampie', 'Creampie Eating', 'Creampie', 'Implied Creampies', 'Creamy']
    assert.deepEqual(byNameMatch(names, 'creampie', (n) => n), ['Creampie', 'Creampie Eating', 'Unwanted Creampie', 'Anal Creampie', 'Implied Creampies', 'Creamy'])
  })
  it('ignores case and accents', () => {
    assert.equal(nameRank('Zoë', 'zoe'), 0)
    assert.equal(nameRank('MILF (30+)', 'milf'), 1)
    assert.equal(nameRank('Teen (18–22)', '18'), 2)
  })
})
