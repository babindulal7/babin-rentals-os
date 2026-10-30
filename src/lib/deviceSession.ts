/**
 * Device Session Manager for T1-15 "Switch user with name + PIN".
 *
 * Implements the roster-as-lock pattern with non-extractable device key:
 * - Per-device AES-GCM key (WebCrypto non-extractable) for encrypting refresh tokens
 * - Stored directly in IndexedDB via structured cloning (never exportKey'd)
 * - Roster stored in IndexedDB (names, user IDs, avatars) — the lock screen
 * - LIMBO state: restore B's token → verify PIN → unlock / abort
 * - Refresh tokens re-encrypted on every TOKEN_REFRESHED (single-use rotation)
 * - PINs NEVER on device; verified server-side via verify_staff_pin (0066)
 * - PINs: 4 digits (Babin 28 Oct 2026; migration 0186)
 * - Roster capped at 15 staff members per device
 *
 * Threat model: protects at-rest data (file copy, backup, casual snooping).
 * Non-extractable key prevents key material exfiltration.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface RosterEntry {
  userId: string
  name: string
  initials: string
  avatarTone: string // CSS color token / accent class
  hasPin: boolean // whether they've enrolled a PIN
  lastSeen: number // timestamp
  lockedUntil?: string | null | undefined // lockout timestamp from verify_staff_pin
}

export interface DeviceSession {
  userId: string
  ciphertext: string // base64(iv + ciphertext + authTag)
  updatedAt: number // rotation timestamp
}

export type LimboState = 'idle' | 'restoring' | 'verifying' | 'unlocked' | 'aborted'

// ─── Constants ────────────────────────────────────────────────────────────

const ROSTER_DB_NAME = 'babin-device-roster'
const ROSTER_STORE = 'roster'
const SESSION_STORE = 'sessions'
const KEY_DB_NAME = 'babin-device-key'
const DEVICE_KEY_NAME = 'babin-device-key'
const DB_VERSION = 1

const IV_LENGTH_BYTES = 12 // 96 bits for AES-GCM
const KEY_ALGORITHM: AesKeyGenParams = { name: 'AES-GCM', length: 256 }
const MAX_ROSTER_SIZE = 15

function getIndexedDB(): IDBFactory | null {
  if (typeof indexedDB !== 'undefined') return indexedDB
  if (typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined') return window.indexedDB
  return null
}

// ─── Device Key Management ────────────────────────────────────────────────

let deviceKeyPromise: Promise<CryptoKey> | null = null
let keyDbInstance: IDBDatabase | null = null

/**
 * Open the dedicated database for the non-extractable device key.
 */
function openKeyDB(): Promise<IDBDatabase | null> {
  const idb = getIndexedDB()
  if (!idb) return Promise.resolve(null)
  if (keyDbInstance) return Promise.resolve(keyDbInstance)

  return new Promise((resolve) => {
    try {
      const request = idb.open(KEY_DB_NAME, 1)
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(DEVICE_KEY_NAME)) {
          db.createObjectStore(DEVICE_KEY_NAME, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => {
        keyDbInstance = request.result
        keyDbInstance.onversionchange = () => {
          try {
            keyDbInstance?.close()
          } catch {
            // ignore
          }
          keyDbInstance = null
        }
        resolve(keyDbInstance)
      }
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Get or create the non-extractable device AES-GCM key.
 * Key is generated once per device/browser profile, stored directly in
 * IndexedDB via structured cloning with extractable: false.
 * exportKey is NEVER called.
 */
export async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  if (deviceKeyPromise) return deviceKeyPromise

  deviceKeyPromise = (async () => {
    const db = await openKeyDB()
    if (!db) {
      // In-memory non-extractable fallback when IndexedDB is not available
      return crypto.subtle.generateKey(
        KEY_ALGORITHM,
        false,
        ['encrypt', 'decrypt'],
      )
    }

    const tx = db.transaction(DEVICE_KEY_NAME, 'readonly')
    const store = tx.objectStore(DEVICE_KEY_NAME)
    const request = store.get(DEVICE_KEY_NAME)

    const record = await new Promise<{ id: string; key: CryptoKey } | null>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => reject(request.error)
    })

    if (record?.key) {
      return record.key
    }

    // Generate new non-extractable key
    const key = await crypto.subtle.generateKey(
      KEY_ALGORITHM,
      false, // non-extractable
      ['encrypt', 'decrypt'],
    )

    const tx2 = db.transaction(DEVICE_KEY_NAME, 'readwrite')
    const store2 = tx2.objectStore(DEVICE_KEY_NAME)
    store2.put({ id: DEVICE_KEY_NAME, key })
    await new Promise<void>((resolve, reject) => {
      tx2.oncomplete = () => resolve()
      tx2.onerror = () => reject(tx2.error)
    })

    return key
  })()

  return deviceKeyPromise
}

/** Reset in-memory cached promise (for testing isolation). */
export function resetDeviceKeyCacheForTesting(): void {
  deviceKeyPromise = null
}

// ─── Helpers: Uint8Array <-> Base64 ───────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ─── Encryption / Decryption ──────────────────────────────────────────────

/**
 * Encrypt a refresh token with the device key.
 * Returns base64(iv + ciphertext + authTag).
 */
export async function encryptRefreshToken(plaintext: string): Promise<string> {
  const key = await getOrCreateDeviceKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  )

  const combined = new Uint8Array(IV_LENGTH_BYTES + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), IV_LENGTH_BYTES)

  return bytesToBase64(combined)
}

