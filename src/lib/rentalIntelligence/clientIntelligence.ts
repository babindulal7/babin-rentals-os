/**
 * Babin Rentals OS — Client Intelligence Engine (RI-04)
 *
 * Domain logic for client relationship and persona intelligence:
 * 1. Persona Classification (§P): Seasoned Pro, Creative Beginner, Corporate/Event, Returning Regular.
 * 2. Communication tone, technical depth, and operational safeguards guidance.
 * 3. Staged Nepalese business due recovery messaging drafts (§J4: Days 1, 3, 5, 7+).
 * 4. Sample size uncertainty disclosure: low booking count yields tentative advice.
 * 5. Field-level gating (HIS v2.1 §4): financial dues completely omitted for floor roles/surfaces.
 * 6. Non-autonomous boundary: outreach drafts are for staff review only; never auto-sent.
 */

import { formatMoney, type Paisa } from '../money'
import { moneyScope, type Surface } from '../fieldGating'
import type { SystemRole } from '../../types/database'
import type {
  RentalAdvice,
  AdviceTarget,
  EvidenceState,
} from './types'

export type ClientPersonaType =
  | 'seasoned_pro'
  | 'creative_beginner'
  | 'corporate_event'
  | 'returning_regular'

export interface ClientProfileInput {
  clientId: string
  clientName: string
  orderCount: number
  flags?: string[] | undefined
  preferredCategories?: string[] | undefined
  outstandingBalancePaisa?: number | undefined
  overdueDays?: number | undefined
  lastBookingAtIso?: string | undefined
}

export interface DueRecoveryDraft {
  stage: number
  stageName: string
  subject: string
  body: string
  formattedAmount: string
  warningTone: 'gentle' | 'followup' | 'urgent' | 'hold'
  isDraftOnly: true
}

export interface ClientIntelligenceResult {
  clientId: string
  clientName: string
  persona: ClientPersonaType
  title: string
  tone: string
  technicalDepth: string
  safeguards: string[]
  trustFactor: number
  sampleSizeConfidence: 'high' | 'moderate' | 'low'
  dueRecoveryDraft?: DueRecoveryDraft | undefined
  isMoneyMasked: boolean
  advices: RentalAdvice[]
  evidenceState: EvidenceState
}

const COMPANY_SIGNATURE =
  'Babin Rentals Pvt. Ltd. · Boudha-6, Dibya Marg, Kathmandu 44660 · 9712052571 · babinrentals@gmail.com'

/**
 * Classifies client into role-appropriate operational persona and generates
 * guidance drafts in compliance with field-level gating and Nepalese business etiquette.
 */
