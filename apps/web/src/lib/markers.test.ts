import type { Marker } from '@flix/shared'
import { describe, expect, it } from 'vitest'
import { groupMarkers, nextMarker } from './playback'

const m = (seconds: number, title = 'x'): Marker => ({ id: String(seconds), seconds, title }) as Marker

describe('groupMarkers', () => {
  it('folds markers within 1% of the duration into one tick', () => {
    const ticks = groupMarkers([m(100, 'O'), m(105, 'O'), m(500), m(10)], 1000)
    expect(ticks.map((t) => [t.t, t.markers.length, t.o])).toEqual([
      [10, 1, false],
      [100, 2, true],
      [500, 1, false],
    ])
  })
  it('a named marker in a cluster makes the tick a named one', () => {
    expect(groupMarkers([m(100, 'O'), m(101, 'scene')], 1000)[0].o).toBe(false)
  })
})

describe('nextMarker', () => {
  const ms = [m(10), m(50), m(90)]
  it('moves forward past the current one and back with slack', () => {
    expect(nextMarker(ms, 10, 1)?.seconds).toBe(50)
    expect(nextMarker(ms, 51, -1)?.seconds).toBe(10)
    expect(nextMarker(ms, 53, -1)?.seconds).toBe(50)
    expect(nextMarker(ms, 95, 1)).toBeUndefined()
  })
})
