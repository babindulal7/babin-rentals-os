import Dexie, { type Table } from 'dexie'
import { supabase } from './supabase'
import { getOfflineSession, ownsOfflineWork, type OfflineSession, type OfflineIdentity } from './offlineIdentity'
import { captureError } from './monitoring'

export interface QueuedMutation {
  /** Absent on legacy work: preserved for review, never attributed to a new user. */
  actorId?: string
  environment?: string
  id?: number
  clientUuid: string
  table: string
  action: 'insert' | 'update' | 'delete'
  payload: Record<string, unknown>
  timestamp: string
  status: 'pending' | 'syncing' | 'failed'
  error?: string
  /** Bumped on every failed replay attempt. Past MAX_RETRIES, status is 'failed' for good (dead-letter) instead of retried forever. */
  retryCount?: number
}

/**
 * A queued update the server changed after it was queued — held for a person
 * to decide, never replayed over the newer row.
 *
 * PLAN.md Phase 9: "Conflict UI naming both sides — never silent". Ported 8 Oct
 * 2026 from main's uncommitted Phase 9 work (snapshot 1313bbc). `remoteState`
 * holds only the fields the queued write touches, plus `updated_at` — see
 * `replayMutation`.
 */
export interface QueuedConflict {
  id?: number
  mutationId: number
  clientUuid: string
  table: string
  recordId: string
  localChanges: Record<string, unknown>
  remoteState: Record<string, unknown>
  detectedAt: string
  status: 'unresolved' | 'resolved'
  resolution?: 'keep_server' | 'force_local'
  resolvedAt?: string
  resolvedBy?: string
}

/** After this many failed replay attempts, a mutation stops auto-retrying and needs manual review. */
const MAX_RETRIES = 5

export class OfflineQueueDB extends Dexie {
  mutations!: Table<QueuedMutation, number>
  conflicts!: Table<QueuedConflict, number>
  /** Legacy duplicates are retained verbatim for review; never auto-replayed. */
  heldMutations!: Table<QueuedMutation, number>

  constructor() {
    super('BabinOfflineQueue')
    this.version(1).stores({
      mutations: '++id, clientUuid, table, status, timestamp'
    })
    /*
     * v2 — preserve index-conflicting legacy copies in a held-work store. Law 8's dedupe index goes on in v3
     * below; IndexedDB aborts the entire versionchange transaction if a unique index
     * is built over rows that already violate it, and an aborted upgrade leaves this
     * database permanently unopenable (every later read and write throws, so the
     * queue silently stops accepting offline writes). Rows queued before the index
     * existed are therefore separated from the replay store HERE, in their own version step that runs
     * to completion first, preserving every duplicate in heldMutations. `toArray()` yields primary-key order, so the row kept for
     * each key is the oldest — the one whose position in `drainQueue`'s
     * timestamp-ordered replay is already established.
     */
    this.version(2).stores({ heldMutations: '++id, timestamp' }).upgrade(async (tx) => {
      const seen = new Set<string>()
      const held: QueuedMutation[] = []
      const all = (await tx.table('mutations').toArray()) as QueuedMutation[]
      for (const mutation of all) {
        const key = dedupeKey(mutation.table, mutation.action, mutation.clientUuid)
        if (seen.has(key)) {
          if (mutation.id !== undefined) held.push(mutation)
          continue
        }
        seen.add(key)
      }
      if (held.length > 0) {
        // Preserve the COMPLETE originals before removing the index-conflicting
        // copies from the replay store. The version transaction is atomic.
        await tx.table('heldMutations').bulkPut(held)
        await tx.table('mutations').bulkDelete(held.map(work => work.id!))
        console.warn(`[OfflineQueue] Preserved ${held.length} duplicate legacy mutation(s) for review.`)
      }
    })
    /*
     * v3 — Law 8's "duplicates rejected" on the offline path. The unique unit is
     * `[table+action+clientUuid]`, NOT `clientUuid` alone: the DB-side constraint
     * this mirrors is per-table (`<table>_client_uuid_key`, e.g. 0002_bookings.sql:31),
     * so one key legitimately appears once per table, and an insert plus a follow-up
     * update under the same action key are two distinct operations that must both
     * replay. Caveat the callers own: one user action writing several ROWS of the same
     * table must derive a distinct key per row, or the second row is treated as a
     * replay of the first. Inserts get that for free — `idempotentInsert` enqueues
     * under each row's own `client_uuid`.
     */
    this.version(3).stores({
      mutations: '++id, clientUuid, table, status, timestamp, &[table+action+clientUuid]'
    })
    /* v4 — the conflict store. A new table only; `mutations` is unchanged. */
    this.version(4).stores({
      conflicts: '++id, mutationId, clientUuid, table, recordId, status, detectedAt'
    })
    // Existing v4 devices gain the preservation store without changing any work.
    this.version(5).stores({ heldMutations: '++id, timestamp' })
  }
}

