import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { expired } from './continue.ts'

describe('continue expiry', () => {
  const now = Date.parse('2026-11-09T12:00:00Z')
  const rows = [
    { id: '1', touched: '2026-11-08T12:00:00Z' }, // yesterday
    { id: '2', touched: '2026-10-10T11:00:00Z' }, // just over 30 days
    { id: '3', touched: '2026-10-11T00:00:00Z' }, // just under
  ]
  it('picks resume points untouched for longer than the setting', () => {
    assert.deepEqual(expired(rows, 30, now), ['2'])
  })
  it('keeps everything when the setting is 0', () => {
    assert.deepEqual(expired(rows, 0, now), [])
  })
})
