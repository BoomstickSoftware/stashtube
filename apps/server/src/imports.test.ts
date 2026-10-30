// The runtime image must carry @flix/shared's source, not only its types: the server imports
// values from it (the Featured defaults). It once did not (2026-10-30), and a value import that
// passed typecheck and the tests in the build stage crashed the pod at boot with
// ERR_MODULE_NOT_FOUND. This runs in the build stage, where shared is present either way, so it
// guards the contract from the code side; the Dockerfile's COPY of packages/shared/src is the
// other half, and the deploy's smoke test is what catches a broken image.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FEATURED_DEFAULTS } from '@flix/shared'
import { FEATURED_DEFAULTS as serverDefaults, SIGNALS } from './featured.ts'

describe('shared package', () => {
  it('resolves at run time and is the one source of the Featured defaults', () => {
    assert.equal(serverDefaults, FEATURED_DEFAULTS)
    for (const s of SIGNALS) assert.equal(typeof FEATURED_DEFAULTS[s], 'number')
    assert.equal(typeof FEATURED_DEFAULTS.surprise, 'number')
  })
})
