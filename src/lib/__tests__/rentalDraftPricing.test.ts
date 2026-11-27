import { describe, it, expect } from 'vitest'
import { draftInstant, calculateDraftTotal } from '../rentalDraftPricing'
import { rupees } from '../money'
import type { RentalDraftData } from '../../actions/rentals/saveDraft'

function baseDraft(overrides: Partial<RentalDraftData> = {}): RentalDraftData {
  return {
    version: 1,
    selectedClientId: 'cli-1',
    clientDbId: 'cli-1',
    clientName: 'Test Client',
    project: 'Test Shoot',
    kind: 'Commercial',
    kindOther: '',
    govId: '',
    pickup: '2026-11-10',
    pickupTime: '09:00',
    returnDate: '2026-11-12',
    returnTime: '09:00',
    deliveryType: 'Client Pickup',
    pickupLocation: '',
    returnLocation: '',
    specialInstructions: '',
    vehicle: '',
    numberPlate: '',
    driverContact: '',
    deliveryChargePaisa: rupees(0),
    fuelChargePaisa: rupees(0),
    discountPct: 0,
    vatOn: true,
    vatRatePercent: 13,
    advancePaisa: rupees(0),
    lines: [],
    crew: [],
    ...overrides,
  }
}

describe('rentalDraftPricing', () => {
  it('converts NPT date + time to UTC ISO instant and rejects empty/invalid inputs', () => {
    expect(draftInstant('', '09:00')).toBeNull()
    expect(draftInstant('2026-11-10', '')).toBeNull()
    expect(draftInstant('not-a-date', '09:00')).toBeNull()
    expect(draftInstant('2026-11-10', '09:00')).toBe('2026-11-10T03:15:00.000Z')
  })

  it('prices equipment, crew, and delivery with 13% VAT through pricingPipeline', () => {
    const total = calculateDraftTotal(
      baseDraft({
        deliveryType: 'Babin Delivery',
        deliveryChargePaisa: rupees(2000),
        fuelChargePaisa: rupees(500),
        lines: [
          {
            id: 'l-1',
            productId: 'p-1',
            name: 'FX6 Camera',
            serial: '',
            location: '',
            committedTo: '',
            qty: 1,
            days: 2,
            ratePaisa: rupees(10000),
            discountPct: 0,
            lineType: 'Equipment',
            isIncluded: false,
            category: 'Cameras',
          },
          {
            id: 'l-2',
            productId: 'p-2',
            name: 'Included Battery',
            serial: '',
            location: '',
            committedTo: '',
            qty: 2,
            days: 2,
            ratePaisa: rupees(500),
            discountPct: 0,
            lineType: 'Accessory',
            isIncluded: true,
            category: 'Power',
          },
        ],
        crew: [
          {
            crewId: 'c-1',
            name: 'Ram',
            role: 'DOP',
            phone: '',
            dayRatePaisa: rupees(5000),
            days: 2,
            overtimeDays: 0,
            accommodationPaisa: rupees(0),
            mealsPaisa: rupees(0),
          },
        ],
      }),
    )

    // Equipment: 20,000 + Crew: 10,000 + Delivery: 2,000 + Fuel: 500 = 32,500; + 13% VAT (4,225) = 36,725
    expect(total).toBe(rupees(36725))
  })

  it('ignores deliveryChargePaisa when deliveryType is Client Pickup', () => {
    const total = calculateDraftTotal(
      baseDraft({
        deliveryType: 'Client Pickup',
        deliveryChargePaisa: rupees(2000),
        vatOn: false,
        lines: [
          {
            id: 'l-1',
            productId: 'p-1',
            name: 'Lens',
            serial: '',
            location: '',
            committedTo: '',
            qty: 1,
            days: 1,
            ratePaisa: rupees(1000),
            discountPct: 0,
            lineType: 'Equipment',
            isIncluded: false,
            category: 'Lenses',
          },
        ],
      }),
    )
    expect(total).toBe(rupees(1000))
  })
})