/** The tuple the queue treats as "the same write" — see the v3 comment above. */
function dedupeKey(table: string, action: QueuedMutation['action'], clientUuid: string): string {
  return `${table}\u0000${action}\u0000${clientUuid}`
}

export const db = new OfflineQueueDB()

/**
 * Enqueues a mutation to be synced later.
 *
 * Law 8's second half — "duplicates rejected" — on the offline path: a write already
 * queued under the same `[table+action+clientUuid]` is skipped, not added a second
 * time, so the SAME user action replayed (double-tap, a retried save, a second
 * `catch` on the same click) leaves exactly one entry for `drainQueue` to replay.
 * The pre-check and the unique index are deliberately both present: the check gives
 * a named warning instead of a raw Dexie `ConstraintError`, the index guarantees the
 * invariant even if a future caller writes to `db.mutations` directly.
 *
 * Returns whether a new entry was actually created.
 */
export async function enqueueMutation(
  table: string,
  action: 'insert' | 'update' | 'delete',
  payload: Record<string, unknown>,
  clientUuid: string,
  submittingIdentity?: OfflineIdentity,
): Promise<boolean> {
  if (!canUseOfflineQueue()) {
    console.warn(`[OfflineQueue] Storage unavailable, cannot queue mutation for ${table}`)
    return false
  }
  const identity = submittingIdentity ?? await getOfflineSession()
  if (!identity) throw new OfflineQueueWriteError('OFFLINE_IDENTITY_REQUIRED', 'Sign in before saving offline work. Nothing was queued.')
  return await db.transaction('rw', db.mutations, async () => {
    const existing = await db.mutations
      .where('[table+action+clientUuid]')
      .equals([table, action, clientUuid])
      .first()
    if (existing) {
      console.warn(
        `[OfflineQueue] Duplicate rejected (Law 8): '${action}' on '${table}' is already queued under client_uuid ${clientUuid}.`
      )
      return false
    }
    await db.mutations.add({
      actorId: identity.actorId,
      environment: identity.environment,
      clientUuid,
      table,
      action,
      payload,
      timestamp: new Date().toISOString(),
      status: 'pending'
    })
    return true
  })
}

/**
 * Strict outbox API for mutations that MUST NOT report success unless the
 * local write is durable. `enqueueMutation` deliberately retains its boolean
 * contract for noncritical telemetry callers, but dataAccess uses this API.
 *
 * A duplicate is safe to acknowledge only when a matching, nonfailed row
 * actually exists in IndexedDB. A rejected duplicate with different data must
 * not be misrepresented as a saved edit.
 */
export class OfflineQueueWriteError extends Error {
  readonly code: 'OFFLINE_STORAGE_UNAVAILABLE' | 'OFFLINE_MUTATION_CONFLICT' | 'OFFLINE_IDENTITY_REQUIRED'

  constructor(code: OfflineQueueWriteError['code'], message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'OfflineQueueWriteError'
    this.code = code
  }
}

function serializedPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
    }
    return value
  })
}

