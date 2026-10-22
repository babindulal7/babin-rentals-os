import { describe, it, expect } from 'vitest'
import { syncEngine, type SyncState } from '../syncEngine'

describe('SyncEngine State & Subscriptions', () => {
  it('reports initial sync state correctly', () => {
    const state = syncEngine.getState()
    expect(state).toHaveProperty('status')
    expect(state).toHaveProperty('pendingCount')
  })

  it('subscribes to state updates when listeners register', () => {
    let notifiedState: SyncState | null = null
    const unsub = syncEngine.subscribe((s) => {
      notifiedState = s
    })

    expect(notifiedState).not.toBeNull()
    expect(notifiedState).toHaveProperty('status')
    unsub()
  })

  it('handles refreshPendingCount gracefully when indexedDB is absent in test', async () => {
    const count = await syncEngine.refreshPendingCount()
    expect(typeof count).toBe('number')
  })

  it('manages background sync interval timers cleanly', () => {
    syncEngine.startBackgroundSync(10000)
    syncEngine.stopBackgroundSync()
    // Repeated stop does not throw
    expect(() => syncEngine.stopBackgroundSync()).not.toThrow()
  })

  it('refuses syncAll and sets offline status when offline', async () => {
    const originalOnLine = navigator.onLine
    try {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      const result = await syncEngine.syncAll()
      expect(result.success).toBe(false)
      expect(result.error).toBe('Offline')
      expect(syncEngine.getState().status).toBe('offline')
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true })
    }
  })
})

