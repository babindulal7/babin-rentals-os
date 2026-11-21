// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { OnlinePaymentModal } from '../OnlinePaymentModal'
import * as payApi from '../payApi'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../payApi', () => ({
  initOnlinePayment: vi.fn(),
  verifyOnlinePayment: vi.fn(),
  fetchOnlinePaymentProviders: vi.fn().mockResolvedValue([
    { provider: 'fonepay', name: 'Fonepay', enabled: true, env: 'sandbox' },
  ]),
}))

describe('OnlinePaymentModal (T7-05)', () => {
  let container: HTMLDivElement
  let root: Root

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    bookingRequestId: 'req-123',
    clientUuid: 'cli-uuid-456',
    onPaymentSuccess: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    vi.mocked(payApi.initOnlinePayment).mockResolvedValue({
      success: true,
      intent_id: 'intent-789',
      amount_paisa: 500000,
      amount_rupees: '5000.00',
      provider: 'fonepay',
      payment_url: 'https://dev-clientapi.fonepay.com/api/merchantRequest?PRN=intent-789',
      fonepay_params: {
        PID: 'MDULAL',
        MD: 'P',
        PRN: 'intent-789',
        AMT: '5000.00',
        CRN: 'NPR',
        DT: '11/19/2026',
        R1: 'Rental Advance - Intent intent-7',
        R2: 'Babin Rentals',
        RU: 'https://book.babinrentals.com/pay/callback',
        DV: 'dv_hash_test',
      },
      is_sandbox: true,
    })

    vi.mocked(payApi.verifyOnlinePayment).mockResolvedValue({
      success: true,
      intent_id: 'intent-789',
      status: 'paid',
      payment_no: 'PAY-101',
      amount_paisa: 500000,
    })
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    container?.remove()
  })

  it('renders Fonepay modal with server-calculated amount and O-3 deposit notice', async () => {
    await act(async () => {
      root.render(<OnlinePaymentModal {...defaultProps} />)
    })

    // Allow promise resolution
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(container.textContent).toContain('Online Payment')
    expect(container.textContent).toContain('Security Deposit Policy')
    expect(container.textContent).toContain('MDULAL')
    expect(container.textContent).toContain('5,000')
  })

  it('simulates payment verification and triggers onPaymentSuccess', async () => {
    await act(async () => {
      root.render(<OnlinePaymentModal {...defaultProps} />)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const simulateBtn = buttons.find((b) => b.textContent?.includes('Simulate Successful'))
    expect(simulateBtn).toBeTruthy()

    await act(async () => {
      simulateBtn?.click()
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(payApi.verifyOnlinePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: 'intent-789',
        responseCode: 'successful',
      })
    )
    expect(container.textContent).toContain('Payment Received!')
    expect(container.textContent).toContain('PAY-101')
    expect(defaultProps.onPaymentSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: 'intent-789',
        paymentNo: 'PAY-101',
        amountPaisa: 500000,
      })
    )
  })

  it('handles server init failure with inline error and close button', async () => {
    vi.mocked(payApi.initOnlinePayment).mockRejectedValueOnce(
      new Error('Booking request is cancelled.')
    )

    await act(async () => {
      root.render(<OnlinePaymentModal {...defaultProps} />)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(container.textContent).toContain('Booking request is cancelled.')
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Close'
    )
    expect(closeBtn).toBeTruthy()

    await act(async () => {
      closeBtn?.click()
    })

    expect(defaultProps.onClose).toHaveBeenCalled()
  })
})
