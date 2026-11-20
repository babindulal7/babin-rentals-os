/**
 * T7-07: non-executing refund planning and reconciliation contracts.
 *
 * WARNING: This module does NOT initiate a gateway refund, create store credit,
 * post a reversal to accounting, or verify a provider callback. Provider settlement
 * and reversal posting require an authenticated, idempotent server transaction.
 */
import type { SystemRole } from '../types/database'

export type RefundDestination = 'original_wallet' | 'store_credit'
export interface OnlinePaymentIntent {
  intentId: string
  bookingId?: string
  clientId: string
  amountPaisa: number
  provider: 'fonepay' | 'esewa' | 'khalti'
  providerRef: string
  status: 'paid' | 'allocated' | 'refunded'
  paidAtUtc: string
}
export interface RefundExecutionRequest {
  intentId: string
  amountPaisa: number
  destination: RefundDestination
  reason: string
  actorRole: SystemRole
  actorUserId: string
  executedAtUtc?: string
}
export interface RefundPlan {
  intentId: string
  providerRef: string
  destination: RefundDestination
  amountPaisa: number
  reason: string
  status: 'pending_provider_confirmation'
  /** Must have a UNIQUE constraint on the backend and be tied to an authenticated actor. */
  idempotencyKey: string
}
export interface IntentReconciliationAudit {
  totalPaidIntents: number
  unallocatedIntentsCount: number
  staleUnallocatedOverThreeDays: OnlinePaymentIntent[]
  totalUnallocatedAmountPaisa: number
  /** Review Nepal public holidays before treating this as a binding 3-working-day SLA. */
  holidayCalendarVerified: boolean
}

/** Presentation hint only; authorization MUST be derived and enforced on the backend. */
export function canProcessRefunds(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Accounts'
}

export function prepareRefund(intent: OnlinePaymentIntent, req: RefundExecutionRequest):
  { success: boolean; error?: string; plan?: RefundPlan } {
  if (!canProcessRefunds(req.actorRole)) return { success: false, error: 'Permission denied: financial role required.' }
  if (!req.actorUserId || !req.reason.trim()) return { success: false, error: 'Actor and written reason are required.' }
  if (req.intentId !== intent.intentId) return { success: false, error: 'Intent mismatch.' }
  if (intent.status !== 'paid') return { success: false, error: 'Only unallocated, paid intents may be planned for refund.' }
  if (!Number.isSafeInteger(req.amountPaisa) || req.amountPaisa <= 0 || req.amountPaisa > intent.amountPaisa) {
    return { success: false, error: 'Refund amount must be a positive integer within amount paid.' }
  }
  // This proposal is not a settlement. The backend must enforce a unique key,
  // re-read the intent under lock, verify actor rights, contact the gateway,
  // and only record a reversal after confirmed provider settlement.
  return { success: true, plan: {
    intentId: intent.intentId, providerRef: intent.providerRef,
    destination: req.destination, amountPaisa: req.amountPaisa,
    reason: req.reason.trim(), status: 'pending_provider_confirmation',
    idempotencyKey: 'refund:' + intent.intentId,
  } }
}

/** Explicitly fail closed until the authenticated provider-backed flow is implemented. */
export function executeOnlineRefund(intent: OnlinePaymentIntent, req: RefundExecutionRequest):
  { success: false; error: string } {
  const plan = prepareRefund(intent, req)
  if (!plan.success) return { success: false, error: plan.error ?? 'Invalid refund request.' }
  return { success: false, error: 'BACKEND_NOT_CONNECTED: refund was NOT processed, refunded, or posted to ledger.' }
}

const nepalDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
})
function nepalCalendarKey(date: Date): { key: string; weekday: string } {
  const parts = nepalDate.formatToParts(date)
  const get = (type: string) => parts.find(x => x.type === type)?.value ?? ''
  return { key: get('year') + '-' + get('month') + '-' + get('day'), weekday: get('weekday') }
}
/** Count elapsed business dates, Nepal Saturday weekend; excludes supplied official holidays. */
export function elapsedNepalWorkingDays(start: Date, end: Date, holidays: ReadonlySet<string> = new Set()): number {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return 0
  let days = 0
  const seen = new Set<string>()
  for (let ms = start.getTime() + 86400000; ms <= end.getTime(); ms += 86400000) {
    const { key, weekday } = nepalCalendarKey(new Date(ms))
    if (!seen.has(key) && weekday !== 'Sat' && !holidays.has(key)) { seen.add(key); days++ }
  }
  return days
}
/** Alerts for review, not an instruction to automatically issue refunds. */
export function reconcilePaymentIntents(
  intents: OnlinePaymentIntent[], currentDate = new Date(),
  officialNepalHolidays?: ReadonlySet<string>,
): IntentReconciliationAudit {
  const unallocated = intents.filter(i => i.status === 'paid')
  return {
    totalPaidIntents: intents.length,
    unallocatedIntentsCount: unallocated.length,
    totalUnallocatedAmountPaisa: unallocated.reduce((sum, i) => sum + i.amountPaisa, 0),
    staleUnallocatedOverThreeDays: unallocated.filter(i =>
      elapsedNepalWorkingDays(new Date(i.paidAtUtc), currentDate, officialNepalHolidays) >= 3
    ),
    holidayCalendarVerified: officialNepalHolidays !== undefined,
  }
}
