import type { DeleteResult } from '@flix/shared'
import { forgetScene } from './playlists.ts'
import { destroyScene, sceneForDeletion } from './stash.ts'
import { deleteMovie, movieForFile } from './whisparr.ts'

// Deletes a scene everywhere: its file and Whisparr entry (with an import exclusion, so it is
// not downloaded again), the Stash scene with its generated files, and its playlist entries.
// Whisparr must own every file of the scene; if one is not found, nothing is touched.
export async function deleteScene(id: string): Promise<DeleteResult> {
  const scene = await sceneForDeletion(id)
  if (!scene) return { id, title: null, ok: false, error: 'not in Stash' }
  try {
    const movies = new Map<number, string>()
    for (const path of scene.paths) {
      const movie = await movieForFile(path, scene.stashIds)
      if (!movie) return { id, title: scene.title, ok: false, error: `Whisparr has no entry for ${path.split('/').pop()}; nothing was deleted` }
      movies.set(movie.id, movie.title)
    }
    for (const movieId of movies.keys()) await deleteMovie(movieId)
    await destroyScene(id)
    await forgetScene(id)
    console.log(`deleted scene ${id} "${scene.title}" (whisparr ${[...movies.keys()].join(', ') || 'none'})`)
    return { id, title: scene.title, ok: true }
  } catch (e) {
    return { id, title: scene.title, ok: false, error: (e as Error).message }
  }
}
