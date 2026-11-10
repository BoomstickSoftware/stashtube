import type { DeleteResult } from '@flix/shared'
import { stat } from 'node:fs/promises'
import { localPath } from './media.ts'
import { forgetScene } from './playlists.ts'
import { destroyScene, sceneForDeletion } from './stash.ts'
import { deleteMovie, exclude, movieForFile } from './whisparr.ts'

// Deletes a scene everywhere: its file and Whisparr entry (with an import exclusion, so it is
// not downloaded again), the Stash scene with its generated files, and its playlist entries.
// Whisparr must own every file of the scene; if one is not found, nothing is touched, unless
// the file is already gone from disk (e.g. Whisparr deleted it but Stash was busy): then the
// Stash scene is removed and its StashDB ids are excluded in Whisparr, so discovery never
// fetches it again.
export async function deleteScene(id: string): Promise<DeleteResult> {
  const scene = await sceneForDeletion(id)
  if (!scene) return { id, title: null, ok: false, error: 'not in Stash' }
  // the log carries ids only (wiki/decisions/content-neutral-sessions.md); the title and file name go to the user
  const fail = (error: string, logged = error): DeleteResult => {
    console.warn(`delete scene ${id} failed: ${logged}`)
    return { id, title: scene.title, ok: false, error }
  }
  try {
    const movies = new Map<number, string | null>()
    for (const path of scene.paths) {
      const movie = await movieForFile(path, scene.stashIds)
      if (movie) movies.set(movie.id, movie.stashId ?? null)
      else if (!(await gone(path))) return fail(`Whisparr has no entry for ${path.split('/').pop()}; nothing was deleted`, 'Whisparr has no entry for one of its files; nothing was deleted')
    }
    for (const [movieId, stashId] of movies) await deleteMovie(movieId, stashId)
    if (!movies.size) await exclude(scene.stashDbIds, scene.title)
    try {
      await destroyScene(id)
    } catch (e) {
      return fail(`the file is deleted, but Stash is busy (${(e as Error).message}); delete again later to remove the entry`)
    }
    await forgetScene(id)
    console.log(`deleted scene ${id} (whisparr ${[...movies.keys()].join(', ') || 'none: file already gone'})`)
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
