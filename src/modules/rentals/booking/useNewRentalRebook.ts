import { useCallback, useEffect, useRef, useState } from 'react'
import type { SystemRole } from '../../../types/database'
import { newClientUuid } from '../../../lib/supabase'
import {
  buildRebookPrefill,
  parseRebookCopyOptions,
  type RebookPrefill,
} from '../../../lib/rebook'
import { fetchRebookSource } from '../../../lib/queries/rebook'

/**
 * useNewRentalRebook — applies a `?rebook=BK-…` deep link to the New Rental
 * form (T3-01 · D9).
 *
 * The URL carries only a booking number and the optional `copy=` ticks, so a
 * re-book link survives a refresh and a share, yet NOTHING is written by
 * arriving: the fetch is read-only, the prefill lands in form state, and the
 * first write is still staff's save. D9's "no eager draft" is why this is a
 * URL parameter and not a row like the old Duplicate flow's.
 *
 * After the prefill applies, the parameters are cleared (a `replace`
 * navigation) so a refresh restores the autosaved local draft rather than
 * re-stamping the prefill over whatever staff changed.
 *
 * Skipped entirely while editing an existing quote (`editBookingId`) or when
 * a `draft=` parameter is also present — those are explicit load paths and a
 * re-book never overwrites one.
 */

export interface RebookNotice {
  sourceBookingNo: string
  /** Products left out of the copy, each with the reason. Rendered verbatim. */
  unavailable: ReadonlyArray<{ name: string; reason: string }>
}

export type ApplyRebookMode = 'fresh' | 'append'

export interface UseNewRentalRebookOptions {
  searchParams: URLSearchParams
  setSearchParams: (next: URLSearchParams, options?: { replace?: boolean }) => void
  editBookingId?: string | undefined
  /** The signed-in role; the source read is desk-gated before any query. */
  role: SystemRole | null
  setActionError: (msg: string | null) => void
  /** The page's own setter bundle — this hook owns no form state. */
  apply: (prefill: RebookPrefill, mode: ApplyRebookMode) => void
}

export interface UseNewRentalRebookResult {
  notice: RebookNotice | null
  dismissNotice: () => void
}

export function useNewRentalRebook({
  searchParams,
  setSearchParams,
  editBookingId,
  role,
  setActionError,
  apply,
}: UseNewRentalRebookOptions): UseNewRentalRebookResult {
  const [notice, setNotice] = useState<RebookNotice | null>(null)

  const rebookParam = searchParams.get('rebook')
  const copyParam = searchParams.get('copy')

  /* One application per source value: a parameter does not re-apply over
     staff's edits just because an unrelated state change re-rendered. */
  const appliedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!rebookParam) return
    if (editBookingId || searchParams.has('draft')) return
    if (appliedFor.current === rebookParam) return
    appliedFor.current = rebookParam

    let cancelled = false
    const clearParams = () => {
      const next = new URLSearchParams(searchParams)
      next.delete('rebook')
      next.delete('copy')
      setSearchParams(next, { replace: true })
    }

    void fetchRebookSource(rebookParam, role)
      .then((result) => {
        if (cancelled) return
        if (result.kind === 'refused') {
          setActionError(`Re-book of ${rebookParam} did not open: ${result.reason}`)
          clearParams()
          return
        }
        const prefill = buildRebookPrefill(
          result.source,
          result.products,
          result.bundles,
          parseRebookCopyOptions(copyParam),
          newClientUuid,
        )
        apply(prefill, 'fresh')
        setNotice({ sourceBookingNo: result.source.bookingNo, unavailable: prefill.unavailable })
        clearParams()
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setActionError(`Re-book of ${rebookParam} did not open: ${e instanceof Error ? e.message : String(e)}`)
      })

    return () => {
      cancelled = true
    }
  }, [rebookParam, copyParam, editBookingId, role, searchParams, setSearchParams, setActionError, apply])

  const dismissNotice = useCallback(() => setNotice(null), [])

  return { notice, dismissNotice }
}
