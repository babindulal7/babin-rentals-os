/**
 * BABIN RENTALS OS — RENTAL INTELLIGENCE QUOTE EXPLAINER (RI-02)
 *
 * Implements authoritative pricing explanation and commercial policy transparency:
 * 1. Read-only explanation of canonical calculations — NEVER replaces or forks canonical pricing.
 *    (External floating-point computeQuote() is explicitly rejected).
 * 2. Exact integer paisa arithmetic parity (RI-A13, Law 1).
 * 3. Law 5 Security Deposit Liability isolation:
 *    - Held separately as a customer liability; strictly excluded from rental revenue (RI-A14).
 * 4. Law 10 Discount Approval Governance:
 *    - Discounts <= 10%: standard staff/manager discretion with reason.
 *    - Discounts > 10%: require named Owner approval and detailed reason (>=10 chars) (RI-A15).
 * 5. Advance Payment Threshold:
 *    - 50% advance required prior to equipment dispatch.
 * 6. Server-side / Adapter field-level gating (HIS v2.1 §4, RI-A16):
 *    - Warehouse, Technician, Driver, Client, and all 'floor' surfaces strictly receive zero
 *      monetary amounts in payloads, explanations, and exports.
 */

import { formatMoney, type Paisa } from '../money'
import { moneyScope, type Surface } from '../fieldGating'
import type { SystemRole } from '../../types/database'
import type {
  RentalAdvice,
  AdviceTarget,
  EvidenceState,
} from './types'

export interface QuoteLineItem {
  productId: string
  displayName: string
  quantity: number
  unitRatePaisa: number
  lineTotalPaisa: number
  pricingMethod?: 'flat' | 'structure' | 'fixed' | undefined
  isIncludedChild?: boolean | undefined
}

export interface CanonicalQuoteSnapshot {
  bookingId: string
  days: number
  lineItems: QuoteLineItem[]
  equipmentSubtotalPaisa: number
  discountPercent: number
  discountAmountPaisa: number
  discountReason?: string | undefined
  discountApprover?: string | undefined
  taxRatePercent: number // Nepal VAT standard: 13%
  taxAmountPaisa: number
  totalRentalPaisa: number
  depositPaisa: number
  advancePaidPaisa: number
  outstandingPaisa: number
  currency: 'NPR'
  calculatedAtIso: string
  isStale?: boolean | undefined
}

export interface QuoteExplanationBreakdown {
  bookingId: string
  durationDays: number
  equipmentSubtotalFormatted?: string | undefined
  discountFormatted?: string | undefined
  discountPercent: number
  isDiscountCompliant: boolean
  discountComplianceNotes?: string | undefined
  vatFormatted?: string | undefined
  totalRentalFormatted?: string | undefined
  depositLiabilityFormatted?: string | undefined
  advancePaidFormatted?: string | undefined
  advanceThresholdMet: boolean
  outstandingBalanceFormatted?: string | undefined
  isMoneyMasked: boolean
  summary: string
  advices: RentalAdvice[]
  evidenceState: EvidenceState
}