export async function ensureMutationQueued(
  table: string,
  action: QueuedMutation['action'],
  payload: Record<string, unknown>,
  clientUuid: string,
  submittingIdentity?: OfflineIdentity,
): Promise<'added' | 'already_queued'> {
  const unavailable = () => new OfflineQueueWriteError(
    'OFFLINE_STORAGE_UNAVAILABLE',
    `[OfflineQueue] OFFLINE_STORAGE_UNAVAILABLE: ${action} on ${table} was NOT saved. ` +
      'Device storage is unavailable or failed. Keep the form open and retry when storage or connectivity is restored.',
  )

  if (!canUseOfflineQueue()) throw unavailable()

  try {
    // Capture once, including duplicate confirmation. dataAccess supplies the
    // identity from before its online request, not from the later failure.
    const identity = submittingIdentity ?? await getOfflineSession()
    if (!identity) throw new OfflineQueueWriteError('OFFLINE_IDENTITY_REQUIRED', 'Sign in before saving offline work. Nothing was queued.')
    const inserted = await enqueueMutation(table, action, payload, clientUuid, identity)
    if (inserted) return 'added'

    // False also means "duplicate". Verify that the earlier write was actually
    // persisted and is still pending/syncing, with the SAME content.
    const existing = await db.mutations
      .where('[table+action+clientUuid]')
      .equals([table, action, clientUuid])
      .first()
    if (!existing) throw unavailable()
    if (!ownsOfflineWork(existing, identity)) {
      throw new OfflineQueueWriteError('OFFLINE_MUTATION_CONFLICT', 'This action key belongs to another or an unverified offline identity. Existing work was preserved.')
    }
    if (existing.status === 'failed') {
      throw new OfflineQueueWriteError(
        'OFFLINE_MUTATION_CONFLICT',
        `[OfflineQueue] OFFLINE_MUTATION_CONFLICT: a previously queued ${action} on ${table} failed to sync. ` +
          'The new save was NOT accepted. Review the failed mutation before retrying.',
      )
    }
    if (serializedPayload(existing.payload) !== serializedPayload(payload)) {
      throw new OfflineQueueWriteError(
        'OFFLINE_MUTATION_CONFLICT',
        `[OfflineQueue] OFFLINE_MUTATION_CONFLICT: ${action} on ${table} reused an action key with different data. ` +
          'This edit was NOT queued. Review the existing pending change before retrying.',
      )
    }
    return 'already_queued'
  } catch (error) {
    if (error instanceof OfflineQueueWriteError) throw error
    // IndexedDB open/transaction/quota failures can throw even if the global
    // exists. The caller must see an error, never {queued:true, error:null}.
    throw new OfflineQueueWriteError(
      'OFFLINE_STORAGE_UNAVAILABLE',
      `[OfflineQueue] OFFLINE_STORAGE_UNAVAILABLE: ${action} on ${table} was NOT confirmed as queued. ` +
        'Keep the form open and retry after checking device storage and connectivity.',
      error,
    )
  }
}

/**
 * Gets all pending mutations.
 */
export async function getPendingMutations(): Promise<QueuedMutation[]> {
  if (!canUseOfflineQueue()) return []
  const identity = await getOfflineSession()
  if (!identity) return []
  return await db.mutations.where('status').equals('pending').filter(m => ownsOfflineWork(m, identity)).sortBy('timestamp')
}

/** Counts only: foreign/legacy payloads are never exposed to another operator. */
export async function getOfflineQueueSummary(): Promise<{ total: number; held: number; failed: number }> {
  if (!canUseOfflineQueue()) return { total: 0, held: 0, failed: 0 }
  const identity = await getOfflineSession()
  let total = 0, held = 0, failed = 0
  await db.mutations.each(work => {
    total++
    if (!identity || !ownsOfflineWork(work, identity)) held++
    else if (work.status === 'failed') failed++
  })
  const preserved = await db.heldMutations.count()
  return { total: total + preserved, held: held + preserved, failed }
}

/**
 * Marks a mutation as syncing.
 */
export async function markMutationSyncing(id: number) {
  if (!canUseOfflineQueue()) return
  await db.mutations.update(id, { status: 'syncing' })
}

/**
 * Marks a mutation as failed.
 */
export async function markMutationFailed(id: number, error: string) {
  if (!canUseOfflineQueue()) return
  await db.mutations.update(id, { status: 'failed', error })
}

/**
 * Removes a mutation after successful sync.
 */
export async function resolveMutation(id: number) {
  if (!canUseOfflineQueue()) return
  await db.mutations.delete(id)
}

/**
 * Gets mutations that exhausted MAX_RETRIES — the dead-letter list a human needs to review.
 * These are NOT retried by drainQueue.
 */
export async function getDeadLetterMutations(): Promise<QueuedMutation[]> {
  if (!canUseOfflineQueue()) return []
  const identity = await getOfflineSession()
  if (!identity) return []
  return await db.mutations
    .filter(m => ownsOfflineWork(m, identity))
    .and(m => m.status === 'failed')
    .filter((m) => (m.retryCount ?? 0) >= MAX_RETRIES)
    .sortBy('timestamp')
}

