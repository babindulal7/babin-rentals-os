import { describe, it, expect } from 'vitest'
import {
  isMonsoonDate,
  evaluateMonsoonRisk,
  generateMonsoonAdvice,
  MONSOON_STANDARD_FEES,
} from '../monsoonEngine'

describe('Rental Intelligence RI-06: Monsoon & Environmental Protection Engine', () => {
  it('identifies monsoon season active between June 1 and September 30', () => {
    expect(isMonsoonDate('2026-07-15T12:00:00Z')).toBe(true)
    expect(isMonsoonDate('2026-06-01T00:00:00Z')).toBe(true)
    expect(isMonsoonDate('2026-09-30T23:59:59Z')).toBe(true)
    expect(isMonsoonDate('2026-12-15T12:00:00Z')).toBe(false)
    expect(isMonsoonDate('2026-04-10T12:00:00Z')).toBe(false)
  })

  it('triggers active monsoon protocol for outdoor shoots in July with 24h dry-cabinet bake and rain cover fee', () => {
    const assessment = evaluateMonsoonRisk({
      targetId: 'BK-MONSOON-01',
      targetDateIso: '2026-07-20T10:00:00Z',
      isOutdoor: true,
      items: [{ name: 'Sony FX3A Cinema Body' }, { name: 'Sony 24-70 GM II' }],
      location: 'Godavari Outdoors',
    })

    expect(assessment.monsoonModeActive).toBe(true)
    expect(assessment.isOutdoor).toBe(true)
    expect(assessment.dispatchRequirements).toContain(
      'Equip camera body and matte box with heavy-duty weatherproof rain poncho.',
    )
    expect(assessment.returnQcRequirements).toContain(
      'Any gear returning damp must be routed to Cleaning Quarantine for 24-hour dry-cabinet bake before returning to Available.',
    )
    expect(assessment.suggestedFeeLines).toHaveLength(1)
    expect(assessment.suggestedFeeLines[0].amountPaisa).toBe(
      MONSOON_STANDARD_FEES.rainCoverRentalPaisa,
    )
    expect(assessment.suggestedFeeLines[0].amountPaisa).toBe(50000) // Rs 500
  })

  it('triggers high-altitude cold weather battery derating and teahouse acclimatization in Mustang/Manang', () => {
    const assessment = evaluateMonsoonRisk({
      targetId: 'BK-COLD-01',
      targetDateIso: '2026-11-15T10:00:00Z',
      isOutdoor: true,
      items: [{ name: 'Sony FX3A' }, { name: 'Tamron 70-180' }],
      location: 'Upper Mustang (3,800m)',
    })

    expect(assessment.isHighAltitudeCold).toBe(true)
    expect(assessment.dispatchRequirements.some((r) => r.includes('Lithium-ion battery capacity drops ~40%'))).toBe(true)
    expect(assessment.dispatchRequirements.some((r) => r.includes('45-60 minutes'))).toBe(true)
    expect(assessment.warningNotes.some((w) => w.includes('3.5% wattage per 1,000ft'))).toBe(true)
  })

  it('triggers active cooling fan rules for extreme heat in Terai/summer sun', () => {
    const assessment = evaluateMonsoonRisk({
      targetId: 'BK-HEAT-01',
      targetDateIso: '2026-05-15T10:00:00Z',
      isOutdoor: true,
      items: [{ name: 'RED Komodo-X' }],
      location: 'Nepalgunj Terai',
    })

    expect(assessment.dispatchRequirements.some((r) => r.includes('Adaptive Preview Quiet Record'))).toBe(true)
    expect(assessment.dispatchRequirements.some((r) => r.includes('Sony FX3 Fan to Always On'))).toBe(true)
  })

  it('enforces Invariant RI-A23: monsoon assessment is strictly advisoryOnly without mutating DB or locking inventory', () => {
    const assessment = evaluateMonsoonRisk({
      targetId: 'BK-TEST-01',
      targetDateIso: '2026-07-15T12:00:00Z',
      isOutdoor: true,
      items: [{ name: 'Sony FX3A' }],
    })

    expect(assessment.advisoryOnly).toBe(true)
  })

  it('generates role-safe advice that strips fees for Warehouse and Technician roles', () => {
    const assessment = evaluateMonsoonRisk({
      targetId: 'BK-ROLE-01',
      targetDateIso: '2026-07-15T12:00:00Z',
      isOutdoor: true,
      items: [{ name: 'Sony FX3A' }],
    })

    const ownerAdvice = generateMonsoonAdvice(assessment, 'BK-ROLE-01', 'Owner', 'default')
    expect(ownerAdvice).not.toBeNull()
    expect(ownerAdvice?.explanation).toContain('Suggested Fee Items')
    expect(ownerAdvice?.explanation).toContain('Rs 500')

    const warehouseAdvice = generateMonsoonAdvice(assessment, 'BK-ROLE-01', 'Warehouse', 'floor')
    expect(warehouseAdvice).not.toBeNull()
    expect(warehouseAdvice?.explanation).toContain('ACTIVE MONSOON PROTOCOL')
    expect(warehouseAdvice?.explanation).toContain('Return Inspection')
    expect(warehouseAdvice?.explanation).not.toContain('Suggested Fee Items')
    expect(warehouseAdvice?.explanation).not.toContain('Rs 500')
    expect(warehouseAdvice?.explanation).not.toContain('5,000')
  })

  it('returns null advice during dry season for indoor standard rentals', () => {
    const assessment = evaluateMonsoonRisk({
      targetId: 'BK-INDOOR-01',
      targetDateIso: '2026-12-15T12:00:00Z',
      isOutdoor: false,
      items: [{ name: 'Sony FX3A' }],
      location: 'Kathmandu Indoor Studio',
    })

    const advice = generateMonsoonAdvice(assessment, 'BK-INDOOR-01', 'Coordinator')
    expect(advice).toBeNull()
  })
})
