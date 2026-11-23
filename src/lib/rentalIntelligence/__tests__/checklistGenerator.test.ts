import { describe, it, expect } from 'vitest'
import {
  generateOperationalChecklist,
  type BookingLineForChecklist,
} from '../checklistGenerator'

describe('Rental Intelligence RI-08: Checklist Generator Engine', () => {
  const sampleBookingLines: BookingLineForChecklist[] = [
    {
      id: 'LINE-01',
      productId: 'BRPI-SONY-FX3A-BODY',
      displayName: 'Sony FX3A Cinema Body',
      dispatchedQuantity: 1,
      serialNumbers: ['FX3-2024-0012'],
    },
    {
      id: 'LINE-02',
      productId: 'BRPI-CHIOPT-XTREME-ZOOM-SET',
      displayName: 'CHIOPT 28-85mm Cinema Zoom',
      dispatchedQuantity: 1,
      serialNumbers: ['CH-2885-004'],
    },
    {
      id: 'LINE-03',
      productId: 'BRPI-APUTURE-600X-PRO',
      displayName: 'Aputure LS 600x Pro',
      dispatchedQuantity: 1,
      serialNumbers: ['AP-600X-008'],
    },
  ]

  it('generates pack stage checklist with model-specific verification items', () => {
    const result = generateOperationalChecklist({
      bookingId: 'BK-PACK-001',
      stage: 'pack',
      lines: sampleBookingLines,
    })

    expect(result.stage).toBe('pack')
    expect(result.items.some((i) => i.id.includes('serial-match'))).toBe(true)
    expect(result.items.some((i) => i.id.includes('power-test'))).toBe(true)
    expect(result.items.some((i) => i.id.includes('media-format'))).toBe(true)
    expect(result.items.some((i) => i.id.includes('fx3-audio-handle'))).toBe(true)
    expect(result.items.some((i) => i.id.includes('chiopt-support-bracket'))).toBe(true)
    expect(result.items.some((i) => i.id.includes('sandbags'))).toBe(true)
  })

  it('generates handover stage checklist with client identity and deposit verification', () => {
    const result = generateOperationalChecklist({
      bookingId: 'BK-HANDOVER-001',
      stage: 'handover',
      lines: sampleBookingLines,
    })

    expect(result.stage).toBe('handover')
    expect(result.items.some((i) => i.id.includes('handover-identity'))).toBe(true)
    expect(result.items.some((i) => i.id.includes('handover-cosmetic-signoff'))).toBe(true)
    expect(result.items.some((i) => i.id.includes('handover-deposit-verification'))).toBe(true)
  })

  it('generates return checklist and handles partial returns cleanly (RI-A19)', () => {
    const partialLines: BookingLineForChecklist[] = [
      {
        id: 'LINE-01',
        productId: 'BRPI-SONY-FX3A-BODY',
        displayName: 'Sony FX3A Cinema Body',
        dispatchedQuantity: 2,
        returnedQuantity: 1, // 1 of 2 returned
        serialNumbers: ['FX3-001'],
      },
    ]

    const result = generateOperationalChecklist({
      bookingId: 'BK-PARTIAL-001',
      stage: 'return',
      lines: partialLines,
      isPartialReturn: true,
    })

    expect(result.stage).toBe('return')
    const partialAdv = result.advices.find((a) => a.id.includes('partial-return'))
    expect(partialAdv).toBeDefined()
    expect(partialAdv?.explanation).toContain('PARTIAL RETURN IN PROGRESS')
    expect(partialAdv?.explanation).toContain('Remaining unreturned items stay active in client custody')
  })

  it('enforces monsoon dry-cabinet quarantine task during active monsoon season', () => {
    const resultReturn = generateOperationalChecklist({
      bookingId: 'BK-MONSOON-RET-001',
      stage: 'return',
      lines: sampleBookingLines,
      isMonsoonSeason: true,
    })

    expect(resultReturn.items.some((i) => i.id.includes('monsoon-moisture'))).toBe(true)

    const resultReset = generateOperationalChecklist({
      bookingId: 'BK-MONSOON-RST-001',
      stage: 'reset',
      lines: sampleBookingLines,
      isMonsoonSeason: true,
    })

    expect(resultReset.items.some((i) => i.id.includes('dry-cabinet-bake'))).toBe(true)
  })

  it('enforces operational invariant: local checklist does not fake DB custody completion (RI-A20)', () => {
    const result = generateOperationalChecklist({
      bookingId: 'BK-INVARIANT-001',
      stage: 'pack',
      lines: sampleBookingLines,
    })

    const guardAdv = result.advices.find((a) => a.id.includes('advisory-guard'))
    expect(guardAdv).toBeDefined()
    expect(guardAdv?.explanation).toContain('OPERATIONAL INVARIANT')
    expect(guardAdv?.explanation).toContain('Checking local UI boxes does NOT mark the operational stage as complete')
  })

  it('estimates prep minutes and Kathmandu delivery load accurately', () => {
    // Heavy lighting + cinema zoom package -> heavy van or two staff
    const result = generateOperationalChecklist({
      bookingId: 'BK-PREP-001',
      stage: 'pack',
      lines: sampleBookingLines,
    })

    expect(result.estimatedPrepMinutes).toBeGreaterThanOrEqual(45)
    expect(result.deliveryLoadCategory).toMatch(/heavy_van|two_staff_required/)
    expect(result.deliveryLoadGuidance.length).toBeGreaterThan(0)
  })
})
