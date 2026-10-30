import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getOrCreateDeviceKey,
  resetDeviceKeyCacheForTesting,
  resetRosterDbCacheForTesting,
  closeDatabasesForTesting,
  encryptRefreshToken,
  decryptRefreshToken,
  getRoster,
  upsertRosterEntry,
  getRosterEntry,
  touchRosterEntry,
  updateRosterLockout,
  updateRosterPinStatus,
  removeRosterEntry,
  clearRoster,
  isRosterFull,
  storeSession,
  getAndDecryptSession,
  hasSession,
  removeSession,
  clearAllSessions,
  onTokenRefreshed,
  getLimboState,
  setLimboState,
  getLimboUserId,
  subscribeLimbo,
  abortLimbo,
  createRosterEntryFromUser,
  type RosterEntry,
} from '../deviceSession'

describe('deviceSession — WebCrypto non-extractable key management', () => {
  beforeEach(async () => {
    closeDatabasesForTesting()
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('babin-device-key')
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
    })
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('babin-device-roster')
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
    })
  })

  afterEach(() => {
    closeDatabasesForTesting()
  })

  it('generates a non-extractable AES-GCM 256 key', async () => {
    const key = await getOrCreateDeviceKey()
    expect(key).toBeDefined()
    expect(key.type).toBe('secret')
    expect(key.algorithm.name).toBe('AES-GCM')
    expect(key.extractable).toBe(false)
  })

  it('prohibits exportKey (non-extractable boundary)', async () => {
    const key = await getOrCreateDeviceKey()
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
    await expect(crypto.subtle.exportKey('jwk', key)).rejects.toThrow()
  })

  it('persists and restores the key from IndexedDB across cache resets', async () => {
    const key1 = await getOrCreateDeviceKey()
    expect(key1).toBeDefined()
    const testSecret = 'supabase-refresh-token-xyz-12345'
    const ciphertext = await encryptRefreshToken(testSecret)

    // Reset in-memory cache to simulate app reload
    resetDeviceKeyCacheForTesting()

    const key2 = await getOrCreateDeviceKey()
    expect(key2.extractable).toBe(false)

    // Key2 must be able to decrypt ciphertext produced by key1
    const decrypted = await decryptRefreshToken(ciphertext)
    expect(decrypted).toBe(testSecret)
  })
})

describe('deviceSession — Refresh token AES-GCM encryption & decryption', () => {
  beforeEach(async () => {
    resetDeviceKeyCacheForTesting()
    resetRosterDbCacheForTesting()
  })

  it('encrypts plaintext to base64 and decrypts back to original', async () => {
    const token = 'v1.refreshtoken.jwt-secret-payload-Kathmandu-Ops-2026'
    const ciphertextB64 = await encryptRefreshToken(token)

    expect(ciphertextB64).toBeTypeOf('string')
    expect(ciphertextB64).not.toBe(token)
    expect(ciphertextB64.length).toBeGreaterThan(token.length)

    const recovered = await decryptRefreshToken(ciphertextB64)
    expect(recovered).toBe(token)
  })

  it('rejects tampered or corrupt ciphertext (authentication tag mismatch)', async () => {
    const token = 'valid-token'
    const ciphertextB64 = await encryptRefreshToken(token)

    // Tamper with one character in the base64 string
    const tampered = ciphertextB64.slice(0, -4) + 'AAAA'
    await expect(decryptRefreshToken(tampered)).rejects.toThrow()
  })

  it('rejects truncated ciphertext', async () => {
    const tooShort = btoa('tiny')
    await expect(decryptRefreshToken(tooShort)).rejects.toThrow(/Invalid ciphertext length/)
  })
})

