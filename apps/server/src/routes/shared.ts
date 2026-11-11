// What every route file shares: the query and body schemas, the id validators and the helpers
// that turn bad input into a 400.
import type { FeaturedWeights, SceneQuery } from '@flix/shared'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { daySeed } from '../stash.ts'

export const num = z.coerce.number().int().positive().optional()
// Query strings send '1'/'true'; JSON bodies (pinned rows) send real booleans.
export const flag = z
  .union([z.boolean(), z.enum(['1', 'true', '0', 'false']).transform((v) => v === '1' || v === 'true')])
  .optional()
export const list = z.string().regex(/^[\d,]*$/).optional()

export const sceneQuery = z.object({
  q: z.string().max(200).optional(),
  sort: z.enum(['date', 'created_at', 'rating', 'play_count', 'last_played_at', 'o_counter', 'duration', 'title', 'random']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  page: num,
  perPage: z.coerce.number().int().min(1).max(120).optional(),
  seed: num,
  tags: list,
  xtags: list,
  performers: list,
  studios: list,
  minRating: z.coerce.number().min(0).max(5).optional(),
  minHeight: num,
  minDuration: num,
  maxDuration: num,
  unwatched: flag,
  inProgress: flag,
  favorites: flag,
  unblocked: flag,
  vault: flag,
  noUnlisted: flag,
  maxHeight: num,
  maxRating: z.coerce.number().min(1).max(5).optional(),
  unmatched: flag,
  transcodes: flag,
  olderDays: num,
  duplicates: flag,
  minAge: z.coerce.number().int().min(18).max(99).optional(),
  maxAge: z.coerce.number().int().min(18).max(99).optional(),
  ethnicities: z.string().max(200).regex(/^[A-Za-z ,]*$/).optional(),
}) satisfies z.ZodType<SceneQuery>

export const people = z
  .object({
    minAge: z.number().int().min(18).max(99).optional(),
    maxAge: z.number().int().min(18).max(99).optional(),
    ethnicities: z.array(z.string().max(40)).max(20).optional(),
  })
  // a reversed range would be saved and applied to every list, emptying the library
  .refine((p) => p.minAge == null || p.maxAge == null || p.minAge <= p.maxAge, { message: 'minimum age is above the maximum' })

export const listQuery = z.object({
  q: z.string().max(200).optional(),
  sort: z.enum(['name', 'scenes_count', 'rating', 'created_at', 'random']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  page: num,
  perPage: z.coerce.number().int().min(1).max(1000).optional(),
  seed: num,
  favorites: flag,
  unblocked: flag,
  gender: z.enum(['women', 'men', 'all']).optional(), // the Performers page only; everyone when absent
})

export const parse = <T extends z.ZodType>(schema: T, data: unknown): z.infer<T> => {
  const r = schema.safeParse(data)
  if (!r.success) throw new HTTPException(400, { message: z.prettifyError(r.error) })
  return r.data
}

export const notFound = () => {
  throw new HTTPException(404, { message: 'not found' })
}

// The JSON body. One that does not parse is the caller's mistake: 400 (_a bare 500 until 2026-11-10_).
export const body = (c: Context): Promise<unknown> =>
  c.req.json().catch(() => {
    throw new HTTPException(400, { message: 'the body is not valid JSON' })
  })

// A Stash id from the path (a scene, performer, studio, tag, marker or job): digits only, so
// nothing else is ever sent on to Stash.
const stashId = z.string().regex(/^\d+$/, 'an id is a number')
export const idParam = (c: Context, name = 'id') => parse(stashId, c.req.param(name))
export const sceneId = (s: string | undefined) => parse(stashId, s)
// A flix row id (a pinned row, station or playlist).
export const rowId = (s: string | undefined) => parse(z.coerce.number().int().positive(), s)

// A RangeError from whisparr.ts, getqueue.ts or cleanup.ts says the request asked for something
// that is refused: answer with `status` and its message instead of a 500.
export async function refused<T>(status: 400 | 409, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    if (e instanceof RangeError) throw new HTTPException(status, { message: e.message })
    throw e
  }
}

// The page sends one seed per visit; anything else (the warm, curl) gets today's.
export const seedParam = (s: string | undefined) => (s && /^[\w-]{1,40}$/.test(s) ? s : String(daySeed()))
export const limitParam = (s: string | undefined) => Math.min(60, Math.max(1, Number(s) || 24))
export const offsetParam = (s: string | undefined) => Math.min(5000, Math.max(0, Math.floor(Number(s) || 0))) // the hero pages down the same ranking
export const weightsBody = z.object(Object.fromEntries(['dormant', 'shelfAge', 'fresh', 'performer', 'tag', 'studio', 'watched', 'marked', 'rated', 'oCount', 'surprise'].map((k) => [k, z.number().min(-1).max(1)])) as Record<keyof FeaturedWeights, z.ZodNumber>).partial()

export const ratingBody = z.object({ rating: z.number().min(0).max(5).nullable() })

// One scene ({sceneId}) or many ({sceneIds}, multi-select), appended in the given order.
export const itemsBody = z.union([
  z.object({ sceneId: z.string().regex(/^\d+$/) }).transform((b) => [b.sceneId]),
  z.object({ sceneIds: z.array(z.string().regex(/^\d+$/)).min(1).max(500) }).transform((b) => b.sceneIds),
])

export const kind = z.enum(['tag', 'performer', 'studio'])