/** Conflicts still waiting for a person, oldest first. */
export async function getUnresolvedConflicts(): Promise<QueuedConflict[]> {
  if (!canUseOfflineQueue()) return []
  const identity = await getOfflineSession()
  if (!identity) return []
  const conflicts = await db.conflicts.where('status').equals('unresolved').sortBy('detectedAt')
  const owned = []
  for (const conflict of conflicts) {
    const mutation = await db.mutations.get(conflict.mutationId)
    if (mutation && ownsOfflineWork(mutation, identity)) owned.push(conflict)
  }
  return owned
}

/** How many conflicts are waiting, for the banner. */
export async function countUnresolvedConflicts(): Promise<number> {
  if (!canUseOfflineQueue()) return 0
  return (await getUnresolvedConflicts()).length
}

/**
 * Settles a conflict the way a person chose.
 *
 * - `keep_server` drops the queued write. The conflict row keeps
 *   `localChanges`, so what the device wanted is still on record.
 * - `force_local` writes the queued fields over the server row, then drops
 *   the queued write.
 */
export async function resolveConflict(
  conflictId: number,
  resolution: 'keep_server' | 'force_local',
  _resolvedBy?: string,
): Promise<void> {
  if (!canUseOfflineQueue()) return
  await withReplayLock(() => resolveOwnedConflict(conflictId, resolution), true)
}

async function resolveOwnedConflict(conflictId: number, resolution: 'keep_server' | 'force_local'): Promise<void> {
  const conflict = await db.conflicts.get(conflictId)
  if (!conflict) return
  const identity = await getOfflineSession()
  const mutation = await db.mutations.get(conflict.mutationId)
  if (!identity || !mutation || !ownsOfflineWork(mutation, identity)) {
    throw new Error('Offline conflict belongs to another or an unverified identity. Work was preserved.')
  }

  if (resolution === 'force_local') {
    const revision = conflict.remoteState['updated_at']
    if (typeof revision !== 'string' || !Number.isFinite(Date.parse(revision))) {
      throw new Error('Server did not confirm the conflict version; pending work was preserved.')
    }
    const { data, error } = await identity.client.from(conflict.table).update(conflict.localChanges)
      .eq('id', conflict.recordId).eq('updated_at', revision).select('id').maybeSingle()
    if (error) throw error
    if (!data || data.id !== conflict.recordId) throw new Error('Server did not confirm the offline update; pending work was preserved.')
  }
  await resolveMutation(conflict.mutationId)

  await db.conflicts.update(conflictId, {
    status: 'resolved',
    resolution,
    resolvedAt: new Date().toISOString(),
    resolvedBy: identity.actorId,
  })
}

/**
 * E-P1-2 / Gemma Audit finding: Recover any mutations left in 'syncing' state
 * (e.g. if the tab was closed or the app crashed mid-drain). Resets them back
 * to 'pending' so they are safely replayed.
 */
export async function resetStaleSyncingMutations(): Promise<number> {
  const stale = await db.mutations.where('status').equals('syncing').toArray()
  if (stale.length > 0) {
    const ids = stale.map((m) => m.id).filter((id): id is number => id !== undefined)
    await db.mutations.where('id').anyOf(ids).modify({ status: 'pending' })
    console.info(`[OfflineQueue] Recovered ${stale.length} stranded in-flight mutation(s) back to 'pending'.`)
  }
  return stale.length
}

let draining = false

/** One origin-wide owner, including conflict resolution. A crashed tab releases
 * its Web Lock automatically; only the next owner may recover stranded writes.
 * Without coordination, preserve work and surface an error through syncEngine.
 */
async function withReplayLock(run: () => Promise<void>, requireAvailable = false): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) {
    throw new Error('Offline replay coordination is unavailable in this browser. Saved work was preserved.')
  }
  await navigator.locks.request('babin-offline-replay', { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (lock) await run()
    else if (requireAvailable) throw new Error('Another tab is syncing offline work. Retry after it finishes.')
  })
}

/**
 * Replays every pending mutation through the same idempotentInsert/safeUpdate path that queued
 * it, reusing its already-stored client_uuid (never a fresh one) so a re-post is idempotent —
 * dataAccess.ts's own 23505-on-client_uuid duplicate handling covers a mutation that actually
 * reached the server just before the connection dropped.
 *
 * Without this, Law 8's "duplicates rejected" promise had nothing to replay: a write queued
 * offline sat in IndexedDB forever, with the UI having already shown an optimistic success.
 */
