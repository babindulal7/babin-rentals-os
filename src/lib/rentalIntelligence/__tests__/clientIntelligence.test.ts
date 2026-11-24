import { describe, it, expect } from 'vitest'
import {
  evaluateClientIntelligence,
  type ClientProfileInput,
} from '../clientIntelligence'
import { rupees } from '../../money'

describe('Rental Intelligence RI-04: Client Intelligence Engine', () => {
  it('classifies corporate/agency client with formal SLA safeguards', () => {
    const input: ClientProfileInput = {
      clientId: 'CL-CORP-01',
      clientName: 'Nepal Ad Agency Pvt. Ltd.',
      orderCount: 4,
      flags: ['corporate', 'agency'],
    }

    const result = evaluateClientIntelligence(input, 'Coordinator')
    expect(result.persona).toBe('corporate_event')
    expect(result.title).toBe('Corporate / Commercial Agency')
    expect(result.safeguards).toContain('Formal invoice with PAN')
    expect(result.safeguards).toContain('Official purchase order acknowledgment')
    expect(result.trustFactor).toBe(1.0)
    expect(result.sampleSizeConfidence).toBe('high')
    expect(result.evidenceState).toBe('supported')
  })

  it('classifies seasoned DP with high trust factor (0.2 reduced barrier)', () => {
    const input: ClientProfileInput = {
      clientId: 'CL-DP-01',
      clientName: 'Suman Shrestha',
      orderCount: 12,
      flags: ['dop', 'cinematographer'],
    }

    const result = evaluateClientIntelligence(input, 'Manager')
    expect(result.persona).toBe('seasoned_pro')
    expect(result.title).toBe('Seasoned Professional / DP')
    expect(result.technicalDepth).toContain('High')
    expect(result.trustFactor).toBe(0.2)
    expect(result.sampleSizeConfidence).toBe('high')
  })

  it('classifies creative beginner with educational tone and Caretaker guidance for cinema optics', () => {
    const input: ClientProfileInput = {
      clientId: 'CL-BEG-01',
      clientName: 'Aayush Pradhan',
      orderCount: 1,
      flags: ['student', 'beginner'],
      preferredCategories: ['Anamorphic Lenses'],
    }

    const result = evaluateClientIntelligence(input, 'Coordinator')
    expect(result.persona).toBe('creative_beginner')
    expect(result.title).toBe('Creative Beginner / Emerging Filmmaker')
    expect(result.safeguards).toContain('Mandatory operational briefing at handover')

    const caretakerAdvice = result.advices.find((a) => a.id.includes('beginner-guard'))
    expect(caretakerAdvice).toBeDefined()
    expect(caretakerAdvice?.explanation).toContain('Caretaker attendance is recommended')
  })

  it('flags low sample size uncertainty when order count is 0 (RI-A16)', () => {
    const input: ClientProfileInput = {
      clientId: 'CL-NEW-01',
      clientName: 'Brand New Client',
      orderCount: 0,
      flags: [],
    }

    const result = evaluateClientIntelligence(input, 'Coordinator')
    expect(result.sampleSizeConfidence).toBe('low')
    expect(result.evidenceState).toBe('needs_verification')

    const sampleAdvice = result.advices.find((a) => a.id.includes('sample'))
    expect(sampleAdvice).toBeDefined()
    expect(sampleAdvice?.evidenceState).toBe('needs_verification')
    expect(sampleAdvice?.explanation).toContain('tentative; observe first handover')
  })

  describe('Staged Due Recovery Drafts (RI-A17)', () => {
    const baseOverdueInput: ClientProfileInput = {
      clientId: 'CL-DUE-01',
      clientName: 'Kathmandu Visuals',
      orderCount: 6,
      outstandingBalancePaisa: rupees(45000),
    }

    it('generates Stage 1 Friendly Reminder on Day 1', () => {
      const result = evaluateClientIntelligence(
        { ...baseOverdueInput, overdueDays: 1 },
        'Accounts',
      )

      expect(result.dueRecoveryDraft).toBeDefined()
      expect(result.dueRecoveryDraft?.stage).toBe(1)
      expect(result.dueRecoveryDraft?.stageName).toBe('Friendly Reminder')
      expect(result.dueRecoveryDraft?.warningTone).toBe('gentle')
      expect(result.dueRecoveryDraft?.subject).toContain('Friendly Reminder')
      expect(result.dueRecoveryDraft?.body).toContain('Rs 45,000')
      expect(result.dueRecoveryDraft?.isDraftOnly).toBe(true)
    })

    it('generates Stage 2 Payment Follow-up on Day 3', () => {
      const result = evaluateClientIntelligence(
        { ...baseOverdueInput, overdueDays: 3 },
        'Manager',
      )

      expect(result.dueRecoveryDraft).toBeDefined()
      expect(result.dueRecoveryDraft?.stage).toBe(2)
      expect(result.dueRecoveryDraft?.stageName).toBe('Payment Follow-up')
      expect(result.dueRecoveryDraft?.warningTone).toBe('followup')
      expect(result.dueRecoveryDraft?.subject).toContain('Payment Follow-up')
      expect(result.dueRecoveryDraft?.body).toContain('update us on when the transfer is scheduled')
    })

    it('generates Stage 3 Urgent Notice with hold warning on Day 5', () => {
      const result = evaluateClientIntelligence(
        { ...baseOverdueInput, overdueDays: 5 },
        'Owner',
      )

      expect(result.dueRecoveryDraft).toBeDefined()
      expect(result.dueRecoveryDraft?.stage).toBe(3)
      expect(result.dueRecoveryDraft?.warningTone).toBe('urgent')
      expect(result.dueRecoveryDraft?.subject).toContain('URGENT: Outstanding Balance Past Due')
      expect(result.dueRecoveryDraft?.body).toContain('temporary operational hold on future gear reservations')
    })

    it('generates Stage 4 Final Notice with account freeze warning on Day 8', () => {
      const result = evaluateClientIntelligence(
        { ...baseOverdueInput, overdueDays: 8 },
        'Owner',
      )

      expect(result.dueRecoveryDraft).toBeDefined()
      expect(result.dueRecoveryDraft?.stage).toBe(4)
      expect(result.dueRecoveryDraft?.warningTone).toBe('hold')
      expect(result.dueRecoveryDraft?.subject).toContain('FINAL NOTICE: Account Freeze Pending Settlement')
      expect(result.dueRecoveryDraft?.body).toContain('active and upcoming gear bookings have been placed on HOLD')
    })
  })

  describe('Field-Level Gating & Privacy Verification (HIS v2.1 §4)', () => {
    it('completely strips monetary due recovery draft when user is Warehouse role', () => {
      const input: ClientProfileInput = {
        clientId: 'CL-DUE-02',
        clientName: 'Floor Client',
        orderCount: 3,
        outstandingBalancePaisa: rupees(30000),
        overdueDays: 4,
      }

      const result = evaluateClientIntelligence(input, 'Warehouse')
      expect(result.isMoneyMasked).toBe(true)
      expect(result.dueRecoveryDraft).toBeUndefined()

      // The advice text must not expose the amount to Warehouse
      const overdueAdvice = result.advices.find((a) => a.id.includes('overdue'))
      expect(overdueAdvice).toBeDefined()
      expect(overdueAdvice?.explanation).not.toContain('Rs')
      expect(overdueAdvice?.explanation).not.toContain('30,000')
      expect(overdueAdvice?.explanation).toContain('Commercial figures omitted under field-level gating')
    })

    it('completely strips monetary due recovery draft when surface is floor', () => {
      const input: ClientProfileInput = {
        clientId: 'CL-DUE-03',
        clientName: 'Floor Surface Client',
        orderCount: 3,
        outstandingBalancePaisa: rupees(30000),
        overdueDays: 4,
      }

      const result = evaluateClientIntelligence(input, 'Coordinator', 'floor')
      expect(result.isMoneyMasked).toBe(true)
      expect(result.dueRecoveryDraft).toBeUndefined()
    })
  })
})
