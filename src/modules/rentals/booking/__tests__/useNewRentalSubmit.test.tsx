// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useNewRentalSubmit, type UseNewRentalSubmitOptions } from '../useNewRentalSubmit'
import { createRental } from '../../../../actions/rentals/createRental'
import { confirmRental } from '../../../../actions/rentals/confirmRental'
import { convertDraft } from '../../../../actions/rentals/saveDraft'
import type { ClientRecord } from '../../../../lib/queries/clients'
import { fetchProductPricingTerms } from '../../../../lib/queries/productPricingTerms'
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

vi.mock('../../../../lib/queries/productPricingTerms', () => ({
  fetchProductPricingTerms: vi.fn().mockResolvedValue(new Map()),
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

  it('formats lines with description and valid productId for equipment and bundle lines', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const dummyClient = {
      dbId: 'client-db-1',
      id: 'CL-001',
      name: 'Test Client',
      phone: '9841000000',
    } as unknown as ClientRecord

    const dummyPricing = {
      securityDeposit: { requiredPaisa: 0 },
      discounts: { discountPaisa: 0, appliedPercent: 0 },
    } as unknown as PricingPipelineResult

    const sampleLines = [
      {
        id: 'line-bundle-1',
        name: 'Cinema Camera Kit',
        lineType: 'Bundle' as const,
        bundleId: '11111111-1111-4111-8111-111111111111',
        qty: 1,
        days: 2,
        ratePaisa: 1000000 as any,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Sony FX3 Cinema Camera',
        lineType: 'Equipment' as const,
        productId: '22222222-2222-4222-8222-222222222222',
        qty: 1,
        days: 2,
        ratePaisa: 500000 as any,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Heavy Duty Tripod',
        // lineType undefined defaults to Equipment
        qty: 1,
        days: 2,
        ratePaisa: 100000 as any,
      },
    ]

    let submitHook!: ReturnType<typeof useNewRentalSubmit>
    function TestComponent() {
      submitHook = useNewRentalSubmit({
        confirmBlocked: false,
        saveState: 'saved',
        setSaveState: vi.fn(),
        dispatchContext: () => ({ userId: 'user-1', role: 'Coordinator' }),
        setActionError: vi.fn(),
        setConfirmedSuccess: vi.fn(),
        showSuccessToast: vi.fn(),
        client: dummyClient,
        lines: sampleLines as any,
        equipmentLines: sampleLines.slice(1) as any,
        project: 'Commercial',
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
        setSavedDraftFingerprint: vi.fn(),
        kind: 'Commercial',
        kindOther: '',
        confirmKey: { current: null },
        draftBookingKey: { current: null },
      })
      return null
    }

    try {
      await act(async () => {
        root.render(<TestComponent />)
      })

      await act(async () => {
        submitHook.confirmBooking()
      })

      expect(createRental).toHaveBeenCalledTimes(1)
      const payload = vi.mocked(createRental).mock.calls[0]?.[0]
      expect(payload?.lines).toHaveLength(3)

      // Bundle line
      expect(payload?.lines[0]).toMatchObject({
        lineType: 'Bundle',
        bundleId: '11111111-1111-4111-8111-111111111111',
        description: 'Cinema Camera Kit',
      })

      // Equipment line with explicit productId
      expect(payload?.lines[1]).toMatchObject({
        lineType: 'Equipment',
        productId: '22222222-2222-4222-8222-222222222222',
        description: 'Sony FX3 Cinema Camera',
      })

      // Equipment line with lineType undefined defaulting to Equipment and id as productId
      expect(payload?.lines[2]).toMatchObject({
        lineType: 'Equipment',
        productId: '33333333-3333-4333-8333-333333333333',
        description: 'Heavy Duty Tripod',
      })
    } finally {
      await act(async () => {
        root.unmount()
      })
      host.remove()
    }
  })

  it('sanitizes non-UUID bundleId and composite productId to null on bundle and equipment lines', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const dummyClient = {
      dbId: '11111111-2222-4333-8444-555555555555',
      id: 'CL-001',
      name: 'Test Client',
      phone: '9841000000',
    } as unknown as ClientRecord

    const dummyPricing = {
      securityDeposit: { requiredPaisa: 0 },
      discounts: { discountPaisa: 0, appliedPercent: 0 },
    } as unknown as PricingPipelineResult

    const sampleLines = [
      {
        id: 'BND-23',
        name: 'Sony FX3 Kit',
        lineType: 'Bundle' as const,
        bundleId: 'BND-23',
        qty: 1,
        days: 1,
        ratePaisa: 500000 as any,
      },
      {
        id: 'BND-23::Sony FX3 Camera Body',
        name: 'Sony FX3 Camera Body',
        lineType: 'Equipment' as const,
        bundleId: 'BND-23',
        productId: null,
        qty: 1,
        days: 1,
        ratePaisa: 0 as any,
      },
    ]

    let submitHook!: ReturnType<typeof useNewRentalSubmit>
    function TestComponent() {
      submitHook = useNewRentalSubmit({
        confirmBlocked: false,
        saveState: 'saved',
        setSaveState: vi.fn(),
        dispatchContext: () => ({ userId: 'user-1', role: 'Coordinator' }),
        setActionError: vi.fn(),
        setConfirmedSuccess: vi.fn(),
        showSuccessToast: vi.fn(),
        client: dummyClient,
        lines: sampleLines as any,
        equipmentLines: sampleLines.slice(1) as any,
        project: 'Commercial',
        pickupAt: new Date('2026-11-01T09:00:00Z'),
        returnAt: new Date('2026-11-02T18:00:00Z'),
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
        days: 1,
        draftId: null,
        draftBookingNo: null,
        draftHasUnsavedChanges: false,
        draftData: {} as any,
        setSavedDraftFingerprint: vi.fn(),
        kind: 'Commercial',
        kindOther: '',
        confirmKey: { current: null },
        draftBookingKey: { current: null },
      })
      return null
    }

    try {
      await act(async () => {
        root.render(<TestComponent />)
      })

      await act(async () => {
        submitHook.confirmBooking()
      })

      expect(createRental).toHaveBeenCalledTimes(1)
      const payload = vi.mocked(createRental).mock.calls[0]?.[0]
      expect(payload?.lines).toHaveLength(2)

      // Bundle line with string ID 'BND-23' has bundleId sanitized to null
      expect(payload?.lines[0]).toMatchObject({
        lineType: 'Bundle',
        bundleId: null,
        description: 'Sony FX3 Kit',
      })

      // Equipment component line has composite id 'BND-23::...' mapped to productId: null and bundleId: null
      expect(payload?.lines[1]).toMatchObject({
        lineType: 'Equipment',
        productId: null,
        bundleId: null,
        description: 'Sony FX3 Camera Body',
      })
    } finally {
      await act(async () => {
        root.unmount()
      })
      host.remove()
    }
  })

  it('states structure quote totals on priced lines and leaves other lines flat', async () => {
    vi.mocked(fetchProductPricingTerms).mockResolvedValueOnce(
      new Map([
        [
          '22222222-2222-4222-8222-222222222222',
          {
            structure: { tiles: [{ days: 2, pricePaisa: 800000 }], extraDayPaisa: null },
            rules: [],
          },
        ],
      ]),
    )

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const dummyClient = {
      dbId: 'client-db-1',
      id: 'CL-001',
      name: 'Test Client',
      phone: '9841000000',
    } as unknown as ClientRecord

    const dummyPricing = {
      securityDeposit: { requiredPaisa: 0 },
      discounts: { discountPaisa: 0, appliedPercent: 0 },
    } as unknown as PricingPipelineResult

    const sampleLines = [
      {
        id: 'line-bundle-1',
        name: 'Cinema Camera Kit',
        lineType: 'Bundle' as const,
        bundleId: '11111111-1111-4111-8111-111111111111',
        qty: 1,
        days: 2,
        ratePaisa: 1000000 as any,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Sony FX3 Cinema Camera',
        lineType: 'Equipment' as const,
        productId: '22222222-2222-4222-8222-222222222222',
        qty: 1,
        days: 2,
        ratePaisa: 500000 as any,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Heavy Duty Tripod',
        qty: 1,
        days: 2,
        ratePaisa: 100000 as any,
      },
    ]

    let submitHook!: ReturnType<typeof useNewRentalSubmit>
    function TestComponent() {
      submitHook = useNewRentalSubmit({
        confirmBlocked: false,
        saveState: 'saved',
        setSaveState: vi.fn(),
        dispatchContext: () => ({ userId: 'user-1', role: 'Coordinator' }),
        setActionError: vi.fn(),
        setConfirmedSuccess: vi.fn(),
        showSuccessToast: vi.fn(),
        client: dummyClient,
        lines: sampleLines as any,
        equipmentLines: sampleLines.slice(1) as any,
        project: 'Commercial',
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
        setSavedDraftFingerprint: vi.fn(),
        kind: 'Commercial',
        kindOther: '',
        confirmKey: { current: null },
        draftBookingKey: { current: null },
      })
      return null
    }

    try {
      await act(async () => {
        root.render(<TestComponent />)
      })

      await act(async () => {
        submitHook.confirmBooking()
      })

      expect(createRental).toHaveBeenCalledTimes(1)
      const payload = vi.mocked(createRental).mock.calls[0]?.[0]
      expect(payload?.lines).toHaveLength(3)

      // Structure-priced line carries the quoted total + snapshot (0168).
      expect(payload?.lines[1]).toMatchObject({
        lineTotal: 8000,
        priceBreakdown: expect.objectContaining({
          source: 'pricing-quote-v1',
          method: 'structure',
          chargedDays: 2,
          unitTotalPaisa: 800000,
        }),
      })

      // Bundle and flat lines stay on the server-computed path.
      expect('lineTotal' in (payload?.lines[0] as object)).toBe(false)
      expect('lineTotal' in (payload?.lines[2] as object)).toBe(false)
    } finally {
      await act(async () => {
        root.unmount()
      })
      host.remove()
    }
  })

  it('falls back to flat totals when pricing terms cannot be read', async () => {
    vi.mocked(fetchProductPricingTerms).mockRejectedValueOnce(new Error('terms unavailable'))

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const dummyClient = {
      dbId: 'client-db-1',
      id: 'CL-001',
      name: 'Test Client',
      phone: '9841000000',
    } as unknown as ClientRecord

    const dummyPricing = {
      securityDeposit: { requiredPaisa: 0 },
      discounts: { discountPaisa: 0, appliedPercent: 0 },
    } as unknown as PricingPipelineResult

    const sampleLines = [
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Sony FX3 Cinema Camera',
        lineType: 'Equipment' as const,
        productId: '22222222-2222-4222-8222-222222222222',
        qty: 1,
        days: 2,
        ratePaisa: 500000 as any,
      },
    ]

    let submitHook!: ReturnType<typeof useNewRentalSubmit>
    function TestComponent() {
      submitHook = useNewRentalSubmit({
        confirmBlocked: false,
        saveState: 'saved',
        setSaveState: vi.fn(),
        dispatchContext: () => ({ userId: 'user-1', role: 'Coordinator' }),
        setActionError: vi.fn(),
        setConfirmedSuccess: vi.fn(),
        showSuccessToast: vi.fn(),
        client: dummyClient,
        lines: sampleLines as any,
        equipmentLines: sampleLines as any,
        project: 'Commercial',
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
        setSavedDraftFingerprint: vi.fn(),
        kind: 'Commercial',
        kindOther: '',
        confirmKey: { current: null },
        draftBookingKey: { current: null },
      })
      return null
    }

    try {
      await act(async () => {
        root.render(<TestComponent />)
      })

      await act(async () => {
        submitHook.confirmBooking()
      })

      // Quoting never blocks booking: the press still creates, flat.
      expect(createRental).toHaveBeenCalledTimes(1)
      const payload = vi.mocked(createRental).mock.calls[0]?.[0]
      expect(payload?.lines).toHaveLength(1)
      expect('lineTotal' in (payload?.lines[0] as object)).toBe(false)
    } finally {
      await act(async () => {
        root.unmount()
      })
      host.remove()
    }
  })
})