export async function drainQueue(): Promise<void> {
  if (draining) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  draining = true
  try {
    await withReplayLock(async () => {
      await resetStaleSyncingMutations()
      const pending = await getPendingMutations()
      for (const mutation of pending) {
        const identity = await getOfflineSession()
        if (!identity || !ownsOfflineWork(mutation, identity)) continue
        if (mutation.id === undefined) continue
        await replayMutation(mutation, identity)
      }
    })
  } finally {
    draining = false
  }
}

/**
 * Conflict check before a queued update replays (PLAN.md Phase 9, "never silent").
 *
 * Reads the server row for the fields this write sets plus `updated_at`, never
 * `select('*')`. Since 0062 a role may not SELECT every column of the booking
 * tables, so `*` would be refused and the check skipped without a word. It would
 * also copy columns this device has no reason to hold (PLAN §4.43(b)).
 *
 * A conflict is: the server row changed after this write was queued, AND it
 * disagrees on a field this write sets. The write's own `updated_at` is not one
 * of those fields — floor writes carry it, and it always differs. `updated_at`
 * is server-written since 0097, but `timestamp` is this device's clock, so a
 * device running fast can miss a conflict; that errs toward replaying, which
 * is what happened before this check existed.
 *
 * Returns true when the write is held. An unreadable target/version refuses
 * replay; the caller preserves the pending edit for retry/review.
 */
export async function holdIfConflicting(
  id: number,
  mutation: QueuedMutation,
  rowId: string,
  changes: Record<string, unknown>,
  client = supabase,
): Promise<boolean> {
  return (await checkReplayConflict(id, mutation, rowId, changes, client)).held
}

async function checkReplayConflict(
  id: number,
  mutation: QueuedMutation,
  rowId: string,
  changes: Record<string, unknown>,
  client: typeof supabase,
): Promise<{ held: boolean; revision: string }> {
  const fields = Object.keys(changes).filter((f) => f !== 'updated_at')
  if (fields.length === 0) throw new Error('No offline changes were confirmed; pending work was preserved.')
  const { data, error } = await client
    .from(mutation.table)
    .select(['updated_at', ...fields].join(','))
    .eq('id', rowId)
    .maybeSingle()
  if (error) throw new Error('Could not verify the offline conflict state; pending work was preserved.')
  if (!data) throw new Error('Server did not confirm the offline target; pending work was preserved.')
  // A dynamic column list types `data` as a parser error; the row is a plain record.
  const remote = data as unknown as Record<string, unknown>
  const revision = remote['updated_at']
  if (typeof revision !== 'string' || !Number.isFinite(Date.parse(revision)) || fields.some(field => !(field in remote))) {
    throw new Error('Server did not confirm the offline conflict version and fields; pending work was preserved.')
  }
  const remoteAt = Date.parse(revision)
  if (!Number.isFinite(Date.parse(mutation.timestamp))) throw new Error('Offline edit time is unconfirmed; work was preserved.')
  if (!(remoteAt > Date.parse(mutation.timestamp))) return { held: false, revision }
  const differs = fields.some((f) => f in remote && JSON.stringify(remote[f]) !== JSON.stringify(changes[f]))
  if (!differs) return { held: false, revision }

  await db.conflicts.add({
    mutationId: id,
    clientUuid: mutation.clientUuid,
    table: mutation.table,
    recordId: rowId,
    localChanges: changes,
    remoteState: remote,
    detectedAt: new Date().toISOString(),
    status: 'unresolved',
  })
  await db.mutations.update(id, {
    status: 'failed',
    error: `Conflict: the server changed this record at ${String(remote['updated_at'])}, after the offline edit at ${mutation.timestamp}.`,
    retryCount: MAX_RETRIES,
  })
  return { held: true, revision }
}

