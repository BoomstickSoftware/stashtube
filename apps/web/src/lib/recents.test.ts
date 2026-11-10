import { describe, expect, it } from 'vitest'
import { MAX_RECENTS, parseRecents, withRecent, type Recent } from './recents'

const q = (id: string): Recent => ({ kind: 'query', id, label: id })

describe('recents', () => {
  it('puts the newest first and keeps one entry per thing', () => {
    const list = withRecent(withRecent(withRecent([], q('a')), q('b')), q('a'))
    expect(list.map((r) => r.id)).toEqual(['a', 'b'])
  })
  it('treats the same id of another kind as a different thing', () => {
    expect(withRecent([q('7')], { kind: 'tag', id: '7', label: 'x' })).toHaveLength(2)
  })
  it('keeps at most MAX_RECENTS', () => {
    let list: Recent[] = []
    for (let i = 0; i < MAX_RECENTS + 4; i++) list = withRecent(list, q(String(i)))
    expect(list).toHaveLength(MAX_RECENTS)
    expect(list[0].id).toBe(String(MAX_RECENTS + 3))
  })
  it('drops anything stored that is not a recent', () => {
    expect(parseRecents([q('a'), null, { kind: 'nope', id: '1', label: 'x' }, 'text'])).toEqual([q('a')])
    expect(parseRecents('junk')).toEqual([])
    expect(parseRecents(undefined)).toEqual([])
  })
})
