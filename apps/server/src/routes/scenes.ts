import type { DeleteResult, Duplicates, Page, SceneDetail } from '@flix/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { exclusions } from '../blocklist.ts'
import { sceneCast } from '../cast.ts'
import { config } from '../config.ts'
import { deleteScene } from '../delete.ts'
import { toGroup } from '../duplicates.ts'
import { homeChanged, rebuildHomeSoon } from '../home.ts'
import * as stash from '../stash.ts'
import { relatedSide, unlistedList } from '../unlisted.ts'
import { body, idParam, itemsBody, notFound, parse, ratingBody, sceneQuery } from './shared.ts'

export const scenes = new Hono()

// --- scenes ---------------------------------------------------------------------

scenes.get('/scenes', async (c) => {
  const q = parse(sceneQuery, c.req.query())
  const blocked = await exclusions()
  const page = q.page ?? 1
  const perPage = q.perPage ?? 40
  const r = await stash.findScenes(
    stash.findFilter({ ...q, sort: q.sort ?? (q.q ? undefined : 'date'), page, perPage }),
    stash.sceneFilter(q, blocked),
  )
  return c.json({ ...r, page, perPage } satisfies Page<unknown>)
})

// Counts inside a filtered set, for the filter panel (registered before /scenes/:id).
scenes.get('/scenes/facets', async (c) => c.json(await stash.sceneFacets(parse(sceneQuery, c.req.query()), await exclusions())))

// Videos still tagged "Not interested" from before 2026-11-09, for Cleanup (registered before /scenes/:id).
scenes.get('/scenes/hidden', async (c) => c.json(await stash.hiddenScenes()))

// --- duplicates -----------------------------------------------------------------

// Stash's phash groups with the copy to keep chosen (duplicates.ts). Includes blocked and
// hidden videos: this is library hygiene, like /cleanup.
const duplicatesQuery = z.object({
  distance: z.coerce.number().int().min(0).max(16).default(0),
  durationDiff: z.coerce.number().min(-1).default(-1),
})
scenes.get('/duplicates', async (c) => {
  const q = parse(duplicatesQuery, c.req.query())
  const groups = await stash.findDuplicateScenes(q.distance, q.durationDiff)
  return c.json<Duplicates>({ ...q, groups: groups.map(toGroup) })
})

scenes.get('/scenes/:id', async (c) => {
  const id = idParam(c)
  const r = await stash.getScene(id)
  if (!r) return notFound()
  const [hidden, u, cast] = await Promise.all([stash.hiddenTag(), unlistedList(), sceneCast(r.scene.id, r.genders)])
  // what keeps it off Home besides a hand unlist, named for the scene page's notice
  const via = [
    ...u.tags.filter((t) => r.tagIds.includes(t.id)),
    ...u.performers.filter((p) => r.performerIds.includes(p.id)),
    ...u.studios.filter((s) => s.id === r.studioId || s.id === r.parentStudioId),
  ]
  return c.json({
    ...r.scene,
    hidden: !!hidden && r.tagIds.includes(hidden),
    unlisted: !!u.sceneTag && r.tagIds.includes(u.sceneTag),
    unlistedVia: via,
    cast,
  } satisfies SceneDetail)
})

// Unlist one video by hand: the "Unlisted" Stash tag (created on first use).
scenes.put('/scenes/:id/unlisted', async (c) => {
  await stash.setSceneUnlisted(idParam(c), true)
  homeChanged()
  return c.body(null, 204)
})
scenes.delete('/scenes/:id/unlisted', async (c) => {
  await stash.setSceneUnlisted(idParam(c), false)
  homeChanged()
  return c.body(null, 204)
})

// Retired: "Not interested" now opens the delete (decisions/hide-means-delete-block-or-unlist).
// Cleanup lists the videos still tagged; Keep takes the tag off.
scenes.delete('/scenes/:id/hidden', async (c) => {
  await stash.setSceneHidden(idParam(c), false)
  return c.body(null, 204)
})

scenes.get('/scenes/:id/related', async (c) => {
  const id = idParam(c)
  const r = await stash.getScene(id)
  if (!r) return notFound()
  const ex = await exclusions()
  return c.json(await stash.relatedScenes(id, r.performerIds, r.studioId, r.tagIds, ex, r.group, relatedSide(r.marks, ex)))
})

scenes.put('/scenes/:id/rating', async (c) => {
  const id = idParam(c)
  const { rating } = parse(ratingBody, await body(c))
  await stash.updateSceneRating(id, rating)
  return c.body(null, 204)
})

scenes.post('/scenes/:id/play', async (c) => {
  await stash.addScenePlay(idParam(c))
  rebuildHomeSoon()
  return c.body(null, 204)
})