async function replayMutation(mutation: QueuedMutation, identity: OfflineSession): Promise<void> {
  const id = mutation.id
  if (id === undefined) return
  await markMutationSyncing(id)

  try {
    if (mutation.action === 'insert') {
      const { data, error } = await identity.client.from(mutation.table).insert(mutation.payload).select('id').maybeSingle()
      if (error) {
        const isDuplicate = error.code === '23505' && String(error.message).includes('client_uuid')
        if (!isDuplicate) throw error
        const columns = [...new Set(['id', ...Object.keys(mutation.payload)])].join(',')
        const receipt = await identity.client.from(mutation.table).select(columns).eq('client_uuid', mutation.clientUuid).maybeSingle()
        if (receipt.error) {
          // A uniqueness violation proves that a key exists, not that it belongs
          // to this actor or has the same payload. A denied read is no receipt.
          throw new Error('Duplicate insert was not confirmed as the same saved work; pending work was preserved.')
        } else {
          const row = receipt.data as unknown as Record<string, unknown> | null
          if (!row || Object.entries(mutation.payload).some(([key, value]) => JSON.stringify(row[key]) !== JSON.stringify(value))) {
            throw new Error('Duplicate insert was not confirmed as the same saved work; pending work was preserved.')
          }
        }
      } else if (!data?.id) {
        throw new Error('Server did not confirm the offline insert; pending work was preserved.')
      }
    } else if (mutation.action === 'update') {
      const { id: rowId, ...rest } = mutation.payload
      if (typeof rowId !== 'string' || !rowId) throw new Error('Offline update has no target ID; work was preserved.')
      const check = await checkReplayConflict(id, mutation, rowId, rest, identity.client)
      if (check.held) return
      const { data, error } = await identity.client.from(mutation.table).update(rest)
        .eq('id', rowId).eq('updated_at', check.revision).select('id').maybeSingle()
      if (error) throw error
      if (!data || data.id !== rowId) throw new Error('Server did not confirm the offline update; pending work was preserved.')
    } else {
      // Law 3 — nothing is deleted. A queued 'delete' should never have been created; surface it
      // as a dead-letter immediately rather than silently retrying an operation this app forbids.
      await db.mutations.update(id, { status: 'failed', error: 'Delete is not a supported offline action (Law 3)', retryCount: MAX_RETRIES })
      return
    }
    await resolveMutation(id)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const retryCount = (mutation.retryCount ?? 0) + 1
    if (retryCount >= MAX_RETRIES) {
      await db.mutations.update(id, { status: 'failed', error: message, retryCount })
    } else {
      // Still retryable — back to 'pending' (not 'failed') so the next drain picks it up again.
      await db.mutations.update(id, { status: 'pending', error: message, retryCount })
    }
  }
}

/**
 * Boot-time drain — guarded on IndexedDB, and never fire-and-forget.
 *
 * Two things were wrong here, and only one of them looked like a test problem.
 *
 * 1. **`indexedDB` was assumed, not checked.** Dexie needs it, and `window`
 *    existing does not imply it does: jsdom ships no IndexedDB, and a real
 *    browser can withhold it (Firefox private windows historically, and any
 *    context where storage is blocked). `dataAccess.ts` imports this module for
 *    `enqueueMutation`, so merely importing the data layer ran a drain against
 *    an API that was not there — which is why `npx vitest run` exited 1 with
 *    five `MissingAPIError: IndexedDB API missing` rejections while every test
 *    passed. The failure was real code, not a test artefact: the same import
 *    reaches the same missing API in a storage-blocked browser.
 *
 * 2. **`void drainQueue()` discarded the rejection.** `void` silences the
 *    unhandled-promise lint, not the unhandled promise — the failure surfaced
 *    with no stack pointing here and nothing that could act on it. A queue that
 *    cannot drain is exactly the condition an operator must eventually be told
 *    about, because their offline writes are sitting unsent.
 *
 * The `catch` logs rather than rethrows: a drain failure at boot must not take
 * the app down, and the queue is durable, so the next `online` event retries.
 * Surfacing it in the UI is `SystemMonitor`'s job and is not wired yet.
 */
function canUseOfflineQueue(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

function drainQuietly(trigger: 'boot' | 'online'): void {
  void drainQueue().catch((err: unknown) => {
    captureError(err, { where: 'offlineQueue.drain', trigger })
  })
}

if (canUseOfflineQueue()) {
  window.addEventListener('online', () => drainQuietly('online'))
  // Covers the case where the app boots already online with mutations queued from a previous,
  // now-closed session — no 'online' event fires for state that was already true on load.
  if (navigator.onLine) drainQuietly('boot')
}
