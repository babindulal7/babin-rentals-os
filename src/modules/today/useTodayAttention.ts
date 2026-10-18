import { useCallback, useEffect, useRef, useState } from 'react'
import { listBookings, overdue, latePickups } from '../../lib/queries/bookings'
import { businessNowAd } from '../../data/today'
import { deriveAttentionTasks, type AttentionTask } from './attentionModel'
import { DomainEvents, EVENT_TYPES } from '../../events/eventBus'
import { useNetwork } from '../../lib/network'

export interface TodayAttentionState {
  tasks: readonly AttentionTask[]
  totalCount: number
  loading: boolean
  error: string | null
  lastFetchedAt: Date | null
  truncated: boolean
  isOffline: boolean
  refresh: () => void
}

const RELEVANT_EVENTS: string[] = [
  EVENT_TYPES.RENTAL_CONFIRMED,
  EVENT_TYPES.RENTAL_PACKED,
  EVENT_TYPES.RENTAL_HANDED_OVER,
  EVENT_TYPES.RENTAL_PICKED_UP,
  EVENT_TYPES.RENTAL_RETURN_STARTED,
  EVENT_TYPES.RENTAL_RETURNED,
  EVENT_TYPES.RENTAL_RESET_COMPLETED,
  EVENT_TYPES.RENTAL_CLOSED,
  EVENT_TYPES.RENTAL_CANCELLED,
  EVENT_TYPES.RENTAL_EXTENDED,
  EVENT_TYPES.RENTAL_CREATED,
]

/**
 * Hook for live Today Attention tasks.
 *
 * Fetches authoritative overdue return and late pickup rows independently of
 * any user-selected date ranges on the Today page. Automatically re-fetches
 * on domain lifecycle events, network re-connect, document visibility re-entry,
 * and minute clock rollover.
 */
export function useTodayAttention(): TodayAttentionState {
  const isOnline = useNetwork()
  const [tasks, setTasks] = useState<readonly AttentionTask[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  const [truncated, setTruncated] = useState<boolean>(false)

  // Track request sequence to discard stale out-of-order responses
  const activeRequestId = useRef(0)

  const fetchAttention = useCallback(async () => {
    const requestId = ++activeRequestId.current
    setLoading(true)

    try {
      const nowAd = businessNowAd()

      const [overdueRes, latePickupsRes] = await Promise.all([
        listBookings({ ...overdue(nowAd), withCount: true }),
        listBookings({ ...latePickups(nowAd), withCount: true }),
      ])

      // If a newer request has started, drop this response
      if (requestId !== activeRequestId.current) return

      const overdueTotal = overdueRes.total ?? overdueRes.rows.length
      const lateTotal = latePickupsRes.total ?? latePickupsRes.rows.length
      const calculatedTotal = overdueTotal + lateTotal

      const isOverdueTruncated = overdueRes.total != null && overdueRes.total > overdueRes.rows.length
      const isLateTruncated = latePickupsRes.total != null && latePickupsRes.total > latePickupsRes.rows.length

      const derivedTasks = deriveAttentionTasks(overdueRes.rows, latePickupsRes.rows, nowAd)

      setTasks(derivedTasks)
      setTotalCount(calculatedTotal)
      setTruncated(isOverdueTruncated || isLateTruncated)
      setError(null)
      setLastFetchedAt(new Date())
    } catch (err) {
      if (requestId !== activeRequestId.current) return
      const message = err instanceof Error ? err.message : 'Attention items unavailable'
      setError(message)
      setTasks([])
      setTotalCount(0)
    } finally {
      if (requestId === activeRequestId.current) {
        setLoading(false)
      }
    }
  }, [])

  // Initial fetch and on network re-connection
  useEffect(() => {
    void fetchAttention()
  }, [fetchAttention, isOnline])

  // Invalidate and refetch on domain events
  useEffect(() => {
    const unsubs = RELEVANT_EVENTS.map((event) =>
      DomainEvents.subscribe(event, () => {
        void fetchAttention()
      }),
    )

    return () => {
      unsubs.forEach((unsub) => unsub())
    }
  }, [fetchAttention])

  // Periodic minute-boundary timer (60s) to catch clock rollover without spinning
  useEffect(() => {
    const interval = setInterval(() => {
      // Only refetch if document is visible to save battery and unnecessary DB calls
      if (document.visibilityState === 'visible') {
        void fetchAttention()
      }
    }, 60_000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchAttention()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchAttention])

  return {
    tasks,
    totalCount,
    loading,
    error,
    lastFetchedAt,
    truncated,
    isOffline: !isOnline,
    refresh: fetchAttention,
  }
}