// "Mark as watched": one play, and the resume point cleared so it leaves Continue.
scenes.post('/scenes/:id/watched', async (c) => {
  const id = idParam(c)
  await stash.addScenePlay(id)
  await stash.saveSceneActivity(id, 0, 0)
  rebuildHomeSoon()
  return c.body(null, 204)
})

// Remove videos from Continue: their resume points go to 0. Plays and History are untouched.
scenes.post('/continue/clear', async (c) => {
  const { ids } = parse(z.object({ ids: z.array(z.string().regex(/^\d+$/)).min(1).max(1000) }), await body(c))
  await stash.clearResume(ids)
  return c.body(null, 204)
})

const activityBody = z.object({ resumeTime: z.number().min(0), playDuration: z.number().min(0) })

scenes.post('/scenes/:id/activity', async (c) => {
  const id = idParam(c)
  const b = parse(activityBody, await body(c))
  await stash.saveSceneActivity(id, b.resumeTime, b.playDuration)
  return c.body(null, 204)
})

scenes.post('/scenes/:id/o', async (c) => c.json({ oCount: await stash.addSceneO(idParam(c)) }))

scenes.patch('/scenes/:id', async (c) => {
  const id = idParam(c)
  const b = parse(
    z.object({ title: z.string().trim().max(300).optional(), addTagIds: z.array(z.string().regex(/^\d+$/)).max(500).optional(), removeTagIds: z.array(z.string().regex(/^\d+$/)).max(500).optional() }),
    await body(c),
  )
  await stash.updateScene(id, b)
  return c.body(null, 204)
})

const markerBody = z.object({ seconds: z.number().min(0), title: z.string().trim().max(120).default(''), tagId: z.string().min(1).optional() })
scenes.post('/scenes/:id/markers', async (c) => {
  const id = idParam(c)
  const b = parse(markerBody, await body(c))
  return c.json(await stash.createMarker(id, b.seconds, b.title, b.tagId), 201)
})
// Title and/or primary tag; the Moments list edits both in place.
scenes.put('/scenes/:id/markers/:marker', async (c) => {
  const [id, marker] = [idParam(c), idParam(c, 'marker')]
  const b = parse(z.object({ title: z.string().trim().max(120).optional(), tagId: z.string().min(1).optional() }), await body(c))
  return c.json(await stash.updateMarker(id, marker, b))
})
scenes.delete('/scenes/:id/markers/:marker', async (c) => {
  await stash.deleteMarker(idParam(c), idParam(c, 'marker'))
  return c.body(null, 204)
})

// Bulk categories: add and remove tags on the selected videos (`sceneIds`) or, with no ids, on
// every video the list's filters (the query string, as GET /scenes reads it) match: a studio's
// whole library from its page. Answers with how many videos were changed.
const bulkTagsBody = z
  .object({
    sceneIds: z.array(z.string().regex(/^\d+$/)).min(1).max(5000).optional(),
    add: z.array(z.string().regex(/^\d+$/)).max(50).default([]),
    remove: z.array(z.string().regex(/^\d+$/)).max(50).default([]),
  })
  .refine((b) => b.add.length + b.remove.length > 0, { message: 'nothing to add or remove' })
  .refine((b) => !b.add.some((t) => b.remove.includes(t)), { message: 'a category is both added and removed' })
scenes.post('/scenes/tags', async (c) => {
  const b = parse(bulkTagsBody, await body(c))
  const ids = b.sceneIds ?? (await stash.sceneIdsMatching(stash.sceneFilter(parse(sceneQuery, c.req.query()), await exclusions())))
  if (ids.length) await stash.bulkSceneTags(ids, b.add, b.remove)
  return c.json({ scenes: ids.length })
})

// Deleting removes the file for good, through Whisparr; one scene at a time so a failure
// stops only that scene.
scenes.post('/scenes/delete', async (c) => {
  if (!config.whisparr) throw new HTTPException(501, { message: 'deleting needs WHISPARR_URL and WHISPARR_API_KEY' })
  const ids = parse(itemsBody, await body(c))
  const results: DeleteResult[] = []
  for (const id of ids) results.push(await deleteScene(id))
  return c.json(results)
})

// Answers with the finished job (200) in the usual case; 202 with the running job when it
// outlived the server's wait, which `GET /jobs/:id` then follows.
scenes.post('/scenes/:id/identify', async (c) => {
  const job = await stash.identifyScene(idParam(c))
  return c.json(job, ['FINISHED', 'FAILED', 'CANCELLED'].includes(job.status) ? 200 : 202)
})
scenes.get('/jobs/:id', async (c) => c.json((await stash.jobStatus(idParam(c))) ?? notFound()))
