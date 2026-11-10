// The performer, studio and tag finders against Stash's filter schemas. A criterion Stash does
// not know is rejected whole (HTTP 400/422), and the first blocked tag (the "Not interested" tag)
// once took the tag browser, search and the tag tiles down that way. The field lists below are
// v0.31.1's filter inputs as introspected on 2026-10-29; none has `id`.
// _Until 2026-11-10_ the finders also dropped blocked ids from each page; no caller had passed
// any since Block stopped hiding library entries (2026-11-09), and that path is gone.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { findPerformers, findStudios, findTags } from './stash.ts'

const FIELDS: Record<string, string[]> = {
  PerformerFilterType: 'AND NOT OR age aliases birth_year birthdate career_end career_length career_start circumcised country created_at custom_fields death_date death_year details disambiguation ethnicity eye_color fake_tits filter_favorites galleries_filter gallery_count gender groups hair_color height_cm ignore_auto_tag image_count images_filter is_missing marker_count markers_filter measurements name o_counter penis_length performers piercings play_count rating100 scene_count scenes_filter stash_id_endpoint stash_ids_endpoint studios tag_count tags tags_filter tattoos updated_at url weight'.split(' '),
  StudioFilterType: 'AND NOT OR aliases child_count created_at custom_fields details favorite galleries_filter gallery_count group_count groups_filter ignore_auto_tag image_count images_filter is_missing name organized parents rating100 scene_count scenes_filter stash_id_endpoint stash_ids_endpoint tag_count tags updated_at url'.split(' '),
  TagFilterType: 'AND NOT OR aliases child_count children created_at custom_fields description favorite galleries_filter gallery_count group_count groups_filter ignore_auto_tag image_count images_filter is_missing marker_count markers_filter movie_count name parent_count parents performer_count performers_filter scene_count scenes_filter sort_name stash_id_endpoint stash_ids_endpoint studio_count studios_filter updated_at'.split(' '),
}

const rows = (n: number) => [1, 2, 3].map((i) => ({ id: String(n + i), name: `n${i}` }))
const FAKE: Record<string, unknown> = {
  findPerformers: { count: 30, performers: rows(0) },
  findStudios: { count: 30, studios: rows(10) },
  findTags: { count: 30, tags: rows(20) },
}

type Sent = { query: string; variables: Record<string, Record<string, unknown>> }

// Every criterion key of a `$x: <Type>FilterType` variable that is not a field of that type.
const unknownKeys = ({ query, variables }: Sent) => {
  const bad: string[] = []
  for (const [, name, type] of query.matchAll(/\$(\w+): (\w+FilterType)/g)) {
    const fields = FIELDS[type]
    if (fields) for (const key of Object.keys(variables[name] ?? {})) if (!fields.includes(key)) bad.push(`${type}.${key}`)
  }
  return bad
}

// A Stash that answers every finder with three rows, and rejects unknown criteria like the
// real one would.
const sent: Sent[] = []
const fakeStash: typeof fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body)) as Sent
  sent.push(body)
  const bad = unknownKeys(body)
  if (bad.length) return Response.json({ errors: [{ message: `unknown field ${bad[0]}` }] }, { status: 422 })
  const op = Object.keys(FAKE).find((k) => body.query.includes(k))!
  return Response.json({ data: { [op]: FAKE[op] } })
}

const realFetch = globalThis.fetch
before(() => {
  globalThis.fetch = fakeStash
})
after(() => {
  globalThis.fetch = realFetch
})

const page = { per_page: 3 }

describe('finders', () => {
  it('list performers: everyone, those with a video, or the favourites, with the page\'s gender switch', async () => {
    const r = await findPerformers(page)
    assert.deepEqual(r.items.map((p) => p.id), ['1', '2', '3'])
    assert.equal(r.total, 30)
    assert.deepEqual(sent.at(-1)?.variables.p, {})
    await findPerformers(page, { only: 'used', gender: 'women' })
    assert.deepEqual(sent.at(-1)?.variables.p, { scene_count: { value: 0, modifier: 'GREATER_THAN' }, gender: { value_list: ['MALE'], modifier: 'EXCLUDES' } })
    await findPerformers(page, { only: 'favorites', gender: 'men' })
    assert.deepEqual(sent.at(-1)?.variables.p, { filter_favorites: true, gender: { value: 'MALE', modifier: 'EQUALS' } })
  })
  it('list studios', async () => {
    const r = await findStudios(page)
    assert.deepEqual(r.items.map((s) => s.id), ['11', '12', '13'])
  })
  it('list tags with the used-only criterion unless asked for all', async () => {
    const r = await findTags(page)
    assert.deepEqual(r.items.map((t) => t.id), ['21', '22', '23'])
    assert.deepEqual(sent.at(-1)?.variables.t, { scene_count: { value: 0, modifier: 'GREATER_THAN' } })
    await findTags({ per_page: 4 }, false)
    assert.deepEqual(sent.at(-1)?.variables.t, {})
  })
  it('send nothing to Stash it does not know', () => {
    assert.ok(sent.length >= 3)
    for (const s of sent) assert.deepEqual(unknownKeys(s), [])
  })
})
