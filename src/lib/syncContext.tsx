import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { syncEngine, type SyncState } from './syncEngine'
import { useToast } from '../components/ui/Toast'

interface SyncContextValue extends SyncState {
  triggerSync: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue>({
  status: 'synced',
  pendingCount: 0,
  lastSyncTime: null,
  triggerSync: async () => {},
})

export const useSync = () => useContext(SyncContext)

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncState, setSyncState] = useState<SyncState>(syncEngine.getState())
  const { showSuccessToast } = useToast()

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((next) => {
      setSyncState(next)
    })
    syncEngine.refreshPendingCount()
    return unsubscribe
  }, [])

  const triggerSync = useCallback(async () => {
    /* Law 12 — toasts carry successes only. The offline and failure outcomes
       land in SyncState (`status` / `error`), which syncAll writes before
       returning; the shell renders that inline and it persists until the next
       sync resolves it. Only the success gets a toast. */
    const res = await syncEngine.syncAll()
    if (res.success) {
      showSuccessToast('Sync Complete', 'Cloud database & local cache are 100% in sync.')
    }
  }, [showSuccessToast])

  const value = useMemo(() => ({ ...syncState, triggerSync }), [syncState, triggerSync])

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  )
}
