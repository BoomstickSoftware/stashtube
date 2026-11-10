// How a failure becomes an HTTP answer. One class for "an upstream did not answer or refused":
// the API answers 502 with its message, whichever upstream it was (_until 2026-11-10 only Stash's
// did; a Whisparr or StashDB failure was a bare 500_).
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

export type UpstreamSource = 'stash' | 'whisparr' | 'stashdb'
const LABEL: Record<UpstreamSource, string> = { stash: 'Stash', whisparr: 'Whisparr', stashdb: 'StashDB' }

export class UpstreamError extends Error {
  source: UpstreamSource
  constructor(source: UpstreamSource, message: string) {
    super(message)
    this.name = 'UpstreamError'
    this.source = source
  }
}

// The message as the client sees it: named after the upstream once (Whisparr's and StashDB's
// own messages already start with their name).
export const upstreamMessage = (e: UpstreamError) => (e.message.startsWith(LABEL[e.source]) ? e.message : `${LABEL[e.source]}: ${e.message}`)

// The app's error handler (index.ts; the route tests mount it too).
export function errorHandler(err: Error, c: Context) {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  if (err instanceof UpstreamError) {
    console.error(`${err.source}:`, err.message)
    return c.json({ error: upstreamMessage(err) }, 502)
  }
  if (err.name === 'AbortError') return c.body(null, 499 as 400)
  console.error(err)
  return c.json({ error: 'internal error' }, 500)
}
