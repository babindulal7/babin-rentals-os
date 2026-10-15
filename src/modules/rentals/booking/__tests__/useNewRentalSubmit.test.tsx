// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useNewRentalSubmit, type UseNewRentalSubmitOptions } from '../useNewRentalSubmit'
import { createRental } from '../../../../actions/rentals/createRental'
import { confirmRental } from '../../../../actions/rentals/confirmRental'
import { convertDraft } from '../../../../actions/rentals/saveDraft'
import type { ClientRecord } from '../../../../lib/queries/clients'
import type { PricingPipelineResult } from '../../../../lib/pricingPipeline'
import type { Paisa } from '../../../../lib/money'

vi.mock('../../../../actions/rentals/createRental', () => ({
  createRental: vi.fn().mockResolvedValue({
    bookingId: 'test-booking-id-123',
    bookingNo: '6',
    stage: 'Quote',
  }),
  deliveryTypeFromLabel: vi.fn().mockReturnValue('Pickup'),
}))

vi.mock('../../../../actions/rentals/confirmRental', () => ({
  confirmRental: vi.fn().mockResolvedValue({
    bookingId: 'test-booking-id-123',
    bookingNo: '6',
    stage: { from: 'Quote', to: 'Booked' },
  }),
}))

vi.mock('../../../../actions/rentals/saveDraft', () => ({
  convertDraft: vi.fn().mockResolvedValue({}),
  saveDraft: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('../../../../lib/queries/availability', () => ({
  planCreationUnits: vi.fn().mockResolvedValue(null),
}))

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

describe('useNewRentalSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createRental).mockResolvedValue({ success: true, bookingId: 'test-booking-id-123', bookingNo: '6', stage: 'Quote', lineCount: 0, replayed: false, crewLines: 0, transportWritten: false })
    vi.mocked(confirmRental).mockResolvedValue({ success: true, bookingId: 'test-booking-id-123', bookingNo: '6', clientId: 'client-db-1', stage: { from: 'Quote', to: 'Booked' }, lines: 0, units: 0, unitsReserved: 0, quantityReserved: 0, quantityHolds: 0 })
    vi.mocked(convertDraft).mockResolvedValue({} as Awaited<ReturnType<typeof convertDraft>>)
  })

  it.each(['success', 'rapid repeat', 'confirm retry', 'draft link retry', 'create retry', 'blocked', 'no session', 'missing client'] as const)('handles %s without losing the booking identity', async (scenario) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const showSuccessToast = vi.fn()
    const setConfirmedSuccess = vi.fn()
    const setSaveState = vi.fn()
    const setActionError = vi.fn()
    const setSavedDraftFingerprint = vi.fn()

    const confirmKey = { current: null }
    const draftBookingKey = { current: null }

    let submitHook!: ReturnType<typeof useNewRentalSubmit>

    const dummyClient = {
      dbId: 'client-db-1',
      id: 'CL-001',
      name: 'Test Client',
      phone: '9841000000',
      email: 'test@example.com',
      company: 'Test Co',
      address: 'Kathmandu',
      pan: '123456789',
      creditLimitPaisa: 0 as Paisa,
      active_rentals_count: 0,
      risk_tier: 'Low',
      health_score: 95,
      flags: [],
      notes: '',
      has_signed_agreement: true,
      requires_deposit: false,
      is_flagged: false,
    } as unknown as ClientRecord

    const dummyPricing = {
      securityDeposit: { requiredPaisa: 0 },
      discounts: { discountPaisa: 0, appliedPercent: 0 },
    } as unknown as PricingPipelineResult

    let releaseCreate: (() => void) | undefined
    if (scenario === 'rapid repeat') {
      vi.mocked(createRental).mockImplementationOnce(() => new Promise((resolve) => {
        releaseCreate = () => resolve({ success: true, bookingId: 'test-booking-id-123', bookingNo: '6', stage: 'Quote', lineCount: 0, replayed: false, crewLines: 0, transportWritten: false })
      }))
    }
    if (scenario === 'confirm retry') vi.mocked(confirmRental).mockRejectedValueOnce(new Error('Confirmation unavailable'))
    if (scenario === 'draft link retry') vi.mocked(convertDraft).mockRejectedValueOnce(new Error('Draft link unavailable'))
    if (scenario === 'create retry') vi.mocked(createRental).mockRejectedValueOnce(new Error('Connection interrupted'))
    const overrides: Partial<UseNewRentalSubmitOptions> = scenario === 'blocked' ? { confirmBlocked: true }
      : scenario === 'no session' ? { dispatchContext: () => null }
      : scenario === 'missing client' ? { client: null }
      : scenario === 'draft link retry' ? { draftId: 'draft-1' } : {}

    function TestComponent() {
      submitHook = useNewRentalSubmit({
        confirmBlocked: false,
        saveState: 'saved',
        setSaveState,
        dispatchContext: () => ({ userId: 'user-1', role: 'Coordinator' }),
        setActionError,
        setConfirmedSuccess,
        showSuccessToast,
        client: dummyClient,
        lines: [],
        equipmentLines: [],
        project: 'Feature Film A',
        pickupAt: new Date('2026-11-01T09:00:00Z'),
        returnAt: new Date('2026-11-03T18:00:00Z'),
        deliveryType: 'Client Pickup',
        pricing: dummyPricing,
        manualDiscountReason: '',
        manualDiscountAuthorizedBy: '',
        womenDopEligible: false,
        crew: [],
        clientPickup: true,
        deliveryChargePaisa: 0 as any,
        fuelChargePaisa: 0 as any,
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
        draftData: {} as any,
        setSavedDraftFingerprint,
        kind: 'Feature Film',
        kindOther: '',
        confirmKey,
        draftBookingKey,
        ...overrides,
      })
      return null
    }

    try {
      await act(async () => {
        root.render(<TestComponent />)
      })

      await act(async () => {
        submitHook.confirmBooking()
        if (scenario === 'rapid repeat') submitHook.confirmBooking()
      })
      if (scenario === 'blocked' || scenario === 'no session' || scenario === 'missing client') {
        expect(createRental).not.toHaveBeenCalled()
        expect(confirmRental).not.toHaveBeenCalled()
        expect(showSuccessToast).not.toHaveBeenCalled()
        if (scenario !== 'blocked') expect(setActionError).toHaveBeenCalledWith(expect.stringContaining('Not confirmed'))
        return
      }
      if (scenario === 'rapid repeat') {
        expect(createRental).toHaveBeenCalledTimes(1)
        await act(async () => releaseCreate?.())
      }
      if (scenario === 'confirm retry' || scenario === 'draft link retry' || scenario === 'create retry') {
        expect(setSaveState).toHaveBeenCalledWith('error')
        expect(showSuccessToast).not.toHaveBeenCalled()
        await act(async () => { submitHook.confirmBooking() })
      }
      expect(createRental).toHaveBeenCalledTimes(scenario === 'create retry' ? 2 : 1)
      if (scenario === 'create retry') {
        expect(vi.mocked(createRental).mock.calls[0]?.[0].clientUuid).toBe(vi.mocked(createRental).mock.calls[1]?.[0].clientUuid)
      }
      expect(confirmRental).toHaveBeenCalledTimes(scenario === 'confirm retry' ? 2 : 1)
      if (scenario === 'confirm retry') {
        expect(vi.mocked(confirmRental).mock.calls[0]?.[0].id).toBe(vi.mocked(confirmRental).mock.calls[1]?.[0].id)
      }
      if (scenario === 'draft link retry') expect(convertDraft).toHaveBeenCalledTimes(2)

      // Toast must be dispatched per Law 12
      expect(showSuccessToast).toHaveBeenCalledTimes(1)
      expect(showSuccessToast).toHaveBeenCalledWith('Booking Confirmed', 'Rental 6 is now Booked')

      // Modal state and save state must be updated
      expect(setSaveState).toHaveBeenCalledWith('saved')
      expect(setConfirmedSuccess).toHaveBeenCalledWith({
        bookingId: 'test-booking-id-123',
        bookingNo: '6',
      })
    } finally {
      await act(async () => {
        root.unmount()
      })
      host.remove()
    }
  })
})
