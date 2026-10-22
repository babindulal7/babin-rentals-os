import { supabase } from './supabase'
import { drainQueue, getOfflineQueueSummary } from './offlineQueue'
import { localStore, isIndexedDbAvailable } from './localStore'
import type { CachedClient, CachedProduct, CachedBooking } from './localStore'
import { captureError } from './monitoring'
import { rupees } from './money'

interface RemoteProduct {
  id: string
  name?: string | null
  asset_code?: string | null
  brand?: string | null
  model?: string | null
  status?: string | null
  is_active?: boolean | null
  tracking_mode?: string | null
  daily_rate?: number | string | null
  created_at?: string | null
  updated_at?: string | null
}

interface RemoteClient {
  id: string
  name?: string | null
  phone?: string | null
  email?: string | null
  address_line?: string | null
  membership_level?: string | null
  is_blocked?: boolean | null
  created_at?: string | null
}

/* Dexie treats an absent key and an `undefined` value alike;
   `exactOptionalPropertyTypes` does not — an optional field may be missing,
   never `undefined`. The remote row is mapped with every column named and
   the undefined ones dropped here, so the cached row's type stays strict. */
function withoutUndefined<T extends object>(row: { [K in keyof T]: T[K] | undefined }): T {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as T
}

export type SyncStatusType = 'synced' | 'syncing' | 'pending' | 'offline' | 'error'

export interface SyncState {
  status: SyncStatusType
  pendingCount: number
  lastSyncTime: Date | null
  error?: string | undefined
}

type SyncListener = (state: SyncState) => void

class SyncEngine {
  private listeners: Set<SyncListener> = new Set()
  private state: SyncState = {
    status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced',
    pendingCount: 0,
    lastSyncTime: null,
  }
  private intervalTimer: number | null = null
  private syncing = false

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.updateState({ status: 'syncing' })
        this.syncAll().catch(() => {})
      })
      window.addEventListener('offline', () => {
        this.updateState({ status: 'offline' })
      })

      // Start periodic background sync every 25 seconds when online
      this.startBackgroundSync(25000)
    }
  }

  public getState(): SyncState {
    return this.state
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  private updateState(partial: Partial<SyncState>) {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach((l) => l(this.state))
  }

  public startBackgroundSync(intervalMs = 25000) {
    if (this.intervalTimer) globalThis.clearInterval(this.intervalTimer)
    this.intervalTimer = globalThis.setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        this.syncAll().catch(() => {})
      }
    }, intervalMs) as unknown as number
  }

  public stopBackgroundSync() {
    if (this.intervalTimer) {
      globalThis.clearInterval(this.intervalTimer)
      this.intervalTimer = null
    }
  }

  /**
   * Refreshes the pending mutation count from IndexedDB.
   */
  public async refreshPendingCount(): Promise<number> {
    if (!isIndexedDbAvailable()) return 0
    try {
      const summary = await getOfflineQueueSummary()
      const count = summary.total
      const error = summary.held > 0
        ? 'Saved offline work is held for another account or needs its original identity verified. It has been preserved.'
        : summary.failed > 0 ? 'Some saved offline work needs review before it can sync.' : undefined
      this.updateState({
        pendingCount: count,
        error,
        status:
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'offline'
            : count > 0
            ? 'pending'
            : 'synced',
      })
      return count
    } catch {
      return 0
    }
  }

  /**
   * Full 2-way sync: drains the pending mutation outbox to Supabase, then pulls fresh master deltas.
   */
  public async syncAll(): Promise<{ success: boolean; pushed: number; error?: string }> {
    if (this.syncing) return { success: false, pushed: 0 }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.updateState({ status: 'offline' })
      return { success: false, pushed: 0, error: 'Offline' }
    }

    this.syncing = true
    this.updateState({ status: 'syncing', error: undefined })

    try {
      // 1. Drain upstream offline queue
      await drainQueue()
      const remainingPending = await this.refreshPendingCount()

      // 2. Pull downstream deltas into local Dexie store
      await this.pullDeltas()

      const now = new Date()
      this.updateState({
        status: remainingPending > 0 ? 'pending' : 'synced',
        pendingCount: remainingPending,
        lastSyncTime: now,
      })

      return { success: remainingPending === 0, pushed: 0 }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      captureError(err, { where: 'syncEngine.sync' })
      this.updateState({
        status: 'error',
        error: message,
      })
      return { success: false, pushed: 0, error: message }
    } finally {
      this.syncing = false
    }
  }

  /**
   * Pulls delta tables from Supabase into Dexie localStore.
   */
  private async pullDeltas(): Promise<void> {
    if (!isIndexedDbAvailable()) return

    try {
      // Pull products / equipment
      const { data: products } = await supabase
        .from('products_v')
        .select('id, name, asset_code, brand, model, status, is_active, tracking_mode, daily_rate, created_at, updated_at')
        .limit(300)
      if (products && products.length > 0) {
        await localStore.products.bulkPut(
          products.map((p: RemoteProduct) => withoutUndefined<CachedProduct>({
            id: p.id,
            name: p.name ?? '',
            asset_tag: p.asset_code ?? undefined,
            category: p.brand ? `${p.brand} ${p.model ?? ''}`.trim() : undefined,
            daily_rate_paisa: p.daily_rate != null ? rupees(Number(p.daily_rate)) : undefined,
            tracking_mode: p.tracking_mode ?? undefined,
            status: p.status ?? undefined,
            updated_at: p.updated_at || p.created_at || new Date().toISOString(),
          }))
        )
      }

      // Pull client directory
      const { data: clients } = await supabase
        .from('client_directory_v')
        .select('id, name, phone, email, address_line, membership_level, is_blocked, created_at')
        .limit(300)
      if (clients && clients.length > 0) {
        await localStore.clients.bulkPut(
          clients.map((c: RemoteClient) => withoutUndefined<CachedClient>({
            id: c.id,
            name: c.name ?? '',
            phone: c.phone ?? '',
            email: c.email ?? undefined,
            address: c.address_line ?? undefined,
            credit_tier: c.membership_level ?? undefined,
            is_blocked: c.is_blocked === true,
            updated_at: c.created_at || new Date().toISOString(),
          }))
        )
      }

      // Pull recent operational bookings for offline warehouse verification
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, booking_no, stage, client_id, project, pickup_at, return_at, actual_return_at, delivery_type, updated_at')
        .order('updated_at', { ascending: false })
        .limit(200)
      if (bookings && bookings.length > 0) {
        await localStore.bookings.bulkPut(
          bookings.map((b: { id: string; booking_no: string; stage: string; client_id: string; project?: string | null; pickup_at?: string | null; return_at?: string | null; actual_return_at?: string | null; delivery_type?: string | null; updated_at?: string | null }) =>
            withoutUndefined<CachedBooking>({
              id: b.id,
              booking_no: b.booking_no,
              stage: b.stage,
              client_id: b.client_id,
              project: b.project ?? undefined,
              pickup_at: b.pickup_at ?? undefined,
              return_at: b.return_at ?? undefined,
              actual_return_at: b.actual_return_at ?? undefined,
              delivery_type: b.delivery_type ?? undefined,
              updated_at: b.updated_at ?? undefined,
            })
          )
        )
      }
    } catch (e) {
      // Soft-fail delta caching without interrupting operational flow
      console.debug('[SyncEngine] Delta caching bypassed or unauthenticated:', e)
    }
  }
}

export const syncEngine = new SyncEngine()
