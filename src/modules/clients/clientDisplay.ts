/**
 * Staff-facing reading of client figures that have an honest "not set" state.
 *
 * Pure functions with no React and no query. Each one shows a fact the query
 * layer has already decided; none re-derives a rule. They exist so the
 * directory, the preview and the profile print the same words for the same
 * absence.
 */
import { formatMoney, type Paisa } from '../../lib/money'
import type { MembershipTier } from '../../data/clients'

/**
 * A credit limit, as staff read it.
 *
 * A non-positive limit means no limit is recorded. `toClientRecord` folds an
 * absent `approved_credit_limit` to 0, and `creditStopFactsOf` and
 * `evaluateCreditStop` read it the same way. Printing "Rs 0" would state a limit
 * nobody agreed, so the absence is said in words.
 */
export function creditLimitLabel(limit: Paisa): string {
  return limit > 0 ? formatMoney(limit) : 'Not set'
}

/**
 * The membership a client holds, as staff read it.
 *
 * `membershipLevel` is the directory's own reading: the tier, or `null` for no
 * membership row. `undefined` means the record did not carry the reading, and it
 * shows as a dash rather than a guess. The placeholder tier on `membership` is
 * deliberately never read here (see `UNJOINED_MEMBERSHIP_PLACEHOLDER`).
 */
export function membershipLabel(client: { membershipLevel?: MembershipTier | null }): string {
  if (client.membershipLevel === undefined) return '—'
  return client.membershipLevel ?? 'No membership'
}
