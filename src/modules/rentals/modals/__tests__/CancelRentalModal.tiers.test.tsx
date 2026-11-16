// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CancelRentalModal } from '../CancelRentalModal'
import type { Paisa } from '../../../../lib/money'

const mockCancelRental = vi.fn()
const mockShowSuccessToast = vi.fn()

vi.mock('../../../../actions/rentals/cancelRental', () => ({
  cancelRental: (...args: unknown[]) => mockCancelRental(...args),
}))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-coord-1', role: 'Coordinator' },
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

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set
  valueSetter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

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

async function mountModal(props: Parameters<typeof CancelRentalModal>[0]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<CancelRentalModal {...props} />)
  })
  await flush()
}

describe('CancelRentalModal - T3-03 Cancellation Fee Tiers', () => {
  const now = new Date()
  // Start in 10 hours (<=24h tier)
  const tenHoursLater = new Date(now.getTime() + 10 * 3600 * 1000).toISOString()
  const twoDaysLater = new Date(now.getTime() + 58 * 3600 * 1000).toISOString()

  const tierProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    bookingId: 'booking-uuid-tier-1',
    bookingNo: 'BK-2026-0099',
    stage: 'Confirmed',
    startsAt: tenHoursLater,
    endsAt: twoDaysLater,
    rentalDays: 2,
    rentalSubtotalPaisa: 1000000 as Paisa, // Rs 10,000
    oneDayChargePaisa: 500000 as Paisa, // Rs 5,000 / day
    paidAdvancePaisa: 600000 as Paisa, // Rs 6,000 paid advance
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCancelRental.mockResolvedValue({
      success: true,
      bookingId: 'booking-uuid-tier-1',
      bookingNo: 'BK-2026-0099',
      cancelledAt: '2026-11-15T12:00:00Z',
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

  it('renders Option A fee policy card, suggests 1-day fee and calculates advance refund', async () => {
    await mountModal(tierProps)

    expect(container.textContent).toContain('Cancellation Fee Policy (Option A)')
    expect(container.textContent).toContain('One rental day charge')
    expect(container.textContent).toContain('Client advance paid:Rs 6,000')
    expect(container.textContent).toContain('Refund to client:Rs 1,000')
  })

  it('enforces override reason if fee is adjusted/waived', async () => {
    await mountModal(tierProps)

    const button = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancel Booking'),
    ) as HTMLButtonElement

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      setNativeValue(textarea, 'Rescheduling event due to emergency')
    })

    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[]
    const overrideCheckbox = checkboxes.find((cb) => cb.parentElement?.textContent?.includes('Waive or adjust'))
    const confirmCheckbox = checkboxes.find((cb) => cb.parentElement?.textContent?.includes('I confirm that this booking'))

    expect(overrideCheckbox).toBeDefined()
    expect(confirmCheckbox).toBeDefined()

    // Check confirmation
    await act(async () => {
      setNativeChecked(confirmCheckbox!, true)
    })
    await flush()
    expect(button.disabled).toBe(false)

    // Check override checkbox
    await act(async () => {
      setNativeChecked(overrideCheckbox!, true)
    })
    await flush()

    // Change custom fee to 0 (waiver) so fee differs from suggested fee
    const numberInput = container.querySelector('input[type="number"]') as HTMLInputElement
    expect(numberInput).toBeDefined()
    await act(async () => {
      setNativeValue(numberInput, '0')
    })
    await flush()

    // Button should now be disabled because override reason is empty (<10 chars)
    expect(button.disabled).toBe(true)

    // Find override reason input
    const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[]
    const overrideInput = inputs.find((inp) => inp.placeholder.includes('Reason for waiving/adjusting fee'))
    expect(overrideInput).toBeDefined()

    await act(async () => {
      setNativeValue(overrideInput!, 'Too short')
    })
    await flush()
    expect(button.disabled).toBe(true)

    await act(async () => {
      setNativeValue(overrideInput!, 'Director approved courtesy waiver')
    })
    await flush()
    expect(button.disabled).toBe(false)
  })

  it('submits cancellation with adjusted fee and override reason', async () => {
    const onSuccess = vi.fn()
    await mountModal({ ...tierProps, onSuccess })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      setNativeValue(textarea, 'Rescheduled to December 2026')
    })

    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[]
    const overrideCheckbox = checkboxes.find((cb) => cb.parentElement?.textContent?.includes('Waive or adjust'))
    const confirmCheckbox = checkboxes.find((cb) => cb.parentElement?.textContent?.includes('I confirm that this booking'))

    await act(async () => {
      setNativeChecked(overrideCheckbox!, true)
    })
    await flush()

    await act(async () => {
      setNativeChecked(confirmCheckbox!, true)
    })
    await flush()

    const numberInput = container.querySelector('input[type="number"]') as HTMLInputElement
    expect(numberInput).toBeDefined()
    // Change fee to NPR 2,500 (250000 paisa)
    await act(async () => {
      setNativeValue(numberInput, '2500')
    })
    await flush()

    const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[]
    const overrideInput = inputs.find((inp) => inp.placeholder.includes('Reason for waiving/adjusting fee'))
    expect(overrideInput).toBeDefined()

    await act(async () => {
      setNativeValue(overrideInput!, 'Negotiated 50% discount with owner Babin')
    })
    await flush()

    const button = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancel Booking'),
    ) as HTMLButtonElement

    await act(async () => {
      button.click()
    })
    await flush()

    expect(mockCancelRental).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'booking-uuid-tier-1',
        cancellationFeePaisa: 250000,
        feeOverrideReason: 'Negotiated 50% discount with owner Babin',
      }),
      expect.anything(),
    )
    expect(onSuccess).toHaveBeenCalledWith('booking-uuid-tier-1')
  })
})