export function evaluateClientIntelligence(
  profile: ClientProfileInput,
  userRole: SystemRole = 'Coordinator',
  surface: Surface = 'default',
): ClientIntelligenceResult {
  const target: AdviceTarget = { type: 'client', id: profile.clientId }
  const nowIso = new Date().toISOString()
  const scope = moneyScope({ role: userRole, surface })
  const isMoneyMasked = scope === 'none'
  const advices: RentalAdvice[] = []

  const flags = (profile.flags ?? []).map((f) => f.toLowerCase())
  const orderCount = profile.orderCount ?? 0

  let persona: ClientPersonaType = 'returning_regular'
  let title = 'Returning Client'
  let tone = 'Courteous, helpful, efficient'
  let technicalDepth = 'Medium'
  let safeguards = ['Standard ID and agreement verification']
  let trustFactor = 1.0
  let sampleSizeConfidence: 'high' | 'moderate' | 'low' = 'moderate'

  if (flags.includes('corporate') || flags.includes('agency')) {
    persona = 'corporate_event'
    title = 'Corporate / Commercial Agency'
    tone = 'Professional, formal, SLA and paper-compliant'
    technicalDepth = 'Moderate (executive summaries, formal quotation specifications)'
    safeguards = ['Formal invoice with PAN', 'Official purchase order acknowledgment']
    trustFactor = 1.0
    sampleSizeConfidence = orderCount >= 3 ? 'high' : 'moderate'
  } else if (
    orderCount >= 5 ||
    flags.includes('cinematographer') ||
    flags.includes('dop') ||
    flags.includes('director of photography')
  ) {
    persona = 'seasoned_pro'
    title = 'Seasoned Professional / DP'
    tone = 'Direct, technical, concise, peer-to-peer respect'
    technicalDepth = 'High (exact optical, focal, bit-depth, and mount terminology)'
    safeguards = ['Expedited checkout', 'Verified trust rating']
    trustFactor = 0.2 // Reduced deposit barrier
    sampleSizeConfidence = 'high'
  } else if (
    orderCount < 2 ||
    flags.includes('student') ||
    flags.includes('beginner') ||
    flags.includes('emerging')
  ) {
    persona = 'creative_beginner'
    title = 'Creative Beginner / Emerging Filmmaker'
    tone = 'Warm, educational, patient, consultative'
    technicalDepth = 'Low to medium (explain accessories, power, and handling precautions in plain words)'
    safeguards = [
      'Mandatory operational briefing at handover',
      'Suggest Camera Caretaker or automated kits',
      'Block unassisted high-risk anamorphic or heavy zooms without supervision',
    ]
    trustFactor = 1.5 // Standard secured deposit
    sampleSizeConfidence = orderCount === 0 ? 'low' : 'moderate'
  } else {
    persona = 'returning_regular'
    title = 'Returning Client'
    tone = 'Courteous, helpful, efficient'
    technicalDepth = 'Medium'
    safeguards = ['Standard ID and agreement verification']
    trustFactor = 1.0
    sampleSizeConfidence = 'moderate'
  }

  // Check 1: Sample Size Uncertainty Disclosure (RI-A16)
  if (sampleSizeConfidence === 'low') {
    advices.push({
      id: `adv-client-sample-${profile.clientId}`,
      module: 'client',
      target,
      evidenceState: 'needs_verification',
      severity: 'info',
      explanation: `New client with zero prior verified rental history. Persona classification is tentative; observe first handover and verify physical government ID.`,
      sourceRefs: ['references/client_personas.md'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Verify physical government ID / citizenship card at handover', 'Brief on gear operation and handling precautions'],
    })
  } else {
    advices.push({
      id: `adv-client-persona-${profile.clientId}`,
      module: 'client',
      target,
      evidenceState: 'supported',
      severity: 'info',
      explanation: `Client classified as ${title} (${orderCount} recorded booking(s)). Communication approach: ${tone}. Technical depth: ${technicalDepth}.`,
      sourceRefs: ['references/client_personas.md'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: safeguards,
    })
  }

  // Check 2: High-Value Gear Safeguard for Beginners
  if (persona === 'creative_beginner' && profile.preferredCategories?.some((c) => c.toLowerCase().includes('cinema') || c.toLowerCase().includes('anamorphic'))) {
    advices.push({
      id: `adv-client-beginner-guard-${profile.clientId}`,
      module: 'client',
      target,
      evidenceState: 'needs_verification',
      severity: 'review',
      explanation: `Beginner client requesting cinema/anamorphic optics. Law 14 Babin Caretaker attendance is recommended to protect delicate equipment and ensure shoot success.`,
      sourceRefs: ['references/shoot_playbooks_and_ladders.md'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: ['Suggest Camera Caretaker line to client', 'Provide mandatory mount and handling demonstration'],
    })
  }

  // Check 3: Staged Due Recovery Draft (RI-A17)
  let dueRecoveryDraft: DueRecoveryDraft | undefined = undefined
  const outstandingPaisa = profile.outstandingBalancePaisa ?? 0
  const overdueDays = profile.overdueDays ?? 0

  if (outstandingPaisa > 0 && overdueDays > 0) {
    if (isMoneyMasked) {
      // Floor roles receive non-monetary operational awareness only
      advices.push({
        id: `adv-client-overdue-masked-${profile.clientId}`,
        module: 'client',
        target,
        evidenceState: 'supported',
        severity: overdueDays >= 5 ? 'urgent' : 'review',
        explanation: `Account has pending administrative settlement (${overdueDays} day(s) overdue). Commercial figures omitted under field-level gating. Check with Accounts before dispatch.`,
        sourceRefs: ['src/lib/fieldGating.ts'],
        sourceKinds: ['live_os'],
        snapshotAt: nowIso,
        requiredChecks: ['Check with Accounts manager prior to equipment dispatch'],
      })
    } else {
      const formattedAmount = formatMoney(outstandingPaisa as Paisa)

      if (overdueDays <= 1) {
        dueRecoveryDraft = {
          stage: 1,
          stageName: 'Friendly Reminder',
          warningTone: 'gentle',
          formattedAmount,
          isDraftOnly: true,
          subject: 'Friendly Reminder: Outstanding Invoice Statement — Babin Rentals',
          body: `Namaste ${profile.clientName} Sir/Ma'am,\n\nWe hope your shoot concluded smoothly and successfully!\n\nThis is a gentle reminder regarding the outstanding balance of ${formattedAmount} for your recent equipment rental. Kindly arrange for the settlement at your earliest convenience.\n\nIf payment has already been initiated via bank transfer, please disregard this message or share the voucher screenshot.\n\nThank you for choosing Babin Rentals!\n\nWarm regards,\nAccounts Team\n${COMPANY_SIGNATURE}`,
        }
      } else if (overdueDays <= 4) {
        dueRecoveryDraft = {
          stage: 2,
          stageName: 'Payment Follow-up',
          warningTone: 'followup',
          formattedAmount,
          isDraftOnly: true,
          subject: `Payment Follow-up: Statement for ${profile.clientName} — ${formattedAmount}`,
          body: `Namaste ${profile.clientName} Sir/Ma'am,\n\nFollowing up on our earlier statement, we have not yet received payment of ${formattedAmount}.\n\nCould you please confirm the payment timeline today or update us on when the transfer is scheduled? Our team is available if you need an updated ledger copy or account details.\n\nBest regards,\nBabin Rentals Operations\n${COMPANY_SIGNATURE}`,
        }
      } else if (overdueDays <= 6) {
        dueRecoveryDraft = {
          stage: 3,
          stageName: 'Urgent Notice (Hold Warning)',
          warningTone: 'urgent',
          formattedAmount,
          isDraftOnly: true,
          subject: `URGENT: Outstanding Balance Past Due (${formattedAmount}) — Account Notice`,
          body: `Dear ${profile.clientName} Sir/Ma'am,\n\nThis is an urgent notice regarding your overdue balance of ${formattedAmount}, which remains unsettled.\n\nPer company operating policy, open dues exceeding 5 days trigger a temporary operational hold on future gear reservations. We kindly request that you settle this balance within 24 hours to ensure uninterrupted service.\n\nSincerely,\nManagement\n${COMPANY_SIGNATURE}`,
        }
      } else {
        dueRecoveryDraft = {
          stage: 4,
          stageName: 'Final Notice (Account Freeze)',
          warningTone: 'hold',
          formattedAmount,
          isDraftOnly: true,
          subject: `FINAL NOTICE: Account Freeze Pending Settlement (${formattedAmount})`,
          body: `Dear ${profile.clientName},\n\nYour account balance of ${formattedAmount} is now seriously overdue (${overdueDays} days) and has entered formal management review.\n\nAll active and upcoming gear bookings have been placed on HOLD pending full clearance of this balance. Please contact management immediately at 9712052571 to clear this matter today.\n\nBabin Rentals Executive Office\n${COMPANY_SIGNATURE}`,
        }
      }

      advices.push({
        id: `adv-client-overdue-${profile.clientId}`,
        module: 'client',
        target,
        evidenceState: 'supported',
        severity: overdueDays >= 5 ? 'urgent' : 'review',
        explanation: `Client account has past-due balance of ${formattedAmount} (${overdueDays} day(s) overdue). Staged recovery draft (Stage ${dueRecoveryDraft.stage}: ${dueRecoveryDraft.stageName}) generated for staff review.`,
        sourceRefs: ['references/client_personas.md'],
        sourceKinds: ['live_os'],
        snapshotAt: nowIso,
        requiredChecks: [
          'Review drafted recovery message with manager before sending',
          overdueDays >= 5 ? 'Hold new bookings pending settlement' : 'Confirm transfer voucher receipt',
        ],
      })
    }
  }

  const overallState: EvidenceState = sampleSizeConfidence === 'low' ? 'needs_verification' : 'supported'

  return {
    clientId: profile.clientId,
    clientName: profile.clientName,
    persona,
    title,
    tone,
    technicalDepth,
    safeguards,
    trustFactor,
    sampleSizeConfidence,
    dueRecoveryDraft,
    isMoneyMasked,
    advices,
    evidenceState: overallState,
  }
}
