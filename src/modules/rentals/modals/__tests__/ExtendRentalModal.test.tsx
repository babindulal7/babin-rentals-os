// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ExtendRentalModal } from '../ExtendRentalModal'

const mockExtendRental = vi.fn()
const mockRequestClashingExtension = vi.fn()
const mockDecideClashingExtension = vi.fn()
const mockShowSuccessToast = vi.fn()
const mockCheckExtensionClash = vi.fn()

let mockUserRole = 'Coordinator'

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
  newClientUuid: () => 'test-client-uuid-123',
}))

vi.mock('../../../../actions/rentals/extendRental', () => ({
  extendRental: (...args: unknown[]) => mockExtendRental(...args),
}))

vi.mock('../../../../actions/rentals/requestClashingExtension', () => ({
  requestClashingExtension: (...args: unknown[]) => mockRequestClashingExtension(...args),
}))

vi.mock('../../../../actions/rentals/decideClashingExtension', () => ({
  decideClashingExtension: (...args: unknown[]) => mockDecideClashingExtension(...args),
}))

vi.mock('../../../../lib/queries/extensionClash', () => ({
  checkExtensionClash: (...args: unknown[]) => mockCheckExtensionClash(...args),
}))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-coord-1', name: 'Desk Staff', role: mockUserRole },
  }),
}))

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({
    showSuccessToast: (...args: unknown[]) => mockShowSuccessToast(...args),
    showErrorToast: vi.fn(),
  }),
}))

let container: HTMLDivElement
let root: Root

