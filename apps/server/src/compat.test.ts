import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compatibility, NOT_MP4_PATH } from '@flix/shared'

const c = (container: string, videoCodec: string, audioCodec = 'aac') => compatibility({ container, videoCodec, audioCodec })

test('MP4 with H.264 and common sound plays everywhere', () => {
  assert.equal(c('mp4', 'h264'), 'everywhere')
  assert.equal(c('mp4', 'h264', 'mp3'), 'everywhere')
  assert.equal(c('mp4', 'h264', ''), 'everywhere') // no sound track
  assert.equal(c('MOV', 'H264', 'AAC'), 'everywhere')
  assert.equal(c('m4v', 'h264'), 'everywhere')
})

test('an MP4 with a codec only some devices decode plays on some devices', () => {
  assert.equal(c('mp4', 'hevc'), 'device')
  assert.equal(c('mp4', 'av1'), 'device')
  assert.equal(c('mp4', 'h264', 'ac3'), 'device')
})

test('every other container transcodes, whatever is inside (the census: avi, mkv, wmv)', () => {
  assert.equal(c('matroska', 'h264'), 'transcode')
  assert.equal(c('mkv', 'hevc'), 'transcode')
  assert.equal(c('avi', 'mpeg4', 'mp3'), 'transcode')
  assert.equal(c('asf', 'vc1', 'wmav2'), 'transcode')
  assert.equal(c('', ''), 'transcode') // a scene without a file
})

test('the path pattern for the transcodes filter matches MP4-family names only, any case', () => {
  const re = new RegExp(NOT_MP4_PATH.replace('(?i)', ''), 'i')
  for (const p of ['/a/b.mp4', '/a/b.MP4', '/a/b.m4v', '/a/b.mov']) assert.ok(re.test(p), p)
  for (const p of ['/a/b.mkv', '/a/b.avi', '/a/b.wmv', '/a/mp4/b.mkv', '/a/b.mp4.part']) assert.ok(!re.test(p), p)
})
