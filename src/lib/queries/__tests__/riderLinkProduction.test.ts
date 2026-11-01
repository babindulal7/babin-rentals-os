import { describe, it, expect, vi, afterEach } from 'vitest'

// Production mode: IS_MOCK=false, so hashRiderToken may never fall back to node:crypto or a weak hash.
vi.mock('../../supabase', () => ({
  IS_MOCK: false,
  supabase: { functions: { invoke: vi.fn() }, rpc: vi.fn(), from: vi.fn() },
}))

import { generateRiderRawToken, hashRiderToken } from '../riderLink'

describe('riderLink cryptography in production mode (T4-08, W49)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hashes with the real SHA-256 when subtle crypto is present', async () => {
    expect(await hashRiderToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('refuses to hash — never substitutes a weaker digest — when subtle crypto is missing', async () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    await expect(hashRiderToken('abc')).rejects.toThrow(/Secure SHA-256 hashing is unavailable/)
  })

  it('refuses to mint a bearer token when secure random generation is missing', () => {
    vi.stubGlobal('crypto', undefined)
    expect(() => generateRiderRawToken()).toThrow(/Secure random generation is unavailable/)
  })
})
