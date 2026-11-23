import { describe, it, expect } from 'vitest'
import {
  evaluateKitIntelligence,
  evaluateRigPayloadSafety,
  evaluatePowerCircuitSafety,
  evaluateBatteryRuntime,
  explainQuoteTotals,
  evaluateMonsoonAdvisory,
  filterAdviceForRole,
} from '../adapters'
import { RENTAL_INTELLIGENCE_MODULES } from '../types'
import { rupees } from '../../money'

describe('Rental Intelligence: Architecture & Module Taxonomy', () => {
  it('defines exactly 11 distinct unique modules without duplicates', () => {
    expect(RENTAL_INTELLIGENCE_MODULES.length).toBe(11)
    const ids = RENTAL_INTELLIGENCE_MODULES.map((m) => m.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(11)
  })

  it('correctly marks working P0 modules vs planned modules', () => {
    const working = RENTAL_INTELLIGENCE_MODULES.filter((m) => m.status === 'working')
    const workingIds = working.map((m) => m.id)
    expect(workingIds).toContain('kit')
    expect(workingIds).toContain('safety')
    expect(workingIds).toContain('quote_explanation')
    expect(workingIds).toContain('monsoon')

    const planned = RENTAL_INTELLIGENCE_MODULES.filter((m) => m.status === 'planned')
    expect(planned.length).toBe(7)
  })
})

describe('Rental Intelligence RI-01: Kit Intelligence Adapter', () => {
  it('detects missing mandatory V-Mount power and CFexpress Type B on RED Komodo-X', () => {
    const advices = evaluateKitIntelligence({
      bookingId: 'BK-TEST-001',
      items: [{ name: 'RED Komodo-X Cinema Body' }],
    })

    expect(advices.length).toBe(1)
    const adv = advices[0]!
    expect(adv.module).toBe('kit')
    expect(adv.evidenceState).toBe('needs_verification')
    expect(adv.severity).toBe('review')
    expect(adv.suggestedAdditions?.some((a) => a.productId.includes('VMOUNT'))).toBe(true)
    expect(adv.suggestedAdditions?.some((a) => a.productId.includes('CFX-B'))).toBe(true)
  })

  it('marks RED Komodo-X kit as supported when V-Mount and CFexpress B are included', () => {
    const advices = evaluateKitIntelligence({
      bookingId: 'BK-TEST-002',
      items: [
        { name: 'RED Komodo-X Cinema Body' },
        { name: '99Wh V-Mount Battery Pack' },
        { name: 'CFexpress Type B 512GB Card' },
      ],
    })

    expect(advices.length).toBe(1)
    expect(advices[0]!.evidenceState).toBe('supported')
    expect(advices[0]!.severity).toBe('info')
    expect(advices[0]!.suggestedAdditions).toBeUndefined()
  })

  it('enforces non-overrideable HARD BLOCK on Ronin 4D + external handheld gimbal', () => {
    const advices = evaluateKitIntelligence({
      bookingId: 'BK-TEST-003',
      items: [{ name: 'DJI Ronin 4D 6K Combo' }, { name: 'DJI RS4 Pro Gimbal' }],
    })

    const roninBlock = advices.find((a) => a.id.includes('ronin-block'))
    expect(roninBlock).toBeDefined()
    expect(roninBlock?.evidenceState).toBe('blocked')
    expect(roninBlock?.severity).toBe('urgent')
    expect(roninBlock?.explanation).toContain('HARD BLOCK')
    expect(roninBlock?.blockingReasons?.length).toBeGreaterThan(0)
  })

  it('enforces mount damage HARD BLOCK on heavy CHIOPT zoom without rods and support bracket', () => {
    const advices = evaluateKitIntelligence({
      bookingId: 'BK-TEST-004',
      items: [{ name: 'CHIOPT 28-85mm Cinema Zoom' }, { name: 'Sony FX3A' }],
    })

    const chioptBlock = advices.find((a) => a.id.includes('chiopt-support'))
    expect(chioptBlock).toBeDefined()
    expect(chioptBlock?.evidenceState).toBe('blocked')
    expect(chioptBlock?.severity).toBe('urgent')
    expect(chioptBlock?.suggestedAdditions?.[0]?.displayName).toContain('15mm Rods')
  })

  it('passes CHIOPT zoom when 15mm rods and lens support are present', () => {
    const advices = evaluateKitIntelligence({
      bookingId: 'BK-TEST-005',
      items: [
        { name: 'CHIOPT 28-85mm Cinema Zoom' },
        { name: 'Sony FX3A' },
        { name: '15mm Rods & Heavy Lens Support Bracket' },
        { name: 'NP-FZ100 Battery' },
        { name: 'CFexpress Type A' },
      ],
    })

    const chioptBlock = advices.find((a) => a.id.includes('chiopt-support'))
    expect(chioptBlock).toBeUndefined()
  })

  it('fails closed when live inventory availability check flags a unit conflict or hold', () => {
    const advices = evaluateKitIntelligence({
      bookingId: 'BK-TEST-006',
      items: [{ id: 'PRD-01', name: 'Sony FX3A' }],
      availabilityMap: { 'PRD-01': false },
    })

    const availAdv = advices.find((a) => a.id.includes('avail-PRD-01'))
    expect(availAdv).toBeDefined()
    expect(availAdv?.evidenceState).toBe('needs_verification')
    expect(availAdv?.severity).toBe('urgent')
    expect(availAdv?.blockingReasons?.[0]).toContain('Unit conflict or hold')
  })
})

describe('Rental Intelligence RI-10: Safety Validation Adapter', () => {
  it('validates tripod 30% safety headroom: 3.5kg on 10kg passes (35% <= 70%)', () => {
    const adv = evaluateRigPayloadSafety({
      targetId: 'TRIPOD-01',
      rigWeightKg: 3.5,
      supportRatingKg: 10.0,
      supportType: 'tripod',
    })

    expect(adv.evidenceState).toBe('supported')
    expect(adv.severity).toBe('info')
    expect(adv.explanation).toContain('well within the safe 70% operational ceiling')
  })

  it('rejects tripod overload: 7.5kg on 10kg fails (75% > 70% safe limit)', () => {
    const adv = evaluateRigPayloadSafety({
      targetId: 'TRIPOD-02',
      rigWeightKg: 7.5,
      supportRatingKg: 10.0,
      supportType: 'tripod',
    })

    expect(adv.evidenceState).toBe('needs_verification')
    expect(adv.severity).toBe('urgent')
    expect(adv.explanation).toContain('SAFETY RISK')
    expect(adv.blockingReasons?.[0]).toContain('exceeds safe 70%')
  })

  it('validates gimbal dynamic motor strain: 1.85kg on 3.0kg RS3 passes (< 85%)', () => {
    const adv = evaluateRigPayloadSafety({
      targetId: 'GIMBAL-01',
      rigWeightKg: 1.85,
      supportRatingKg: 3.0,
      supportType: 'gimbal',
    })

    expect(adv.evidenceState).toBe('supported')
    expect(adv.severity).toBe('info')
  })

  it('rejects gimbal motor strain when payload exceeds 85% limit', () => {
    const adv = evaluateRigPayloadSafety({
      targetId: 'GIMBAL-02',
      rigWeightKg: 2.8,
      supportRatingKg: 3.0, // 2.8 / 3.0 = 93.3% > 85%
      supportType: 'gimbal',
    })

    expect(adv.evidenceState).toBe('needs_verification')
    expect(adv.severity).toBe('urgent')
    expect(adv.explanation).toContain('MOTOR OVERLOAD RISK')
  })

  it('validates electrical circuit: 720W Aputure 600x on 230V 15A socket passes safely', () => {
    const adv = evaluatePowerCircuitSafety({
      targetId: 'PWR-01',
      watts: 720,
    })

    expect(adv.evidenceState).toBe('supported')
    expect(adv.severity).toBe('info')
  })

  it('blocks electrical overload: 3,100W on single 15A socket triggers overload block (>2,760W safe threshold)', () => {
    const adv = evaluatePowerCircuitSafety({
      targetId: 'PWR-02',
      watts: 3100,
    })

    expect(adv.evidenceState).toBe('blocked')
    expect(adv.severity).toBe('urgent')
    expect(adv.explanation).toContain('ELECTRICAL OVERLOAD BLOCKED')
    expect(adv.blockingReasons?.[0]).toContain('exceeds single 15A circuit')
  })

  it('computes battery runtime with 40% derating in cold high-altitude conditions (-10°C Mustang)', () => {
    const advWarm = evaluateBatteryRuntime({
      targetId: 'BATT-01',
      batteryWh: 99,
      rigWatts: 15,
      coldWeather: false,
    })
    expect(advWarm.explanation).toContain('~5.6 hours')

    const advCold = evaluateBatteryRuntime({
      targetId: 'BATT-02',
      batteryWh: 99,
      rigWatts: 15,
      coldWeather: true,
    })
    expect(advCold.explanation).toContain('~3.4 hours')
    expect(advCold.severity).toBe('review')
    expect(advCold.explanation).toContain('Cold weather derating')
  })
})

describe('Rental Intelligence RI-02: Quote Explanation & Role Gating', () => {
  const quoteData = {
    bookingId: 'BK-2026-0715',
    equipmentRatePaisa: rupees(132750),
    days: 3,
    discountPercent: 7.0,
    discountReason: 'Loyalty client shoot',
    discountApprover: 'Babin (Owner)',
    vatPaisa: rupees(16049),
    totalPaisa: rupees(139506),
    depositPaisa: rupees(50000),
    advancePaidPaisa: rupees(75000),
    outstandingPaisa: rupees(64506),
  }

  it('explains transparent canonical totals to authorized Owner role with Law 5 deposit isolation', () => {
    const adv = explainQuoteTotals(quoteData, 'Owner')
    expect(adv.module).toBe('quote_explanation')
    expect(adv.explanation).toContain('Rental Total: Rs 1,39,506')
    expect(adv.explanation).toContain('Security Deposit: Rs 50,000 (held separately as liability under Law 5')
    expect(adv.explanation).toContain('Advance Received: Rs 75,000')
    expect(adv.severity).toBe('info')
  })

  it('flags unapproved discounts >10% as review warnings under Law 10', () => {
    const unapprovedDiscountData = {
      ...quoteData,
      discountPercent: 15.0,
      discountReason: 'Short',
      discountApprover: undefined,
    }

    const adv = explainQuoteTotals(unapprovedDiscountData, 'Manager')
    expect(adv.severity).toBe('review')
    expect(adv.explanation).toContain('WARNING (Law 10): Discount of 15% requires a documented reason')
  })

  it('strictly strips all monetary figures for money-blind Warehouse role', () => {
    const adv = explainQuoteTotals(quoteData, 'Warehouse')
    expect(adv.explanation).not.toContain('Rs')
    expect(adv.explanation).not.toContain('1,39,506')
    expect(adv.explanation).not.toContain('50,000')
    expect(adv.explanation).toContain('Commercial pricing, VAT, and financial balances are omitted')
  })

  it('strictly strips all monetary figures for Technician and Driver roles', () => {
    const advTech = explainQuoteTotals(quoteData, 'Technician')
    expect(advTech.explanation).not.toContain('Rs')

    const advDriver = explainQuoteTotals(quoteData, 'Driver')
    expect(advDriver.explanation).not.toContain('Rs')
  })

  it('strips monetary figures on floor surfaces even for Owner role', () => {
    const advFloor = explainQuoteTotals(quoteData, 'Owner', 'floor')
    expect(advFloor.explanation).not.toContain('Rs')
    expect(advFloor.explanation).toContain('omitted on operational floor surfaces')
  })

  it('filterAdviceForRole scrubs quote explanation advice for money-blind roles', () => {
    const advices = [
      explainQuoteTotals(quoteData, 'Owner'),
      evaluatePowerCircuitSafety({ targetId: 'P1', watts: 500 }),
    ]

    const filtered = filterAdviceForRole(advices, 'Warehouse')
    const quoteAdv = filtered.find((a) => a.module === 'quote_explanation')
    expect(quoteAdv?.explanation).not.toContain('Rs')
  })
})

describe('Rental Intelligence RI-06: Monsoon Mode Adapter', () => {
  it('activates during July (Kathmandu monsoon) with rain protection warnings', () => {
    const adv = evaluateMonsoonAdvisory('2026-07-15T00:00:00Z', true, 'BK-MONSOON-01')
    expect(adv).not.toBeNull()
    expect(adv?.module).toBe('monsoon')
    expect(adv?.severity).toBe('urgent')
    expect(adv?.explanation).toContain('ACTIVE MONSOON PROTOCOL')
    expect(adv?.explanation).toContain('24-hour dry-cabinet bake')
  })

  it('returns null during December (dry season)', () => {
    const adv = evaluateMonsoonAdvisory('2026-12-10T00:00:00Z', true, 'BK-DRY-01')
    expect(adv).toBeNull()
  })
})
