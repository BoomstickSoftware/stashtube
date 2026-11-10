import type { SceneCard } from '@flix/shared'
import { describe, expect, it } from 'vitest'
import { queuedFirst, withQueued } from './upNext'

const s = (id: string) => ({ id }) as SceneCard
const ids = (l: SceneCard[]) => l.map((x) => x.id)

describe('up next', () => {
  it('puts a video first in line, once', () => {
    expect(ids(queuedFirst([s('1'), s('2')], s('2')))).toEqual(['2', '1'])
    expect(ids(queuedFirst([], s('3')))).toEqual(['3'])
  })
  it('plays the queued videos before the rest, without repeats or the current video', () => {
    expect(ids(withQueued([s('5'), s('9')], [s('1'), s('5'), s('2'), s('9')], '9'))).toEqual(['5', '1', '2'])
  })
  it('leaves a list alone when nothing is queued', () => {
    expect(ids(withQueued([], [s('1'), s('2')], '7'))).toEqual(['1', '2'])
  })
})
