import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * **The one-shot read behind a report or settings pane — `useList`'s sibling
 * for screens whose data is a summary, not a filtered list.**
 *
 * PLAN.md Phase 6 asks every routed view to draw five states. The secondary
 * views (reports, Settings panes, admin) mostly read once on mount, and each
 * wrote its own `useEffect(() => { void query().then(setX) }, [])` — with no
 * `.catch`, no loading flag and, in several, the result discarded. That is how
 * a report ends up with no Loading state and no Error state at all: there was
 * nothing to draw them from. This hook is the thing to draw them from, and it
 * hands `PageBody` exactly the shape `useList` does, so the two stay one
 * contract:
 *
 *   - `error` is the bare REASON (`PageBody` writes "Could not load …").
 *   - a failed REFRESH keeps the previous `data`, so `hasRows` can show the
 *     banner above stale-but-true figures rather than blanking them.
 *
 * ## Offline is a reason, not a sixth component
 *
 * The shell already draws the Offline bar on every route (`App.tsx`,
 * `OfflineBanner`, `useNetwork()`). What a screen adds is the per-read half:
 * when a read fails while the browser reports itself offline, the failure is
 * almost certainly the connection, and "fetch failed" tells the operator
 * nothing they can act on. So the reason becomes {@link OFFLINE_REASON} — what
 * happened, why, and what to do — and the read retries by itself on the
 * `online` event, so reconnecting is the fix rather than reconnecting and then
 * finding the Retry button.
 *
 * ## What it deliberately does not do
 *
 * No cache and no background refetch (TanStack Query's job, as `useList`
 * says). And no fallback value: a failed read is `error`, never a zero or a
 * seed figure dressed as data (Law 16).
 */

/**
 * The reason a read failed while the browser was offline.
 *
 * Written as the message beneath `PageBody`'s "Could not load …" title, so it
 * does not repeat that half — it says why, and how to fix it.
 */
export const OFFLINE_REASON =
  'This device is offline, so the read never reached the server. It will try again on its own when the connection returns, or press Retry.'

/** True when the browser reports no network. A browser that cannot say counts as online. */
export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * The reason to show for a failed read: the offline sentence when the browser
 * is offline, otherwise the error's own message.
 *
 * Exported so a screen that keeps its own load state (Staff Directory) words
 * an offline failure the same way as every screen that uses the hook.
 */
export function loadFailureReason(err: unknown): string {
  if (isBrowserOffline()) return OFFLINE_REASON
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  return 'The read failed without saying why.'
}

export interface LoadResult<T> {
  /** The last SUCCESSFUL result; null until the first one lands. A failed refresh leaves it alone. */
  data: T | null
  /** True while a read is in flight — the first one, or a Retry. */
  loading: boolean
  /** The bare reason the latest read failed, or null. See the header: never a finished sentence. */
  error: string | null
  /** Whether the latest failure happened while the browser was offline. */
  offline: boolean
  /** Re-runs the read. Bound to the error state's Retry. */
  reload: () => void
  /** When `data` last came back from a successful read. */
  lastFetchedAt: Date | null
}

export interface UseLoadOptions {
  /**
   * `false` skips the read entirely — for a session that may not see the
   * surface, whose restricted state must not be preceded by a request for data
   * it cannot have. `loading` is false while disabled.
   */
  enabled?: boolean
  /**
   * A value that, when it changes, re-runs the read (a period, a filter set).
   * A string so a fresh object literal per render does not refetch forever —
   * the same reason `useList` keys on `filterKey`.
   */
  key?: string
}

export function useLoad<T>(fetcher: () => Promise<T>, options: UseLoadOptions = {}): LoadResult<T> {
  const enabled = options.enabled ?? true
  const key = options.key ?? ''

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  const [nonce, setNonce] = useState(0)

  // The fetcher is usually an inline arrow; held in a ref so a new identity is
  // not a reason to re-query — only `key`, `enabled` or a Retry are.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setOffline(false)

    fetcherRef
      .current()
      .then((res) => {
        if (cancelled) return
        setData(res)
        setLastFetchedAt(new Date())
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setOffline(isBrowserOffline())
        setError(loadFailureReason(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    // A key change mid-flight must not let the older, slower response win.
    return () => {
      cancelled = true
    }
  }, [enabled, key, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  // Reconnecting is the fix for an offline failure, so it is also the retry.
  useEffect(() => {
    if (!offline) return
    const onOnline = () => setNonce((n) => n + 1)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [offline])

  return { data, loading, error, offline, reload, lastFetchedAt }
}
