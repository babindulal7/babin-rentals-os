// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useNewRentalSubmit, type UseNewRentalSubmitOptions } from '../useNewRentalSubmit'
import { createRental } from '../../../../actions/rentals/createRental'
import { confirmRental } from '../../../../actions/rentals/confirmRental'
import { convertDraft } from '../../../../actions/rentals/saveDraft'
import { recordOutsourcedVehicleQuote } from '../../../../lib/queries/outsourcedVehicleQuote'
import type { ClientRecord } from '../../../../lib/queries/clients'
import type { PricingPipelineResult } from '../../../../lib/pricingPipeline'

/* S2 row 8: an outsourced vehicle needs a vendor, a typed quote and an approval note BEFORE the booking
   exists; the quote is recorded against the booking right after it is created. */

vi.mock('../../../../actions/rentals/createRental', () => ({
  createRental: vi.fn(),
  deliveryTypeFromLabel: vi.fn().mockReturnValue('Pickup'),
}))
vi.mock('../../../../actions/rentals/confirmRental', () => ({ confirmRental: vi.fn() }))
vi.mock('../../../../actions/rentals/saveDraft', () => ({
  convertDraft: vi.fn().mockResolvedValue({}),
  saveDraft: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('../../../../lib/queries/availability', () => ({ planCreationUnits: vi.fn().mockResolvedValue(null) }))
vi.mock('../../../../lib/queries/productPricingTerms', () => ({
  fetchProductPricingTerms: vi.fn().mockResolvedValue(new Map()),
}))
vi.mock('../../../../lib/queries/outsourcedVehicleQuote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/queries/outsourcedVehicleQuote')>()
  return { ...actual, recordOutsourcedVehicleQuote: vi.fn().mockResolvedValue(undefined) }
})
vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { branch_id: 'branch-1' }, error: null }),
        }),
      }),
    }),
  },
  newClientUuid: vi.fn().mockReturnValue('uuid-mock-123'),
}))

type Overrides = Partial<UseNewRentalSubmitOptions>

async function runConfirm(overrides: Overrides): Promise<{ setActionError: ReturnType<typeof vi.fn> }> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const setActionError = vi.fn()
  const client = { dbId: 'client-db-1', id: 'CL-001', name: 'Test Client', phone: '9841000000' } as unknown as ClientRecord
  const pricing = {
    securityDeposit: { requiredPaisa: 0 },
    discounts: { discountPaisa: 0, appliedPercent: 0 },
  } as unknown as PricingPipelineResult
  const sample = [
    { id: '22222222-2222-4222-8222-222222222222', name: 'Sony FX3', lineType: 'Equipment' as const, productId: '22222222-2222-4222-8222-222222222222', qty: 1, days: 2, ratePaisa: 500000 as never },
  ]
  let hook!: ReturnType<typeof useNewRentalSubmit>
  function Test() {
    hook = useNewRentalSubmit({
      confirmBlocked: false,
      saveState: 'saved',
      setSaveState: vi.fn(),
      dispatchContext: () => ({ userId: 'user-1', role: 'Coordinator' }),
      setActionError,
      setConfirmedSuccess: vi.fn(),
      showSuccessToast: vi.fn(),
      client,
      lines: sample as never,
      equipmentLines: sample as never,
      project: 'Commercial',
      pickupAt: new Date('2026-11-01T09:00:00Z'),
      returnAt: new Date('2026-11-03T18:00:00Z'),
      deliveryType: 'Babin Delivery',
      pricing,
      manualDiscountReason: '',
      manualDiscountAuthorizedBy: '',
      womenDopEligible: false,
      crew: [],
      clientPickup: false,
      deliveryChargePaisa: 250000 as never,
      fuelChargePaisa: 0 as never,
      returnPickupType: 'Client Return',
      returnPickupAddress: '',
      returnPickupTime: '18:00',
      returnPickupChargePaisa: 0,
      returnTransportPaisa: 0,
      vehicle: '',
      numberPlate: '',
      driverContact: '',
      pickupLocation: '',
      returnLocation: '',
      specialInstructions: '',
      days: 2,
      draftId: null,
      draftBookingNo: null,
      draftHasUnsavedChanges: false,
      draftData: {} as never,
      setSavedDraftFingerprint: vi.fn(),
      kind: 'Commercial',
      kindOther: '',
      confirmKey: { current: null },
      draftBookingKey: { current: null },
      ...overrides,
    })
    return null
  }
  try {
    await act(async () => {
      root.render(<Test />)
    })
    await act(async () => {
      hook.confirmBooking()
    })
  } finally {
    await act(async () => {
      root.unmount()
    })
    host.remove()
  }
  return { setActionError }
}

