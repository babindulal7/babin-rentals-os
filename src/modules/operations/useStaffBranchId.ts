import { useEffect, useState } from 'react'
import { IS_MOCK, supabase } from '../../lib/supabase'

/** Mock mode has no branch rows; the delivery actions return empty results there. */
const MOCK_BRANCH_ID = 'mock-branch'

const NO_BRANCH_MESSAGE =
  'Your staff record carries no branch, and routes are planned per branch. Ask an Owner to set your branch first.'

export interface StaffBranch {
  branchId: string | null
  /** Set when the branch could not be read or the staff record has none. */
  error: string | null
  isLoading: boolean
}

interface Lookup {
  userId: string
  branchId: string | null
  error: string | null
}

/**
 * The signed-in staff member's operating branch, read from `users.branch_id` —
 * the same source `saveDraft` and the New Rental submit use. `AuthUser` carries
 * no branch, so screens that call a per-branch RPC resolve it here.
 */
export function useStaffBranchId(userId: string | undefined): StaffBranch {
  const [lookup, setLookup] = useState<Lookup | null>(null)

  useEffect(() => {
    if (!userId || IS_MOCK) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('branch_id')
        .eq('id', userId)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        setLookup({ userId, branchId: null, error: `The operating branch could not be read (${error.message}).` })
        return
      }
      const branchId = (data as { branch_id?: string | null } | null)?.branch_id ?? null
      setLookup({ userId, branchId, error: branchId ? null : NO_BRANCH_MESSAGE })
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!userId) return { branchId: null, error: null, isLoading: false }
  if (IS_MOCK) return { branchId: MOCK_BRANCH_ID, error: null, isLoading: false }
  if (lookup?.userId !== userId) return { branchId: null, error: null, isLoading: true }
  return { branchId: lookup.branchId, error: lookup.error, isLoading: false }
}
