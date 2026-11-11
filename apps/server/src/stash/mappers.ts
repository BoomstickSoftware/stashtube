// Stash's shapes as the flix API contract (@flix/shared), and the GraphQL fragments that select
// what each mapper reads.
import { compatibility, type Marker, type PerformerCard, type Ref, type SceneCard, type SceneDetail, type StudioCard, type TagCard } from '@flix/shared'
import { config } from '../config.ts'
import { signScene } from '../signing.ts'
import type { Performer, Scene, SceneMarker, Studio, Tag, VideoFile } from '../stash.schema.ts'

// Stash returns absolute URLs to itself, some carrying the API key. The browser gets
// the same path under /media/stash, which the BFF proxies with the key attached.
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const u = new URL(url, config.stashUrl)
  u.searchParams.delete('apikey')
  return `/media/stash${u.pathname}${u.search}`
}

const stars = (r: number | null | undefined) => (r == null ? null : r / 20)
export const rating100 = (s: number | null) => (s == null || s <= 0 ? null : Math.round(s * 20))

// --- fragments ------------------------------------------------------------------

// A card's performers carry no image: no card renders one (a quarter of a list's raw bytes,
// 2026-10-31); the scene page's avatars come from SCENE_DETAIL, which selects it.
export const SCENE_CARD = `
  id title date created_at rating100 play_count o_counter resume_time last_played_at
  files { path duration width height size format video_codec audio_codec }
  paths { screenshot preview vtt }
  studio { id name image_path }
  performers { id name }
`

export const SCENE_DETAIL = `
  ${SCENE_CARD}
  details code director urls
  performers { image_path gender }
  studio { parent_studio { id } }
  tags { id name }
  files { size format video_codec audio_codec bit_rate frame_rate }
  scene_markers { id seconds end_seconds title primary_tag { id name } }
`

export const PERFORMER_CARD = `id name image_path scene_count favorite rating100 gender country`
// depth -1: a network counts its studios' videos
export const STUDIO_CARD = `id name image_path scene_count(depth: -1) favorite parent_studio { id name }`
export const TAG_CARD = `id name scene_count favorite`

// --- mappers --------------------------------------------------------------------

// The mappers take Stash's object types whole, but each query selects only the fields its
// fragment names: a field the fragment leaves out is `undefined` at runtime whatever the type
// says. Hence the `?? 0` / `|| null` defaults, and new fields go into the fragment first.
export const file = (s: Pick<Scene, 'files'>) => s.files?.[0] as VideoFile | undefined

export const ref = (r: Pick<Performer | Studio, 'id' | 'name' | 'image_path'>): Ref => ({
  id: r.id,
  name: r.name,
  image: mediaUrl(r.image_path),
})

export function sceneTitle(s: Pick<Scene, 'id' | 'title' | 'files'>): string {
  if (s.title) return s.title
  const path = file(s)?.path
  return path ? path.split('/').pop()!.replace(/\.[^.]+$/, '') : `Scene ${s.id}`
}

export function toSceneCard(s: Scene): SceneCard {
  const f = file(s)
  return {
    id: s.id,
    title: sceneTitle(s),
    date: s.date ?? null,
    durationSec: f?.duration ?? 0,
    width: f?.width ?? 0,
    height: f?.height ?? 0,
    size: f?.size ?? 0,
    rating: stars(s.rating100),
    playCount: s.play_count ?? 0,
    oCount: s.o_counter ?? 0,
    resumeTime: s.resume_time ?? 0,
    lastPlayedAt: s.last_played_at ?? null,
    createdAt: s.created_at,
    studio: s.studio ? ref(s.studio) : null,
    performers: (s.performers ?? []).map((p) => ({ id: p.id, name: p.name })),
    screenshot: mediaUrl(s.paths?.screenshot)!,
    preview: mediaUrl(s.paths?.preview),
    vtt: mediaUrl(s.paths?.vtt),
    compat: compatibility({ container: f?.format ?? '', videoCodec: f?.video_codec ?? '', audioCodec: f?.audio_codec ?? '' }),
  }
}

export function toSceneDetail(s: Scene): Omit<SceneDetail, 'hidden' | 'unlisted' | 'unlistedVia' | 'cast'> {
  const markers = (s.scene_markers ?? []).map(toMarker).sort((a, b) => a.seconds - b.seconds)
  const f = file(s)
  return {
    ...toSceneCard(s),
    performers: (s.performers ?? []).map((p) => ref(p)), // with avatars
    details: s.details || null,
    code: s.code || null,
    director: s.director || null,
    urls: s.urls ?? [],
    tags: (s.tags ?? []).map((t) => ({ id: t.id, name: t.name })),
    file: f
      ? {
          path: f.path,
          size: f.size,
          container: f.format,
          videoCodec: f.video_codec,
          audioCodec: f.audio_codec,
          bitrate: f.bit_rate,
          framerate: f.frame_rate,
        }
      : null,
    markers,
    playback: {
      direct: `${config.mediaOrigin}/media/play/${s.id}?st=${signScene(s.id)}`,
      hls: `${config.mediaOrigin}/media/stash/scene/${s.id}/stream.m3u8?resolution=ORIGINAL&st=${signScene(s.id)}`,
      container: f?.format ?? '',
      videoCodec: f?.video_codec ?? '',
      audioCodec: f?.audio_codec ?? '',
    },
  }
}

export const toPerformerCard = (p: Performer): PerformerCard => ({
  id: p.id,
  name: p.name,
  image: mediaUrl(p.image_path),
  sceneCount: p.scene_count ?? 0,
  favorite: !!p.favorite,
  rating: stars(p.rating100),
  gender: p.gender ?? null,
  country: p.country || null,
})

export const toStudioCard = (s: Studio): StudioCard => ({
  id: s.id,
  name: s.name,
  image: mediaUrl(s.image_path),
  sceneCount: s.scene_count ?? 0,
  favorite: !!s.favorite,
  parent: s.parent_studio ? { id: s.parent_studio.id, name: s.parent_studio.name } : null,
})

export const toTagCard = (t: Tag): TagCard => ({
  id: t.id,
  name: t.name,
  sceneCount: t.scene_count ?? 0,
  favorite: !!t.favorite,
})

// A marker as the app shows it. An untitled marker is named after its primary tag, which Stash
// requires on every marker (flix's own default is "Highlight").
export const toMarker = (m: Pick<SceneMarker, 'id' | 'seconds' | 'end_seconds' | 'title'> & { primary_tag?: { id: string; name: string } | null }): Marker => ({
  id: m.id,
  seconds: m.seconds,
  endSeconds: m.end_seconds ?? null,
  title: m.title || m.primary_tag?.name || '',
  tag: m.primary_tag?.name ?? '',
  tagId: m.primary_tag?.id ?? '',
})

export const MARKER_FIELDS = 'id seconds end_seconds title primary_tag { id name }'

// The fields isBlocked reads, for queries that apply the blocklist after the fact.
export const BLOCK_FIELDS = 'tags { id } performers { id } studio { id parent_studio { id } }'
