#!/usr/bin/env node
// The reel builder on the NAS (wiki features/reel-builds): copy its code there, run it once by
// hand, or look at the running one. The builder itself is apps/server/src/reelBuilder.ts; it
// needs the two shared files it imports, so the three are copied with their repo paths kept.
//
//   node scripts/reel-builder.mjs deploy            # copy the code to the NAS and make the reels folder
//   node scripts/reel-builder.mjs once <flix-url>   # one-off container: ask once, build at most one reel
//   node scripts/reel-builder.mjs status            # the stack's reel-builder container and its last lines
//
// `deploy` and `once` write on the NAS: the app folder under .flotilla/reel-builder and
// Media/adult/reels (built files and intermediates). The library is mounted read-only.
// Output is ids, counts and timings only.
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HOST = 'dtr'
const APP = '/volume1/Flotilla/.flotilla/reel-builder/app'
const REELS = '/volume1/Media/adult/reels'
const FILES = ['apps/server/src/reelBuilder.ts', 'packages/shared/src/render.ts', 'packages/shared/src/reels.ts']
// What the container runs: Alpine with Node, ffmpeg and Intel's VAAPI driver added at start
// (the Stash container gets its driver the same way).
// apk's exit status is not trusted: on this NAS its post-install triggers (busybox, glib,
// ca-certificates) are killed with signal 9 and apk reports failure although every package is
// installed. What matters is checked instead: node and ffmpeg are there.
export const START = 'apk add --no-cache --quiet nodejs ffmpeg intel-media-driver >/dev/null 2>&1; command -v node >/dev/null && command -v ffmpeg >/dev/null || { echo "node or ffmpeg did not install"; exit 1; }; exec node /app/apps/server/src/reelBuilder.ts'

const ssh = (cmd, opts = {}) => spawnSync('ssh', [HOST, cmd], { encoding: 'utf8', maxBuffer: 64 << 20, ...opts })
const must = (r, what) => {
  if (r.status !== 0) {
    console.error(`${what} failed: ${(r.stderr || r.stdout || '').trim().split('\n').at(-1)}`)
    process.exit(1)
  }
  return r.stdout
}

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'deploy') {
  const tar = spawnSync('tar', ['-C', ROOT, '-cf', '-', ...FILES], { maxBuffer: 64 << 20 })
  if (tar.status !== 0) throw new Error('tar failed')
  must(ssh(`mkdir -p ${APP} ${REELS}/.work && rm -rf ${APP}/apps ${APP}/packages && tar -C ${APP} -xf - && find ${APP} -type f | wc -l`, { input: tar.stdout, encoding: 'buffer' }), 'copy')
  console.log(`deployed ${FILES.length} files to the NAS; the reels folder exists. Restart the container to pick up new code.`)
} else if (cmd === 'once') {
  if (!/^https?:\/\/[\w.:-]+$/.test(arg ?? '')) throw new Error('usage: once <flix-url>, e.g. http://192.168.1.152')
  const run = `docker run --rm --name reel-builder-once --device /dev/dri:/dev/dri -e FLIX_URL=${arg} -e REELS_DIR=/reels -e ONCE=1 -v ${APP}:/app:ro -v /volume1/Media/adult:/data/adult:ro -v ${REELS}:/reels alpine:3.24 sh -c '${START}'`
  const r = ssh(run)
  // the builder prints no paths; keep it that way if ffmpeg or apk says something unexpected
  console.log((r.stdout + r.stderr).split('\n').filter((l) => l.trim()).map((l) => l.replace(/\/(data|reels|volume1)\/\S+/g, '<path>').slice(0, 240)).slice(-20).join('\n'))
  process.exitCode = r.status ?? 1
} else if (cmd === 'status') {
  console.log(must(ssh(`docker ps -a --filter name=reel-builder --format '{{.Names}}  {{.Status}}'; docker logs --tail 15 reel-builder 2>&1 | sed -E 's#/(data|reels|volume1)/[^ ]+#<path>#g'; ls ${REELS} 2>/dev/null | grep -c '^reel-' ; du -sh ${REELS}/.work 2>/dev/null | cut -f1`), 'status').trim())
} else {
  console.log('usage: node scripts/reel-builder.mjs deploy | once <flix-url> | status')
  process.exitCode = 1
}