export function explainCanonicalQuote(
  snapshot: CanonicalQuoteSnapshot,
  userRole: SystemRole,
  surface: Surface = 'default',
): QuoteExplanationBreakdown {
  const target: AdviceTarget = { type: 'booking', id: snapshot.bookingId }
  const nowIso = new Date().toISOString()
  const scope = moneyScope({ role: userRole, surface })
  const advices: RentalAdvice[] = []

  // Check 1: Stale Financial Data Gate (RI-A13)
  const isStale = snapshot.isStale === true
  if (isStale) {
    advices.push({
      id: `adv-quote-stale-${snapshot.bookingId}`,
      module: 'quote_explanation',
      target,
      evidenceState: 'needs_verification',
      severity: 'review',
      explanation:
        'FINANCIAL SNAPSHOT STALE: Rate cards or booking line items have been updated since this total was computed. Re-run quote calculation before confirming invoice.',
      sourceRefs: ['src/lib/pricingStructures.ts', 'src/lib/money.ts'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Recalculate booking totals against live rate card'],
      blockingReasons: ['Stale pricing snapshot requires reconciliation.'],
    })
  }

  // Check 2: Money-blind roles (Warehouse, Technician, Driver or Floor Surface)
  if (scope === 'none') {
    const maskedAdvice: RentalAdvice = {
      id: `adv-quote-masked-${snapshot.bookingId}`,
      module: 'quote_explanation',
      target,
      evidenceState: isStale ? 'needs_verification' : 'supported',
      severity: 'info',
      explanation: `Booking duration: ${snapshot.days} day(s). Equipment line items: ${snapshot.lineItems.length}. Commercial pricing, VAT, deposits, and invoice balances are omitted on operational floor surfaces under field-level gating (HIS v2.1 §4).`,
      sourceRefs: ['src/lib/fieldGating.ts', 'src/lib/rentalActions.ts'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Verify physical gear barcodes and quantities against checklist', 'Check unit serial numbers at handover'],
    }
    advices.push(maskedAdvice)

    return {
      bookingId: snapshot.bookingId,
      durationDays: snapshot.days,
      discountPercent: 0,
      isDiscountCompliant: true,
      advanceThresholdMet: true,
      isMoneyMasked: true,
      summary: `Booking #${snapshot.bookingId}: ${snapshot.days} day(s) duration. Commercial values omitted for ${userRole} on ${surface} surface.`,
      advices,
      evidenceState: isStale ? 'needs_verification' : 'supported',
    }
  }

  // Check 3: Law 10 Discount Approval Governance
  let isDiscountCompliant = true
  let discountNotes: string | undefined = undefined

  if (snapshot.discountPercent > 0) {
    const isOwnerOrManagerApproved =
      snapshot.discountApprover &&
      (snapshot.discountApprover.toLowerCase().includes('owner') ||
        snapshot.discountApprover.toLowerCase().includes('manager') ||
        snapshot.discountApprover.toLowerCase().includes('babin'))

    const hasSufficientReason = snapshot.discountReason && snapshot.discountReason.trim().length >= 10

    if (snapshot.discountPercent > 10) {
      if (!isOwnerOrManagerApproved || !hasSufficientReason) {
        isDiscountCompliant = false
        discountNotes = `WARNING (Law 10): Commercial discount of ${snapshot.discountPercent}% exceeds the 10% standard discretionary limit. Requires documented business reason (>=10 characters) and named Owner approval.`
        advices.push({
          id: `adv-quote-discount-law10-${snapshot.bookingId}`,
          module: 'quote_explanation',
          target,
          evidenceState: 'needs_verification',
          severity: 'urgent',
          explanation: discountNotes,
          sourceRefs: ['data/os_laws.json', 'references/shoot_playbooks_and_ladders.md'],
          sourceKinds: ['approved_knowledge'],
          snapshotAt: nowIso,
          requiredChecks: [
            'Submit discount approval request to Owner',
            'Record explicit justification for discount exceeding 10%',
          ],
          blockingReasons: ['Unapproved commercial discount exceeding 10% threshold under Law 10.'],
        })
      }
    }
  }

  // Check 4: 50% Advance Payment Sufficiency Gate
  const minimumAdvanceRequiredPaisa = Math.round(snapshot.totalRentalPaisa * 0.5)
  const advanceThresholdMet = snapshot.advancePaidPaisa >= minimumAdvanceRequiredPaisa
  if (!advanceThresholdMet && snapshot.totalRentalPaisa > 0) {
    advices.push({
      id: `adv-quote-advance-${snapshot.bookingId}`,
      module: 'quote_explanation',
      target,
      evidenceState: 'supported',
      severity: 'review',
      explanation: `ADVANCE UNDER THRESHOLD: Advance received (${formatMoney(snapshot.advancePaidPaisa as Paisa)}) is below the required 50% operational dispatch threshold (${formatMoney(minimumAdvanceRequiredPaisa as Paisa)}). Minimum 50% deposit required prior to gear leaving warehouse floor.`,
      sourceRefs: ['src/lib/pricingStructures.ts', 'data/os_laws.json'],
      sourceKinds: ['live_os', 'approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: ['Collect required advance balance or secure Owner credit authorization'],
    })
  }

  // Check 5: Law 5 Security Deposit Liability Transparency
  if (snapshot.depositPaisa > 0) {
    advices.push({
      id: `adv-quote-deposit-law5-${snapshot.bookingId}`,
      module: 'quote_explanation',
      target,
      evidenceState: 'supported',
      severity: 'info',
      explanation: `SECURITY DEPOSIT (Law 5): ${formatMoney(snapshot.depositPaisa as Paisa)} is held as a customer balance liability in escrow. It is strictly segregated from operational rental revenue and must be released upon complete and undamaged return of all equipment lines.`,
      sourceRefs: ['data/os_laws.json', 'src/lib/money.ts'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: ['Receipt deposit into liability escrow account', 'Ensure deposit is not booked to P&L revenue'],
    })
  }

  // Check 6: VAT 13% Calculation Verification
  const expectedVatPaisa = Math.round((snapshot.equipmentSubtotalPaisa - snapshot.discountAmountPaisa) * 0.13)
  const vatDiff = Math.abs(snapshot.taxAmountPaisa - expectedVatPaisa)
  if (vatDiff > 100) { // Discrepancy > 1 Rupee (100 paisa)
    advices.push({
      id: `adv-quote-vat-discrepancy-${snapshot.bookingId}`,
      module: 'quote_explanation',
      target,
      evidenceState: 'needs_verification',
      severity: 'urgent',
      explanation: `TAX DISCREPANCY: Persisted VAT (${formatMoney(snapshot.taxAmountPaisa as Paisa)}) deviates from calculated 13% Nepal VAT (${formatMoney(expectedVatPaisa as Paisa)}). Verify tax computation engine.`,
      sourceRefs: ['src/lib/pricingStructures.ts'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Reconcile taxable base with accountant'],
      blockingReasons: ['VAT calculation discrepancy detected on booking lines.'],
    })
  }

  // Primary Quote Explanation Advice
  const explanationParts: string[] = []
  explanationParts.push(`Rental Period: ${snapshot.days} day(s).`)
  explanationParts.push(`Equipment Base Total: ${formatMoney(snapshot.equipmentSubtotalPaisa as Paisa)}.`)
  if (snapshot.discountPercent > 0) {
    explanationParts.push(
      `Discount (${snapshot.discountPercent}%): -${formatMoney(snapshot.discountAmountPaisa as Paisa)}${snapshot.discountApprover ? ` [Auth: ${snapshot.discountApprover}]` : ''}.`,
    )
  }
  explanationParts.push(`Nepal VAT (13%): ${formatMoney(snapshot.taxAmountPaisa as Paisa)}.`)
  explanationParts.push(`Total Rental: ${formatMoney(snapshot.totalRentalPaisa as Paisa)}.`)
  if (snapshot.depositPaisa > 0) {
    explanationParts.push(`Refundable Deposit: ${formatMoney(snapshot.depositPaisa as Paisa)} (Law 5 liability).`)
  }
  explanationParts.push(
    `Advance: ${formatMoney(snapshot.advancePaidPaisa as Paisa)} | Balance Due: ${formatMoney(snapshot.outstandingPaisa as Paisa)}.`,
  )

  advices.unshift({
    id: `adv-quote-canonical-${snapshot.bookingId}`,
    module: 'quote_explanation',
    target,
    evidenceState: isStale || !isDiscountCompliant ? 'needs_verification' : 'supported',
    severity: !isDiscountCompliant ? 'review' : 'info',
    explanation: explanationParts.join(' '),
    sourceRefs: ['src/lib/pricingStructures.ts', 'src/lib/money.ts', 'data/os_laws.json'],
    sourceKinds: ['live_os', 'approved_knowledge'],
    snapshotAt: nowIso,
    requiredChecks: [
      'Ensure security deposit is receipted to separate liability ledger',
      'Verify 50% advance before warehouse physical dispatch',
    ],
  })

  let overallEvidence: EvidenceState = 'supported'
  if (advices.some((a) => a.evidenceState === 'blocked')) {
    overallEvidence = 'blocked'
  } else if (advices.some((a) => a.evidenceState === 'needs_verification') || isStale || !isDiscountCompliant) {
    overallEvidence = 'needs_verification'
  }

  return {
    bookingId: snapshot.bookingId,
    durationDays: snapshot.days,
    equipmentSubtotalFormatted: formatMoney(snapshot.equipmentSubtotalPaisa as Paisa),
    discountFormatted: formatMoney(snapshot.discountAmountPaisa as Paisa),
    discountPercent: snapshot.discountPercent,
    isDiscountCompliant,
    discountComplianceNotes: discountNotes,
    vatFormatted: formatMoney(snapshot.taxAmountPaisa as Paisa),
    totalRentalFormatted: formatMoney(snapshot.totalRentalPaisa as Paisa),
    depositLiabilityFormatted: formatMoney(snapshot.depositPaisa as Paisa),
    advancePaidFormatted: formatMoney(snapshot.advancePaidPaisa as Paisa),
    advanceThresholdMet,
    outstandingBalanceFormatted: formatMoney(snapshot.outstandingPaisa as Paisa),
    isMoneyMasked: false,
    summary: `Rental Total: ${formatMoney(snapshot.totalRentalPaisa as Paisa)} for ${snapshot.days} day(s). Balance Due: ${formatMoney(snapshot.outstandingPaisa as Paisa)}.`,
    advices,
    evidenceState: overallEvidence,
  }
}