/**
 * Decrypt a refresh token ciphertext with the device key.
 * Throws if auth tag does not verify or ciphertext is corrupt.
 */
export async function decryptRefreshToken(ciphertextB64: string): Promise<string> {
  const combined = base64ToBytes(ciphertextB64)
  if (combined.byteLength < IV_LENGTH_BYTES + 16) {
    throw new Error('Invalid ciphertext length')
  }

  const iv = new Uint8Array(combined.slice(0, IV_LENGTH_BYTES))
  const ciphertext = new Uint8Array(combined.slice(IV_LENGTH_BYTES))

  const key = await getOrCreateDeviceKey()
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )

  return new TextDecoder().decode(decrypted)
}

// ─── Roster & Sessions DB (IndexedDB) ─────────────────────────────────────

let rosterDbPromise: Promise<IDBDatabase | null> | null = null
let rosterDbInstance: IDBDatabase | null = null

function openRosterDB(): Promise<IDBDatabase | null> {
  const idb = getIndexedDB()
  if (!idb) return Promise.resolve(null)
  if (rosterDbInstance) return Promise.resolve(rosterDbInstance)
  if (rosterDbPromise) return rosterDbPromise

  rosterDbPromise = new Promise((resolve) => {
    try {
      const request = idb.open(ROSTER_DB_NAME, DB_VERSION)
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(ROSTER_STORE)) {
          const rosterStore = db.createObjectStore(ROSTER_STORE, { keyPath: 'userId' })
          rosterStore.createIndex('lastSeen', 'lastSeen')
        }
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          db.createObjectStore(SESSION_STORE, { keyPath: 'userId' })
        }
      }
      request.onsuccess = () => {
        rosterDbInstance = request.result
        rosterDbInstance.onversionchange = () => {
          try {
            rosterDbInstance?.close()
          } catch {
            // ignore
          }
          rosterDbInstance = null
          rosterDbPromise = null
        }
        resolve(rosterDbInstance)
      }
      request.onerror = () => {
        rosterDbPromise = null
        resolve(null)
      }
    } catch {
      rosterDbPromise = null
      resolve(null)
    }
  })
  return rosterDbPromise
}

export function resetRosterDbCacheForTesting(): void {
  rosterDbPromise = null
}

export function closeDatabasesForTesting(): void {
  deviceKeyPromise = null
  if (keyDbInstance) {
    try {
      keyDbInstance.close()
    } catch {
      // ignore
    }
    keyDbInstance = null
  }
  if (rosterDbInstance) {
    try {
      rosterDbInstance.close()
    } catch {
      // ignore
    }
    rosterDbInstance = null
  }
  rosterDbPromise = null
}

