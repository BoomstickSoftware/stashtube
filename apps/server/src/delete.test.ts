// deleteScene's order of writes (delete.ts), with every dependency stubbed: nothing here reaches
// Stash, Whisparr or the disk. The order is the safety: the file goes through Whisparr first,
// Stash's entry only after, and nothing at all when Whisparr does not own a file that exists.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deleteScene } from './delete.ts'

type Deps = NonNullable<Parameters<typeof deleteScene>[1]>

// Stubs that log each call; `over` replaces any of them.
function stubs(over: Partial<Deps> = {}) {
  const calls: string[] = []
  const deps: Deps = {
    sceneForDeletion: async (id) => (calls.push(`read ${id}`), { title: 'T', paths: ['/data/a/one.mp4'], stashIds: ['sid-1'], stashDbIds: ['sdb-1'] }),
    movieForFile: async (path) => (calls.push(`lookup ${path}`), { id: 7, title: 'T', path: '/x', stashId: 'sdb-1' }),
    deleteMovie: async (id, stashId) => void calls.push(`whisparr delete ${id} ${stashId}`),
    exclude: async (ids) => void calls.push(`exclude ${ids.join(',')}`),
    destroyScene: async (id) => void calls.push(`stash destroy ${id}`),
    forgetScene: async (id) => void calls.push(`forget ${id}`),
    gone: async (path) => (calls.push(`gone? ${path}`), false),
    ...over,
  }
  return { deps, calls }
}

describe('deleteScene', () => {
  it('deletes in Whisparr before Stash, then forgets the scene', async () => {
    const { deps, calls } = stubs()
    const r = await deleteScene('5', deps)
    assert.deepEqual(r, { id: '5', title: 'T', ok: true })
    assert.deepEqual(calls, ['read 5', 'lookup /data/a/one.mp4', 'whisparr delete 7 sdb-1', 'stash destroy 5', 'forget 5'])
  })

  it('resolves every file before the first delete, and deletes each Whisparr entry once', async () => {
    const { deps, calls } = stubs({
      sceneForDeletion: async () => ({ title: 'T', paths: ['/a.mp4', '/b.mp4', '/c.mp4'], stashIds: [], stashDbIds: [] }),
      movieForFile: async (path) => (calls.push(`lookup ${path}`), { id: path === '/c.mp4' ? 8 : 7, title: 'T', path: '/x' }),
    })
    assert.equal((await deleteScene('5', deps)).ok, true)
    assert.deepEqual(calls, ['lookup /a.mp4', 'lookup /b.mp4', 'lookup /c.mp4', 'whisparr delete 7 null', 'whisparr delete 8 null', 'stash destroy 5', 'forget 5'])
  })

  it('touches nothing when Whisparr lacks a file that still exists', async () => {
    const { deps, calls } = stubs({
      sceneForDeletion: async () => ({ title: 'T', paths: ['/a.mp4', '/b.mp4'], stashIds: [], stashDbIds: ['sdb-1'] }),
      movieForFile: async (path) => (calls.push(`lookup ${path}`), path === '/a.mp4' ? { id: 7, title: 'T', path: '/x' } : null),
    })
    const r = await deleteScene('5', deps)
    assert.equal(r.ok, false)
    assert.match(r.error!, /nothing was deleted/)
    assert.deepEqual(calls, ['lookup /a.mp4', 'lookup /b.mp4', 'gone? /b.mp4'])
  })

  it('removes the Stash scene and excludes its StashDB ids when the file is already gone', async () => {
    const { deps, calls } = stubs({ movieForFile: async () => null, gone: async () => true })
    const r = await deleteScene('5', deps)
    assert.equal(r.ok, true)
    assert.deepEqual(calls, ['read 5', 'exclude sdb-1', 'stash destroy 5', 'forget 5'])
  })

  it('reports a scene Stash does not have, and writes nothing', async () => {
    const { deps, calls } = stubs({ sceneForDeletion: async () => null })
    assert.deepEqual(await deleteScene('5', deps), { id: '5', title: null, ok: false, error: 'not in Stash' })
    assert.deepEqual(calls, [])
  })

  it('keeps the playlist entries when Stash is too busy to drop the scene, and says the file is gone', async () => {
    const { deps, calls } = stubs({
      destroyScene: async () => {
        throw new Error('database is locked')
      },
    })
    const r = await deleteScene('5', deps)
    assert.equal(r.ok, false)
    assert.match(r.error!, /the file is deleted, but Stash is busy/)
    assert.ok(calls.includes('whisparr delete 7 sdb-1'))
    assert.ok(!calls.some((c) => c.startsWith('forget')))
  })

  it('stops before Stash when the Whisparr delete fails', async () => {
    const { deps, calls } = stubs({
      deleteMovie: async () => {
        throw new Error('Whisparr HTTP 500 on DELETE /movie/7')
      },
    })
    const r = await deleteScene('5', deps)
    assert.deepEqual([r.ok, r.error], [false, 'Whisparr HTTP 500 on DELETE /movie/7'])
    assert.ok(!calls.some((c) => c.startsWith('stash destroy') || c.startsWith('forget')))
  })
})
