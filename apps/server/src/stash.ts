// The Stash layer's public face. Everything Stash-specific lives under stash/ (the GraphQL
// client, the filter builders, the mappers to @flix/shared, one module per kind of read or
// write); the rest of the server imports from here and never from stash.schema.ts
// (boundaries.test.ts pins that).
export { dataCache, HOME, HOME_TTL, POOL } from './cache/data.ts'
export { daySeed, memoBy, StashError, stashFetch, stashVersion, upstream } from './stash/client.ts'
export { acceptOwnChanges, activeWithin, checkForChanges, fingerprint as libraryFingerprint, noteActivity, onStashChange, usedRecently, WarmDebounce } from './stash/changes.ts'
export { mediaUrl, rating100, toMarker, toPerformerCard, toSceneCard, toStudioCard, toTagCard } from './stash/mappers.ts'
export { type Exclusions, findFilter, isBlocked, type People, sceneFilter, type SceneMarks, type UnlistedSets, unlistedReasons, withinReasons } from './stash/filters.ts'
export { existingSceneIds, findDuplicateScenes, findScenes, findScenesByIds, firstSceneYear, getScene, groupFolder, missingSceneId, relatedScenes, sceneFilePath } from './stash/scenes.ts'
export {
  addSceneO,
  addScenePlay,
  clearResume,
  continueAges,
  createMarker,
  deleteMarker,
  destroyScene,
  hiddenScenes,
  hiddenTag,
  saveSceneActivity,
  sceneForDeletion,
  setSceneHidden,
  setSceneUnlisted,
  unlistedScenes,
  unlistedTag,
  updateMarker,
  updateScene,
  updateSceneRating,
} from './stash/sceneWrites.ts'
export { findPerformers, findStudios, findTags, getPerformer, getStudio, getTag, namesFor, setPerformerFavorite, setPerformerRating, setStudioFavorite, setTagFavorite } from './stash/entities.ts'
export { followJob, identifyScene, jobStatus } from './stash/jobs.ts'
export { sceneFacets, tagTiles } from './stash/facets.ts'
export { addPlays, type Affinities, affinities, deletePlays, groupHistory, history, lastPlayed, recommendations, stats } from './stash/activity.ts'
export { featuredCandidates } from './stash/featured.ts'
export { allArtwork, favoritePerformers, favoritePerformerStashIds, favoriteStudios, favoriteTagIds, libraryIdForStashId, sceneStashIdMap, stashBoxes, stashIdsOf, tagLookup } from './stash/library.ts'
export { bulkSceneTags, bulkTag, castInputs, ensureTags, sceneIdsMatching, studioTagInputs, tagCounts, tagIdsByName, tagsByIds } from './stash/bulk.ts'
