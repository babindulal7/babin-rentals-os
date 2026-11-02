/**
 * # Membership Credit Engine — Ruling D22 (OPEN_DECISIONS §20)
 *
 * Changing plan mid-term starts a **new term from today** and credits the
 * **unused days of the old plan** toward the new fee (D22):
 *
 *   credit = old fee × days left ÷ days in old term (integer paisa, half-up)
 *   new fee due = max(0, new fee − credit)
 *   account credit = max(0, credit − new fee)
 *
 * If the credit is larger than the new fee (a downgrade), the excess becomes
 * the client's non-cash account credit (`clients.account_credit`), never a cash refund.
 *
 * All amounts are integer paisa through `src/lib/money.ts` (Law 5).
 * Dates are civil calendar dates in Kathmandu (UTC+5:45).
 */

import { roundHalfUp, type Paisa } from './money'
import { businessDayAd } from './bs'

/**
 * Add a whole number of months to a calendar date `YYYY-MM-DD`, clipping to the
 * month's last day if the target month has fewer days (e.g. 2026-01-31 + 1 mon = 2026-02-28).
 * Matches PostgreSQL's `(date + (N || ' mons')::interval)::date`.
 */
export function addMonthsToDate(dateStr: string, months: number): string {
  const parts = dateStr.split('-').map(Number)
  const y = parts[0]
  const m = parts[1]
  const d = parts[2]
  if (!y || !m || !d) return dateStr

  const targetMonthIndex = (m - 1) + months
  const targetYear = y + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  // Day 0 of the following month returns the last day of targetMonth (UTC)
  const maxDays = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const targetDay = Math.min(d, maxDays)
  const mm = String(targetMonth + 1).padStart(2, '0')
  const dd = String(targetDay).padStart(2, '0')
  return `${targetYear}-${mm}-${dd}`
}

/**
 * Number of whole calendar days from `fromStr` to `toStr` (`toStr - fromStr`).
 */
export function daysBetweenDates(fromStr: string, toStr: string): number {
  const p1 = fromStr.split('-').map(Number)
  const p2 = toStr.split('-').map(Number)
  const y1 = p1[0]
  const m1 = p1[1]
  const d1 = p1[2]
  const y2 = p2[0]
  const m2 = p2[1]
  const d2 = p2[2]
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0

  const utc1 = Date.UTC(y1, m1 - 1, d1)
  const utc2 = Date.UTC(y2, m2 - 1, d2)
  return Math.round((utc2 - utc1) / (24 * 60 * 60 * 1000))
}

export interface MembershipCreditParams {
  /** Old plan fee in integer paisa. */
  oldFeePaisa: Paisa | number
  /** Old membership start date `YYYY-MM-DD`. */
  oldJoinDate: string
  /** Term length in months of the old plan. Defaults to 12. */
  oldTermMonths?: number | undefined
  /** Change effective date `YYYY-MM-DD`. Defaults to current Kathmandu business day. */
  effectiveDate?: string | undefined
  /** New plan fee in integer paisa. */
  newFeePaisa: Paisa | number
}

export interface MembershipCreditResult {
  oldFeePaisa: Paisa
  daysInOldTerm: number
  daysLeft: number
  creditPaisa: Paisa
  newFeePaisa: Paisa
  newFeeDuePaisa: Paisa
  accountCreditPaisa: Paisa
  termEndDate: string
  effectiveDate: string
}

/**
 * Pure calculation of unused days credit and fee due under Ruling D22.
 */
export function calculateMembershipCredit(params: MembershipCreditParams): MembershipCreditResult {
  const oldFeePaisa = Math.max(0, Math.round(params.oldFeePaisa)) as Paisa
  const newFeePaisa = Math.max(0, Math.round(params.newFeePaisa)) as Paisa
  const oldTermMonths = params.oldTermMonths && params.oldTermMonths > 0 ? params.oldTermMonths : 12
  const effectiveDate = params.effectiveDate || businessDayAd()

  const termEndDate = addMonthsToDate(params.oldJoinDate, oldTermMonths)
  const rawDaysInTerm = daysBetweenDates(params.oldJoinDate, termEndDate)
  const daysInOldTerm = Math.max(0, rawDaysInTerm)

  const rawDaysLeft = daysBetweenDates(effectiveDate, termEndDate)
  // Days left cannot exceed the full term, nor be negative
  const daysLeft = Math.max(0, Math.min(daysInOldTerm, rawDaysLeft))

  let creditPaisa = 0 as Paisa
  if (daysInOldTerm > 0 && daysLeft > 0 && oldFeePaisa > 0) {
    creditPaisa = roundHalfUp((oldFeePaisa * daysLeft) / daysInOldTerm) as Paisa
  }

  const newFeeDuePaisa = Math.max(0, newFeePaisa - creditPaisa) as Paisa
  const accountCreditPaisa = Math.max(0, creditPaisa - newFeePaisa) as Paisa

  return {
    oldFeePaisa,
    daysInOldTerm,
    daysLeft,
    creditPaisa,
    newFeePaisa,
    newFeeDuePaisa,
    accountCreditPaisa,
    termEndDate,
    effectiveDate,
  }
}
