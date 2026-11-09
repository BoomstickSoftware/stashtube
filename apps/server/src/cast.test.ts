// The Cast classification (cast.ts castOf): what flix writes into Stash for each scene.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ALL_TAGS, castOf, COUNT_TAGS, UNKNOWN } from './cast.ts'

const F = 'FEMALE'
const M = 'MALE'

describe('castOf', () => {
  it('gives a woman and a man their mix and the 1+ counts', () => {
    assert.deepEqual(castOf([F, M]), ['Cast: F+M', 'Cast: Women 1+', 'Cast: Men 1+'])
  })
  it('counts cumulatively, capped at 3+ (women, men) and 2+ (other)', () => {
    assert.deepEqual(castOf([F, F, M]), ['Cast: F+M', 'Cast: Women 1+', 'Cast: Women 2+', 'Cast: Men 1+'])
    assert.deepEqual(castOf([F, M, M, M, M, M]), ['Cast: F+M', 'Cast: Women 1+', 'Cast: Men 1+', 'Cast: Men 2+', 'Cast: Men 3+'])
    assert.deepEqual(castOf(['NON_BINARY', 'TRANSGENDER_FEMALE', 'INTERSEX']), ['Cast: X', 'Cast: Other 1+', 'Cast: Other 2+'])
  })
  it('puts trans, non-binary and intersex performers under X', () => {
    for (const g of ['TRANSGENDER_FEMALE', 'TRANSGENDER_MALE', 'NON_BINARY', 'INTERSEX']) assert.deepEqual(castOf([F, g])[0], 'Cast: F+X', g)
    assert.deepEqual(castOf([M, 'TRANSGENDER_FEMALE'])[0], 'Cast: M+X')
  })
  it('marks all-male casts, solo or not, as M', () => {
    assert.equal(castOf([M])[0], 'Cast: M')
    assert.equal(castOf([M, M, M])[0], 'Cast: M')
  })
  it('gives up on a scene with no performers or one without a gender', () => {
    assert.deepEqual(castOf([]), [UNKNOWN])
    assert.deepEqual(castOf([F, null]), [UNKNOWN])
  })
  it('only ever names categories the sync manages', () => {
    for (const gs of [[F], [M, M], [F, M, 'NON_BINARY'], ['INTERSEX'], [F, F, F, F]]) for (const t of castOf(gs)) assert.ok(ALL_TAGS.includes(t), t)
    assert.equal(COUNT_TAGS.length, 8)
  })
})
