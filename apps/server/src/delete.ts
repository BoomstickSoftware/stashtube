import type { DeleteResult } from '@flix/shared'
import { stat } from 'node:fs/promises'
import { localPath } from './media.ts'
import { forgetScene } from './playlists.ts'
import { destroyScene, sceneForDeletion } from './stash.ts'
import { deleteMovie, movieForFile } from './whisparr.ts'

// Deletes a scene everywhere: its file and Whisparr entry (with an import exclusion, so it is
// not downloaded again), the Stash scene with its generated files, and its playlist entries.
// Whisparr must own every file of the scene; if one is not found, nothing is touched, unless
// the file is already gone from disk (e.g. Whisparr deleted it but Stash was busy): then only
// the Stash scene is left to remove.
export async function deleteScene(id: string): Promise<DeleteResult> {
  const scene = await sceneForDeletion(id)
  if (!scene) return { id, title: null, ok: false, error: 'not in Stash' }
  const fail = (error: string): DeleteResult => {
    console.warn(`delete scene ${id} "${scene.title}" failed: ${error}`)
    return { id, title: scene.title, ok: false, error }
  }
  try {
    const movies = new Map<number, string>()
    for (const path of scene.paths) {
      const movie = await movieForFile(path, scene.stashIds)
      if (movie) movies.set(movie.id, movie.title)
      else if (!(await gone(path))) return fail(`Whisparr has no entry for ${path.split('/').pop()}; nothing was deleted`)
    }
    for (const movieId of movies.keys()) await deleteMovie(movieId)
    try {
      await destroyScene(id)
    } catch (e) {
      return fail(`the file is deleted, but Stash is busy (${(e as Error).message}); delete again later to remove the entry`)
    }
    await forgetScene(id)
    console.log(`deleted scene ${id} "${scene.title}" (whisparr ${[...movies.keys()].join(', ') || 'none: file already gone'})`)
    return { id, title: scene.title, ok: true }
  } catch (e) {
    return fail((e as Error).message)
  }
}

// Whether a Stash file no longer exists, checked on this host's read-only media mount.
// Without a mount it cannot tell, so it answers no.
async function gone(stashPath: string): Promise<boolean> {
  const file = localPath(stashPath)
  return !!file && !(await stat(file).catch(() => null))
}
