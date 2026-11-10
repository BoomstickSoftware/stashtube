import { describe, expect, it } from 'vitest'
import { ageLabel, idList, parseSceneQuery, toCsv, toggleId, withBase } from './query'

describe('parseSceneQuery', () => {
  it('keeps what it knows and drops the rest', () => {
    const q = parseSceneQuery({ q: 'x', sort: 'date', dir: 'asc', tags: '1,2', minRating: '3', unwatched: 'true', bogus: 1 })
    expect(q).toMatchObject({ q: 'x', sort: 'date', dir: 'asc', tags: '1,2', minRating: 3, unwatched: true })
    expect('bogus' in q).toBe(false)
  })
  it('rejects an unknown sort, a non-numeric id list and non-positive numbers', () => {
    const q = parseSceneQuery({ sort: 'nope', tags: '1;drop', minHeight: 0, seed: -4, dir: 'desc' })
    expect(q.sort).toBeUndefined()
    expect(q.tags).toBeUndefined()
    expect(q.minHeight).toBeUndefined()
    expect(q.seed).toBeUndefined()
    expect(q.dir).toBeUndefined()
  })
  it('reads the Vault flag under its old name too', () => {
    expect(parseSceneQuery({ edu: true }).vault).toBe(true)
    expect(parseSceneQuery({ vault: '1' }).vault).toBe(true)
  })
})

describe('id lists', () => {
  it('round-trips and toggles', () => {
    expect(idList('1,2,,3')).toEqual(['1', '2', '3'])
    expect(idList()).toEqual([])
    expect(toCsv([])).toBeUndefined()
    expect(toggleId('1,2', '2')).toBe('1')
    expect(toggleId('1', '2')).toBe('1,2')
    expect(toggleId('1', '1')).toBeUndefined()
  })
})

describe('ageLabel', () => {
  it('names a range, a floor and a ceiling', () => {
    expect(ageLabel()).toBeNull()
    expect(ageLabel(18, 25)).toBe('Age 18–25')
    expect(ageLabel(40)).toBe('Age 40+')
    expect(ageLabel(undefined, 30)).toBe('Age up to 30')
  })
})

describe('withBase', () => {
  it("merges the page's fixed ids with the list's filters and keeps the list's sort", () => {
    const q = withBase({ tags: '2,3', sort: 'rating' }, { tags: '1,2', performers: '7' }, 'date')
    expect(q).toMatchObject({ tags: '1,2,3', performers: '7', sort: 'rating' })
  })
  it('falls back to the default sort, except while searching, and seeds a random sort', () => {
    expect(withBase({}, { favorites: true }, 'date')).toMatchObject({ favorites: true, sort: 'date' })
    expect(withBase({ q: 'x' }, {}, 'date').sort).toBeUndefined()
    expect(withBase({}, {}, 'random').seed).toBe(1)
  })
})