// ─── Roster Operations ────────────────────────────────────────────────────

/** Get the full roster for the lock screen, ordered by most recently seen. */
export async function getRoster(): Promise<RosterEntry[]> {
  const db = await openRosterDB()
  if (!db) return []
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ROSTER_STORE, 'readonly')
    const store = tx.objectStore(ROSTER_STORE)
    const request = store.getAll()
    request.onsuccess = () => {
      const entries = (request.result as RosterEntry[]) ?? []
      entries.sort((a, b) => b.lastSeen - a.lastSeen)
      resolve(entries)
    }
    request.onerror = () => reject(request.error)
  })
}

/** Add or update a roster entry. */
export async function upsertRosterEntry(entry: RosterEntry): Promise<void> {
  const db = await openRosterDB()
  if (!db) return
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ROSTER_STORE, 'readwrite')
    const store = tx.objectStore(ROSTER_STORE)
    store.put(entry)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Get a single roster entry by userId. */
export async function getRosterEntry(userId: string): Promise<RosterEntry | null> {
  const db = await openRosterDB()
  if (!db) return null
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ROSTER_STORE, 'readonly')
    const store = tx.objectStore(ROSTER_STORE)
    const request = store.get(userId)
    request.onsuccess = () => resolve((request.result as RosterEntry) ?? null)
    request.onerror = () => reject(request.error)
  })
}

/** Update lastSeen timestamp for an entry. */
export async function touchRosterEntry(userId: string): Promise<void> {
  const entry = await getRosterEntry(userId)
  if (entry) {
    entry.lastSeen = Date.now()
    await upsertRosterEntry(entry)
  }
}

/** Update lockout timestamp for an entry. */
export async function updateRosterLockout(userId: string, lockedUntil: string | null): Promise<void> {
  const entry = await getRosterEntry(userId)
  if (entry) {
    entry.lockedUntil = lockedUntil
    await upsertRosterEntry(entry)
  }
}

/** Remove a single roster entry ("Remove me from this device"). */
export async function removeRosterEntry(userId: string): Promise<void> {
  const db = await openRosterDB()
  if (!db) return
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ROSTER_STORE, 'readwrite')
    const store = tx.objectStore(ROSTER_STORE)
    store.delete(userId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Clear all roster entries (Owner/Admin "Forget this device"). */
export async function clearRoster(): Promise<void> {
  const db = await openRosterDB()
  if (!db) return
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ROSTER_STORE, 'readwrite')
    const store = tx.objectStore(ROSTER_STORE)
    store.clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Check if roster is at capacity (15 staff). */
export async function isRosterFull(): Promise<boolean> {
  const roster = await getRoster()
  return roster.length >= MAX_ROSTER_SIZE
}

// ─── Session (Encrypted Refresh Token) Operations ─────────────────────────

/** Store an encrypted refresh token for a user. */
export async function storeSession(userId: string, refreshToken: string): Promise<void> {
  const ciphertext = await encryptRefreshToken(refreshToken)
  const db = await openRosterDB()
  if (!db) return
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSION_STORE, 'readwrite')
    const store = tx.objectStore(SESSION_STORE)
    const session: DeviceSession = {
      userId,
      ciphertext,
      updatedAt: Date.now(),
    }
    store.put(session)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Retrieve and decrypt a stored refresh token. Returns null if missing or decryption fails. */
export async function getAndDecryptSession(userId: string): Promise<string | null> {
  const db = await openRosterDB()
  if (!db) return null
  const session = await new Promise<DeviceSession | null>((resolve, reject) => {
    const tx = db.transaction(SESSION_STORE, 'readonly')
    const store = tx.objectStore(SESSION_STORE)
    const request = store.get(userId)
    request.onsuccess = () => resolve((request.result as DeviceSession) ?? null)
    request.onerror = () => reject(request.error)
  })

  if (!session?.ciphertext) return null

  try {
    return await decryptRefreshToken(session.ciphertext)
  } catch {
    // Corrupt or encrypted under a different device key
    return null
  }
}

/** Remove a stored session for a user. */
export async function removeSession(userId: string): Promise<void> {
  const db = await openRosterDB()
  if (!db) return
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSION_STORE, 'readwrite')
    const store = tx.objectStore(SESSION_STORE)
    store.delete(userId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Clear all stored sessions (admin "Forget this device"). */
export async function clearAllSessions(): Promise<void> {
  const db = await openRosterDB()
  if (!db) return
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSION_STORE, 'readwrite')
    const store = tx.objectStore(SESSION_STORE)
    store.clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Re-encrypt new token on Supabase TOKEN_REFRESHED event. */
export async function onTokenRefreshed(userId: string, newRefreshToken: string): Promise<void> {
  await storeSession(userId, newRefreshToken)
}

/** Check if user has a stored session. */
export async function hasSession(userId: string): Promise<boolean> {
  const db = await openRosterDB()
  if (!db) return false
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSION_STORE, 'readonly')
    const store = tx.objectStore(SESSION_STORE)
    const request = store.count(userId)
    request.onsuccess = () => resolve(request.result > 0)
    request.onerror = () => reject(request.error)
  })
}

