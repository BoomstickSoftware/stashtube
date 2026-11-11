#!/usr/bin/env node
// Reels M0: how fast does a cluster node encode a reel clip? Runs one short ffmpeg encode with
// the planned build settings (fit to 1080p with bars, x264 slow, quality-targeted with a ceiling,
// AAC) in a throwaway pod on a chosen node, and prints frames per second, speed against real
// time and the output bitrate. The library is mounted read-only (the flix-media claim); the
// output goes to the pod's scratch space and is gone with the pod. Prints ids and numbers only:
// the source's path is resolved inside the flix pod and never reaches this terminal.
//
//   node scripts/encode-bench.mjs --pick 1080            # a random 1080p h264 video
//   node scripts/encode-bench.mjs --pick 2160 --cpus 3 --node talos-eb5-wpp
//   node scripts/encode-bench.mjs --scene 3079 --seconds 30 --preset medium
//
// --dry-run resolves the source and stops before creating the pod.
// --cpus is the pod's CPU limit (default 2); --node pins it (default: the scheduler picks a
// worker); --seconds of source to encode (default 60); --preset x264 preset (default slow).
import { spawnSync } from 'node:child_process'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const NS = 'flix'
const IMAGE = arg('image', 'mwader/static-ffmpeg:7.1')
const cpus = arg('cpus', '2')
const seconds = Number(arg('seconds', '60'))
const preset = arg('preset', 'slow')
const node = arg('node')
const scene = arg('scene')
const pick = arg('pick', scene ? undefined : '1080')

const kubectl = (args, input) => {
  const r = spawnSync('kubectl', ['-n', NS, ...args], { input, encoding: 'utf8', maxBuffer: 64 << 20 })
  if (r.status !== 0) throw new Error(`kubectl ${args.slice(0, 3).join(' ')}: ${r.stderr.trim().split('\n').at(-1)}`)
  return r.stdout
}

// Inside the flix pod (where the Stash key and the path map are): the file of the chosen scene.
const resolver = `
const q = ${JSON.stringify(
  scene
    ? `{ findScene(id: ${JSON.stringify(scene)}) { id files { path width height duration video_codec } } }`
    : `{ findScenes(filter:{per_page:1, sort:"random"}, scene_filter:{resolution:{value:${pick === '2160' ? 'FOUR_K' : 'FULL_HD'},modifier:EQUALS}, video_codec:{value:"h264",modifier:EQUALS}, duration:{value:600,modifier:GREATER_THAN}}) { scenes { id files { path width height duration video_codec } } } }`,
)}
const r = await fetch(process.env.STASH_URL.replace(/\\/$/, '') + '/graphql', { method: 'POST', headers: { 'content-type': 'application/json', ApiKey: process.env.STASH_API_KEY }, body: JSON.stringify({ query: q }) })
const d = (await r.json()).data
const s = d.findScene ?? d.findScenes.scenes[0]
const f = s.files[0]
let path = f.path
for (const pair of (process.env.MEDIA_PATH_MAP ?? '').split(',')) { const [from, to] = pair.split('='); if (from && to && path.startsWith(from.replace(/\\/$/, ''))) { path = to.replace(/\\/$/, '') + path.slice(from.replace(/\\/$/, '').length); break } }
console.log(JSON.stringify({ id: s.id, path, w: f.width, h: f.height, dur: f.duration, codec: f.video_codec }))
`
const src = JSON.parse(kubectl(['exec', 'deploy/flix', '--', 'node', '--input-type=module', '-e', resolver]).trim().split('\n').at(-1))
const at = Math.max(0, Math.floor(src.dur * 0.3))