describe('useNewRentalSubmit: outsourced vehicle (S2 row 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createRental).mockResolvedValue({ success: true, bookingId: 'test-booking-id-123', bookingNo: '6', stage: 'Quote', lineCount: 0, replayed: false, crewLines: 0, transportWritten: false })
    vi.mocked(confirmRental).mockResolvedValue({ success: true, bookingId: 'test-booking-id-123', bookingNo: '6', clientId: 'client-db-1', stage: { from: 'Quote', to: 'Booked' }, lines: 0, units: 0, unitsReserved: 0, quantityReserved: 0, quantityHolds: 0 })
    vi.mocked(convertDraft).mockResolvedValue({} as Awaited<ReturnType<typeof convertDraft>>)
    vi.mocked(recordOutsourcedVehicleQuote).mockResolvedValue(undefined)
  })

  it('records the typed charge as the quote, with the vendor and note, once the booking exists', async () => {
    await runConfirm({ outsourcedVehicle: { vendor: '  Test Cargo  ', note: ' Quote confirmed by phone ' } })
    expect(createRental).toHaveBeenCalledTimes(1)
    expect(recordOutsourcedVehicleQuote).toHaveBeenCalledTimes(1)
    expect(recordOutsourcedVehicleQuote).toHaveBeenCalledWith('test-booking-id-123', 'uuid-mock-123', {
      vendor: 'Test Cargo',
      quotePaisa: 250000,
      approvalNote: 'Quote confirmed by phone',
    })
  })

  it('creates nothing when the approval note is missing', async () => {
    const { setActionError } = await runConfirm({ outsourcedVehicle: { vendor: 'Test Cargo', note: '   ' } })
    expect(createRental).not.toHaveBeenCalled()
    expect(recordOutsourcedVehicleQuote).not.toHaveBeenCalled()
    expect(setActionError).toHaveBeenCalledWith(expect.stringContaining('approval note'))
  })

  it('creates nothing when the vendor is missing or the typed quote is 0', async () => {
    const noVendor = await runConfirm({ outsourcedVehicle: { vendor: '', note: 'ok' } })
    expect(createRental).not.toHaveBeenCalled()
    expect(noVendor.setActionError).toHaveBeenCalledWith(expect.stringContaining('vendor'))

    vi.clearAllMocks()
    const noQuote = await runConfirm({ outsourcedVehicle: { vendor: 'Test Cargo', note: 'ok' }, deliveryChargePaisa: 0 as never })
    expect(createRental).not.toHaveBeenCalled()
    expect(noQuote.setActionError).toHaveBeenCalledWith(expect.stringContaining('quoted delivery charge'))
  })

  it('records nothing when no vehicle is outsourced, or when the client collects the equipment', async () => {
    await runConfirm({ outsourcedVehicle: null })
    expect(createRental).toHaveBeenCalledTimes(1)
    expect(recordOutsourcedVehicleQuote).not.toHaveBeenCalled()

    vi.clearAllMocks()
    vi.mocked(createRental).mockResolvedValue({ success: true, bookingId: 'b2', bookingNo: '7', stage: 'Quote', lineCount: 0, replayed: false, crewLines: 0, transportWritten: false })
    vi.mocked(confirmRental).mockResolvedValue({ success: true, bookingId: 'b2', bookingNo: '7', clientId: 'client-db-1', stage: { from: 'Quote', to: 'Booked' }, lines: 0, units: 0, unitsReserved: 0, quantityReserved: 0, quantityHolds: 0 })
    await runConfirm({ clientPickup: true, deliveryType: 'Client Pickup', outsourcedVehicle: { vendor: 'Test Cargo', note: 'ok' } })
    expect(recordOutsourcedVehicleQuote).not.toHaveBeenCalled()
  })
})