// ─── LIMBO State (Restoring & Verifying Session Before Unlock) ──────────────

let limboState: LimboState = 'idle'
let limboUserId: string | null = null
const limboListeners = new Set<(state: LimboState) => void>()

export function getLimboState(): LimboState {
  return limboState
}

export function getLimboUserId(): string | null {
  return limboUserId
}

export function subscribeLimbo(listener: (state: LimboState) => void): () => void {
  limboListeners.add(listener)
  return () => limboListeners.delete(listener)
}

export function setLimboState(state: LimboState, userId?: string | null): void {
  limboState = state
  if (userId !== undefined) limboUserId = userId
  limboListeners.forEach((l) => l(state))
}

/**
 * Abort a switch attempt (wrong PIN, cancelled, or error).
 * Calls supabase.auth.signOut({ scope: 'local' }) so target's refresh token
 * is NOT invalidated on the server (preserving their roster session).
 */
export async function abortLimbo(supabaseClient: { auth: { signOut: (options?: { scope?: 'global' | 'local' | 'others' }) => Promise<{ error: unknown }> } }): Promise<void> {
  try {
    await supabaseClient.auth.signOut({ scope: 'local' })
  } catch {
    // ignore local signout error
  } finally {
    setLimboState('aborted', null)
    setTimeout(() => {
      if (limboState === 'aborted') setLimboState('idle', null)
    }, 100)
  }
}

// ─── Roster Creation Helpers ──────────────────────────────────────────────

const AVATAR_TONES = [
  'var(--accent-red)',
  'var(--accent-amber)',
  'var(--accent-green)',
  'var(--accent-teal)',
  'var(--accent-blue)',
  'var(--accent-indigo)',
  'var(--accent-purple)',
  'var(--accent-pink)',
]

function hashString(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0
  }
  return h
}

/**
 * Create or update a roster entry for a signed in user.
 */
export async function createRosterEntryFromUser(user: {
  id: string
  email?: string | undefined
  name?: string | undefined
  user_metadata?: { full_name?: string | undefined; name?: string | undefined } | undefined
}): Promise<RosterEntry> {
  const existing = await getRosterEntry(user.id)
  const name =
    user.name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (user.email ? user.email.split('@')[0] : 'Staff') ||
    'Staff'

  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'ST'

  const toneIndex = Math.abs(hashString(user.id)) % AVATAR_TONES.length
  const avatarTone = AVATAR_TONES[toneIndex] ?? 'var(--accent-blue)'

  const entry: RosterEntry = {
    userId: user.id,
    name,
    initials,
    avatarTone,
    hasPin: existing?.hasPin ?? false,
    lastSeen: Date.now(),
    lockedUntil: existing?.lockedUntil ?? null,
  }

  await upsertRosterEntry(entry)
  return entry
}

/**
 * Update hasPin flag on a user's roster entry.
 */
export async function updateRosterPinStatus(userId: string, hasPin: boolean): Promise<void> {
  const entry = await getRosterEntry(userId)
  if (entry) {
    entry.hasPin = hasPin
    await upsertRosterEntry(entry)
  }
}