describe('deviceSession — Roster storage & cap', () => {
  beforeEach(async () => {
    resetRosterDbCacheForTesting()
    await clearRoster()
  })

  it('upserts and retrieves roster entries sorted by lastSeen', async () => {
    const entry1: RosterEntry = {
      userId: 'u-1',
      name: 'Babin Dulal',
      initials: 'BD',
      avatarTone: 'var(--accent-blue)',
      hasPin: true,
      lastSeen: 1000,
    }
    const entry2: RosterEntry = {
      userId: 'u-2',
      name: 'Ramesh Adhikari',
      initials: 'RA',
      avatarTone: 'var(--accent-green)',
      hasPin: true,
      lastSeen: 2000,
    }

    await upsertRosterEntry(entry1)
    await upsertRosterEntry(entry2)

    const roster = await getRoster()
    expect(roster).toHaveLength(2)
    // Most recently seen comes first
    expect(roster[0]?.userId).toBe('u-2')
    expect(roster[1]?.userId).toBe('u-1')
  })

  it('updates lastSeen with touchRosterEntry', async () => {
    await upsertRosterEntry({
      userId: 'u-touch',
      name: 'Staff Member',
      initials: 'SM',
      avatarTone: 'var(--accent-teal)',
      hasPin: true,
      lastSeen: 50,
    })

    await touchRosterEntry('u-touch')
    const updated = await getRosterEntry('u-touch')
    expect(updated?.lastSeen).toBeGreaterThan(50)
  })

  it('updates lockout and PIN status', async () => {
    await upsertRosterEntry({
      userId: 'u-lock',
      name: 'Locked Staff',
      initials: 'LS',
      avatarTone: 'var(--accent-red)',
      hasPin: false,
      lastSeen: 100,
    })

    const lockoutTime = new Date(Date.now() + 15 * 60_000).toISOString()
    await updateRosterLockout('u-lock', lockoutTime)
    await updateRosterPinStatus('u-lock', true)

    const updated = await getRosterEntry('u-lock')
    expect(updated?.lockedUntil).toBe(lockoutTime)
    expect(updated?.hasPin).toBe(true)
  })

  it('removes an individual entry on "remove me from device"', async () => {
    await upsertRosterEntry({
      userId: 'u-leave',
      name: 'Leaving User',
      initials: 'LU',
      avatarTone: 'var(--accent-amber)',
      hasPin: true,
      lastSeen: 100,
    })

    expect(await getRosterEntry('u-leave')).toBeDefined()
    await removeRosterEntry('u-leave')
    expect(await getRosterEntry('u-leave')).toBeNull()
  })

  it('enforces the 15-staff roster cap', async () => {
    expect(await isRosterFull()).toBe(false)

    for (let i = 1; i <= 15; i++) {
      await upsertRosterEntry({
        userId: `u-${i}`,
        name: `Staff ${i}`,
        initials: `S${i}`,
        avatarTone: 'var(--accent-blue)',
        hasPin: true,
        lastSeen: Date.now() + i,
      })
    }

    expect(await isRosterFull()).toBe(true)
    const list = await getRoster()
    expect(list).toHaveLength(15)
  })
})

describe('deviceSession — Session store & token rotation', () => {
  beforeEach(async () => {
    resetRosterDbCacheForTesting()
    await clearAllSessions()
  })

  it('stores and decrypts a user session token', async () => {
    const rawToken = 'supabase.refresh.token.alpha'
    await storeSession('u-session-1', rawToken)

    expect(await hasSession('u-session-1')).toBe(true)
    const retrieved = await getAndDecryptSession('u-session-1')
    expect(retrieved).toBe(rawToken)

    await removeSession('u-session-1')
    expect(await hasSession('u-session-1')).toBe(false)
  })

  it('re-encrypts and updates token on rotation (TOKEN_REFRESHED)', async () => {
    await storeSession('u-rotate', 'initial-token-1')
    expect(await getAndDecryptSession('u-rotate')).toBe('initial-token-1')

    await onTokenRefreshed('u-rotate', 'rotated-token-2')
    expect(await getAndDecryptSession('u-rotate')).toBe('rotated-token-2')
  })

  it('clears all sessions on admin "forget this device"', async () => {
    await storeSession('u-1', 'tok-1')
    await storeSession('u-2', 'tok-2')

    expect(await hasSession('u-1')).toBe(true)
    expect(await hasSession('u-2')).toBe(true)

    await clearAllSessions()

    expect(await hasSession('u-1')).toBe(false)
    expect(await hasSession('u-2')).toBe(false)
  })
})

describe('deviceSession — LIMBO state machine & abort', () => {
  beforeEach(() => {
    setLimboState('idle', null)
  })

  it('tracks limbo state and notifies subscribers', () => {
    const seen: string[] = []
    const unsubscribe = subscribeLimbo((st) => seen.push(st))

    setLimboState('restoring', 'u-target')
    expect(getLimboState()).toBe('restoring')
    expect(getLimboUserId()).toBe('u-target')

    setLimboState('verifying', 'u-target')
    expect(getLimboState()).toBe('verifying')

    setLimboState('unlocked', null)
    expect(getLimboState()).toBe('unlocked')

    unsubscribe()
    setLimboState('idle', null)
    expect(seen).toEqual(['restoring', 'verifying', 'unlocked'])
  })

  it('aborts limbo using local signOut without revoking server token', async () => {
    const mockSignOut = vi.fn(async () => ({ error: null }))
    const mockSupabase = { auth: { signOut: mockSignOut } }

    setLimboState('restoring', 'u-target')
    await abortLimbo(mockSupabase)

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(getLimboState()).toBe('aborted')
    expect(getLimboUserId()).toBeNull()
  })
})

describe('deviceSession — createRosterEntryFromUser helper', () => {
  it('creates entry with correct initials and name fallback', async () => {
    const entry = await createRosterEntryFromUser({
      id: 'u-babin',
      name: 'Babin Dulal',
      email: 'babin@example.com',
    })

    expect(entry.userId).toBe('u-babin')
    expect(entry.name).toBe('Babin Dulal')
    expect(entry.initials).toBe('BD')
    expect(entry.avatarTone).toBeDefined()
  })
})