function setNativeChecked(element: HTMLInputElement, checked: boolean) {
  const checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set
  checkedSetter?.call(element, checked)
  element.dispatchEvent(new Event('click', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

async function flush(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function mountModal(props: Parameters<typeof ExtendRentalModal>[0]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<ExtendRentalModal {...props} />)
  })
  await flush()
}

describe('ExtendRentalModal (T3-17)', () => {
  const sampleLines = [
    {
      id: 'line-1',
      booking_id: 'bk-1',
      equipment_id: 'prod-1',
      item_name: 'Sony FX3 Cinema Camera',
      quantity: 1,
      unit_price_paisa: 150000,
      total_price_paisa: 150000,
      line_type: 'Rental' as const,
      discount_amount_paisa: 15000,
      pricing_tier: 'standard',
    },
  ]

  beforeEach(() => {
    mockUserRole = 'Coordinator'
    mockExtendRental.mockReset()
    mockRequestClashingExtension.mockReset()
    mockDecideClashingExtension.mockReset()
    mockShowSuccessToast.mockReset()
    mockCheckExtensionClash.mockReset()
    mockCheckExtensionClash.mockResolvedValue({ hasClash: false, clashes: [] })
    mockRequestClashingExtension.mockResolvedValue({ success: true, clashId: 'clash-123' })
    mockDecideClashingExtension.mockResolvedValue({ success: true, clashId: 'clash-123', decision: 'extend_at_risk' })
    mockExtendRental.mockResolvedValue({
      ok: true,
      bookingId: 'bk-1',
      days: 1,
      oldReturnDate: '2026-11-10T18:00:00Z',
      newReturnDate: '2026-11-11T18:00:00Z',
      pricingOption: 'same_rate',
      surchargePaisa: 135000,
      totalRentalPaisa: 270000,
    })
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  it('renders extension chips (+1 day, +2 days, custom) and W41 pricing choices', async () => {
    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      bookingId: 'bk-1',
      bookingNo: 'BK-1001',
      client: 'Avishek Shrestha',
      currentReturnDate: '2026-11-10T18:00:00Z',
      lines: sampleLines,
    })

    expect(container.textContent).toContain('Extend Rental')
    expect(container.textContent).toContain('BK-1001')
    expect(container.textContent).toContain('Avishek Shrestha')
    expect(container.textContent).toContain('+1 Day')
    expect(container.textContent).toContain('+2 Days')
    expect(container.textContent).toContain('Custom')
    expect(container.textContent).toContain('Same rate & discount')
    expect(container.textContent).toContain('Standard rate')
  })

  it('extends in two taps: click reason preset and submit with same_rate pricing', async () => {
    const handleSuccess = vi.fn()
    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      bookingId: 'bk-1',
      bookingNo: 'BK-1001',
      client: 'Avishek Shrestha',
      currentReturnDate: '2026-11-10T18:00:00Z',
      lines: sampleLines,
      onSuccess: handleSuccess,
    })

    // Click client authorization checkbox
    const authCheckbox = container.querySelector('#extend-auth-check') as HTMLInputElement
    expect(authCheckbox).not.toBeNull()
    setNativeChecked(authCheckbox, true)
    await flush()

    // Click reason preset chip: "Shoot extension requested by client"
    const shootChip = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Shoot extension')
    )
    expect(shootChip).toBeDefined()
    shootChip?.click()
    await flush()

    // Find submit button
    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Extension')
    )
    expect(submitBtn).toBeDefined()
    expect(submitBtn?.disabled).toBe(false)

    // Tap submit
    await act(async () => {
      submitBtn?.click()
    })
    await flush()

    expect(mockExtendRental).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bk-1',
        days: 1,
        pricingOption: 'same_rate',
        reason: 'Shoot extension requested by client',
      }),
      expect.anything(),
    )
    expect(handleSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        days: 1,
        newReturnDate: '11/11/2026',
      })
    )
  })

  it('allows selecting Standard rate per W41', async () => {
    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      bookingId: 'bk-1',
      bookingNo: 'BK-1001',
      client: 'Avishek Shrestha',
      currentReturnDate: '2026-11-10T18:00:00Z',
      lines: sampleLines,
    })

    // Click client auth
    const authCheckbox = container.querySelector('#extend-auth-check') as HTMLInputElement
    setNativeChecked(authCheckbox, true)

    // Click standard rate button
    const standardRateBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Standard rate')
    )
    expect(standardRateBtn).toBeDefined()
    await act(async () => {
      standardRateBtn?.click()
    })
    await flush()

    // Select reason
    const shootChip = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Shoot extension')
    )
    shootChip?.click()
    await flush()

    // Confirm submit
    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Extension')
    )
    await act(async () => {
      submitBtn?.click()
    })
    await flush()

    expect(mockExtendRental).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bk-1',
        days: 1,
        pricingOption: 'standard_rate',
      }),
      expect.anything(),
    )
  })

  it('detects upcoming reservation clashes and prevents direct Coordinator confirmation (T3-29)', async () => {
    mockCheckExtensionClash.mockResolvedValueOnce({
      hasClash: true,
      clashes: [
        {
          reservationId: 'res-99',
          bookingId: 'bk-2',
          bookingNo: 'BK-2002',
          clientName: 'Other Studio',
          equipmentId: 'prod-1',
          itemName: 'Sony FX3 Cinema Camera',
          reservedFrom: '2026-11-11T09:00:00Z',
          reservedTo: '2026-11-12T18:00:00Z',
          detail: 'Sony FX3 Cinema Camera is reserved by BK-2002',
        },
      ],
    })

    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      bookingId: 'bk-1',
      bookingNo: 'BK-1001',
      client: 'Avishek Shrestha',
      currentReturnDate: '2026-11-10T18:00:00Z',
      lines: sampleLines,
    })

    // Wait for clash check effect
    await flush(6)

    expect(container.textContent).toContain('Reservation Clash Detected')
    expect(container.textContent).toContain('Sony FX3 Cinema Camera')
    expect(container.textContent).toContain('BK-2002')

    // Confirm Extension button must not be available to Coordinator on clash
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Extension')
    )
    expect(confirmBtn).toBeUndefined()

    // Coordinator sees Send to Manager for Decision button
    const escalateBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Send to Manager for Decision')
    )
    expect(escalateBtn).toBeDefined()
  })

  it('allows Coordinator to escalate clash to Manager via requestClashingExtension (T3-29)', async () => {
    mockCheckExtensionClash.mockResolvedValueOnce({
      hasClash: true,
      clashes: [
        {
          lineDescription: 'Sony FX3 Cinema Camera',
          assetTag: 'AST-101',
          conflictingBookingNo: 'bk-2',
          detail: 'Sony FX3 Cinema Camera is reserved by BK-2002',
        },
      ],
    })

    const handleClose = vi.fn()
    await mountModal({
      isOpen: true,
      onClose: handleClose,
      bookingId: 'bk-1',
      bookingNo: 'BK-1001',
      client: 'Avishek Shrestha',
      currentReturnDate: '2026-11-10T18:00:00Z',
      lines: sampleLines,
    })

    await flush(6)

    // Select reason
    const shootChip = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Shoot extension')
    )
    shootChip?.click()
    await flush()

    const escalateBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Send to Manager for Decision')
    )
    expect(escalateBtn).toBeDefined()
    await act(async () => {
      escalateBtn?.click()
    })
    await flush()

    expect(mockRequestClashingExtension).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'bk-1',
        days: 1,
        conflictingBookingId: 'bk-2',
      }),
      expect.anything(),
    )
    expect(container.textContent).toContain('Escalated to Manager for Decision')

    const doneBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Done')
    )
    expect(doneBtn).toBeDefined()
    await act(async () => {
      doneBtn?.click()
    })
    await flush()
    expect(handleClose).toHaveBeenCalled()
  })

  it('presents Manager with 3 audited clash decision actions (T3-29)', async () => {
    mockUserRole = 'Manager'
    mockCheckExtensionClash.mockResolvedValueOnce({
      hasClash: true,
      clashes: [
        {
          reservationId: 'res-99',
          bookingId: 'bk-2',
          bookingNo: 'BK-2002',
          clientName: 'Other Studio',
          equipmentId: 'prod-1',
          itemName: 'Sony FX3 Cinema Camera',
          reservedFrom: '2026-11-11T09:00:00Z',
          reservedTo: '2026-11-12T18:00:00Z',
          detail: 'Sony FX3 Cinema Camera is reserved by BK-2002',
        },
      ],
    })

    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      bookingId: 'bk-1',
      bookingNo: 'BK-1001',
      client: 'Avishek Shrestha',
      currentReturnDate: '2026-11-10T18:00:00Z',
      lines: sampleLines,
    })

    await flush(6)

    // Manager should see the 3 decision buttons
    const refuseBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Refuse Extension')
    )
    const reassignBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Extend & Reassign Next')
    )
    const atRiskBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Extend & Flag Next At-Risk')
    )

    expect(refuseBtn).toBeDefined()
    expect(reassignBtn).toBeDefined()
    expect(atRiskBtn).toBeDefined()
  })

  it('enforces Law 6 money blindness for floor roles (Warehouse)', async () => {
    mockUserRole = 'Warehouse'

    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      bookingId: 'bk-1',
      bookingNo: 'BK-1001',
      client: 'Avishek Shrestha',
      currentReturnDate: '2026-11-10T18:00:00Z',
      lines: sampleLines,
    })

    // DOM must not leak Rs or paisa calculations
    expect(container.textContent).not.toContain('Rs')
    expect(container.textContent).not.toContain('1,350')
    expect(container.textContent).not.toContain('1,500')
    expect(container.textContent).not.toContain('Pricing for Extra Days')
  })
})
