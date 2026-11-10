// Performers, studios and tags: lists, detail pages and their favourites and ratings.
import type { PerformerDetail, PerformerGender, StudioDetail, TagDetail } from '@flix/shared'
import type { FindFilterType, PerformerFilterType, Query, StudioFilterType, Tag, TagFilterType } from '../stash.schema.ts'
import { mutate, query } from './client.ts'
import { genderCriterion } from './filters.ts'
import { PERFORMER_CARD, rating100, ref, STUDIO_CARD, TAG_CARD, toPerformerCard, toStudioCard, toTagCard } from './mappers.ts'

// `only`: the favourites, or those with a video ('used'); neither lists everyone (search).
// `gender`: the Performers page's own switch, kept per browser (gender-switch-performers-page-only).
export async function findPerformers(filter: FindFilterType, opts: { only?: 'favorites' | 'used'; gender?: PerformerGender } = {}) {
  const pf: PerformerFilterType = opts.only === 'favorites' ? { filter_favorites: true } : opts.only === 'used' ? { scene_count: { value: 0, modifier: 'GREATER_THAN' } } : {}
  const gender = genderCriterion(opts.gender ?? 'all')
  if (gender) pf.gender = gender

  const d = await query<Pick<Query, 'findPerformers'>>(
    `query($f: FindFilterType, $p: PerformerFilterType) {
      findPerformers(filter: $f, performer_filter: $p) { count performers { ${PERFORMER_CARD} } }
    }`,
    { f: filter, p: pf },
    ['performer'],
  )
  return { total: d.findPerformers.count, items: d.findPerformers.performers.map(toPerformerCard) }
}

export async function getPerformer(id: string): Promise<PerformerDetail | null> {
  const d = await query<Pick<Query, 'findPerformer'>>(
    `query($id: ID!) { findPerformer(id: $id) {
      ${PERFORMER_CARD} disambiguation alias_list birthdate ethnicity hair_color eye_color height_cm
      measurements fake_tits career_start career_end tattoos piercings details urls tags { id name }
    } }`,
    { id },
    ['performer', `performer:${id}`],
  )
  const p = d.findPerformer
  if (!p) return null
  return {
    ...toPerformerCard(p),
    disambiguation: p.disambiguation || null,
    aliases: p.alias_list ?? [],
    birthdate: p.birthdate || null,
    ethnicity: p.ethnicity || null,
    hairColor: p.hair_color || null,
    eyeColor: p.eye_color || null,
    heightCm: p.height_cm ?? null,
    measurements: p.measurements || null,
    fakeTits: p.fake_tits || null,
    careerStart: p.career_start ?? null,
    careerEnd: p.career_end ?? null,
    tattoos: p.tattoos || null,
    piercings: p.piercings || null,
    details: p.details || null,
    urls: p.urls ?? [],
    tags: (p.tags ?? []).map((t) => ({ id: t.id, name: t.name })),
  }
}

// Drops the performer; the performer lists and the scene rows a favourite drives ("New from
// performers you follow") are served once more while they refresh.
export async function setPerformerFavorite(id: string, favorite: boolean) {
  await mutate(`mutation($id: ID!, $f: Boolean) { performerUpdate(input: { id: $id, favorite: $f }) { id } }`, {
    id,
    f: favorite,
  }, [`performer:${id}`], ['performer', 'scene'])
}

export async function setPerformerRating(id: string, stars: number | null) {
  await mutate(`mutation($id: ID!, $r: Int) { performerUpdate(input: { id: $id, rating100: $r }) { id } }`, {
    id,
    r: rating100(stars),
  }, ['performer'])
}

export async function findStudios(filter: FindFilterType) {
  const sf: StudioFilterType = {}
  const d = await query<Pick<Query, 'findStudios'>>(
    `query($f: FindFilterType, $s: StudioFilterType) {
      findStudios(filter: $f, studio_filter: $s) { count studios { ${STUDIO_CARD} } }
    }`,
    { f: filter, s: sf },
    ['studio'],
  )
  return { total: d.findStudios.count, items: d.findStudios.studios.map(toStudioCard) }
}

export async function getStudio(id: string): Promise<StudioDetail | null> {
  const d = await query<Pick<Query, 'findStudio'>>(
    `query($id: ID!) { findStudio(id: $id) { ${STUDIO_CARD} details urls child_studios { id name image_path } } }`,
    { id },
    ['studio', `studio:${id}`],
  )
  const s = d.findStudio
  if (!s) return null
  return {
    ...toStudioCard(s),
    details: s.details || null,
    urls: s.urls ?? [],
    children: (s.child_studios ?? []).map((c) => ref(c)),
  }
}

export async function setStudioFavorite(id: string, favorite: boolean) {
  await mutate(`mutation($id: ID!, $f: Boolean) { studioUpdate(input: { id: $id, favorite: $f }) { id } }`, {
    id,
    f: favorite,
  }, ['studio'])
}

export async function setTagFavorite(id: string, favorite: boolean) {
  await mutate(`mutation($id: ID!, $f: Boolean) { tagUpdate(input: { id: $id, favorite: $f }) { id } }`, {
    id,
    f: favorite,
  }, ['tag'])
}

export async function findTags(filter: FindFilterType, onlyUsed = true) {
  const tf: TagFilterType = {}
  if (onlyUsed) tf.scene_count = { value: 0, modifier: 'GREATER_THAN' }
  const d = await query<Pick<Query, 'findTags'>>(
    `query($f: FindFilterType, $t: TagFilterType) {
      findTags(filter: $f, tag_filter: $t) { count tags { ${TAG_CARD} } }
    }`,
    { f: filter, t: tf },
    ['tag'],
  )
  return { total: d.findTags.count, items: d.findTags.tags.map(toTagCard) }
}

export async function getTag(id: string): Promise<TagDetail | null> {
  const d = await query<Pick<Query, 'findTag'>>(
    `query($id: ID!) { findTag(id: $id) { ${TAG_CARD} description aliases parents { id name } children { id name } } }`,
    { id },
    ['tag', `tag:${id}`],
  )
  const t = d.findTag
  if (!t) return null
  return {
    ...toTagCard(t),
    description: t.description || null,
    aliases: t.aliases ?? [],
    parents: t.parents.map((p) => ({ id: p.id, name: p.name })),
    children: t.children.map((c) => ({ id: c.id, name: c.name })),
  }
}

export async function namesFor(kind: 'tag' | 'performer' | 'studio', id: string): Promise<string | null> {
  const q = {
    tag: `query($id: ID!) { x: findTag(id: $id) { name } }`,
    performer: `query($id: ID!) { x: findPerformer(id: $id) { name } }`,
    studio: `query($id: ID!) { x: findStudio(id: $id) { name } }`,
  }[kind]
  const d = await query<{ x: Pick<Tag, 'name'> | null }>(q, { id }, [kind, `${kind}:${id}`])
  return d.x?.name ?? null
}