const name = `encode-bench-${Date.now().toString(36)}`
const pod = {
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: { name, labels: { app: 'encode-bench' } },
  spec: {
    restartPolicy: 'Never',
    ...(node ? { nodeSelector: { 'kubernetes.io/hostname': node } } : { nodeSelector: { 'node-role.kubernetes.io/worker': '' } }),
    securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } },
    volumes: [
      { name: 'media', persistentVolumeClaim: { claimName: 'flix-media', readOnly: true } },
      { name: 'out', emptyDir: { sizeLimit: '2Gi' } },
    ],
    containers: [
      {
        name: 'ffmpeg',
        image: IMAGE,
        securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ['ALL'] }, readOnlyRootFilesystem: true },
        // the namespace's LimitRange allows a container 2 CPUs and 2Gi at most
        resources: { requests: { cpu: '500m', memory: '512Mi' }, limits: { cpu: cpus, memory: arg('memory', '2Gi') } },
        volumeMounts: [
          { name: 'media', mountPath: '/media/adult', readOnly: true },
          { name: 'out', mountPath: '/out' },
        ],
        // the build's planned settings (wiki/decisions/reels-edit-by-reference.md)
        args: [
          '-hide_banner', '-nostdin', '-loglevel', 'info', '-stats_period', '5',
          '-ss', String(at), '-t', String(seconds), '-i', src.path,
          '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1',
          '-c:v', 'libx264', '-preset', preset, '-crf', '18', '-maxrate', '16M', '-bufsize', '32M', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
          '-movflags', '+faststart', '-y', '/out/bench.mp4',
        ],
      },
    ],
  },
}

console.log(`encode-bench: scene ${src.id} (${src.h}p ${src.codec}), ${seconds}s from ${at}s, preset ${preset}, cpu limit ${cpus}${node ? `, node ${node}` : ''}`)
if (process.argv.includes('--dry-run')) {
  kubectl(['apply', '--dry-run=server', '-f', '-'], JSON.stringify(pod)) // the cluster validates it (admission, quotas) and creates nothing
  console.log(`dry run: would start pod ${name} from image ${IMAGE} with ${pod.spec.containers[0].args.length} ffmpeg arguments; nothing was created`)
  process.exit(0)
}
kubectl(['apply', '-f', '-'], JSON.stringify(pod))
let phase = 'Pending'
try {
  const t0 = Date.now()
  while (Date.now() - t0 < 20 * 60_000) {
    phase = kubectl(['get', 'pod', name, '-o', 'jsonpath={.status.phase}'])
    if (phase === 'Succeeded' || phase === 'Failed') break
    spawnSync('sleep', ['5'])
  }
  const where = kubectl(['get', 'pod', name, '-o', 'jsonpath={.spec.nodeName}'])
  const logs = kubectl(['logs', name, '--tail', '200'])
  // the last progress line: frame= 1800 fps= 31 q=-1.0 Lsize= 81234KiB time=00:01:00.00 bitrate=11091.5kbits/s speed=1.03x
  const last = logs.split(/[\r\n]+/).filter((l) => /^frame=/.test(l.trim())).at(-1) ?? ''
  const num = (re) => Number(last.match(re)?.[1])
  if (phase !== 'Succeeded' || !last) {
    // an error line may quote the path: print its shape only
    const err = logs.split('\n').filter((l) => /error|invalid|denied|No such/i.test(l)).at(-1) ?? ''
    console.log(`FAILED on ${where || '?'} (${phase}): ${err.replaceAll(src.path, '<path>').slice(0, 200) || 'no ffmpeg output'}`)
    process.exitCode = 1
  } else {
    const fps = num(/fps=\s*([\d.]+)/)
    const speed = num(/speed=\s*([\d.]+)x/)
    const mbps = num(/bitrate=\s*([\d.]+)kbits/) / 1000
    console.log(`node ${where}  fps ${fps}  speed ${speed}x real time  output ${mbps.toFixed(1)} Mbit/s  (${(mbps * 60 * 20 / 8 / 1000).toFixed(2)} GB per 20 min)  wall ${Math.round((Date.now() - t0) / 1000)}s incl. image pull`)
  }
} finally {
  spawnSync('kubectl', ['-n', NS, 'delete', 'pod', name, '--wait=false'], { encoding: 'utf8' })
}
