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
  fetchOnlinePaymentProviders: vi.fn(),
}))

describe('OnlinePaymentModal (T7-05, T7-06)', () => {
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

    vi.mocked(payApi.fetchOnlinePaymentProviders).mockResolvedValue([
      { provider: 'fonepay', name: 'Fonepay', enabled: true, env: 'sandbox' },
      { provider: 'esewa', name: 'eSewa', enabled: true, env: 'sandbox' },
      { provider: 'khalti', name: 'Khalti', enabled: false, env: 'sandbox' },
    ])

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

  it('renders modal with server-calculated amount, deposit policy, and switched-on provider options', async () => {
    await act(async () => {
      root.render(<OnlinePaymentModal {...defaultProps} />)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(container.textContent).toContain('Online Payment')
    expect(container.textContent).toContain('Fonepay')
    expect(container.textContent).toContain('eSewa')
    // Choosing a provider must NOT create a payable intent yet.
    expect(container.textContent).not.toContain('Khalti')
    expect(container.textContent).toContain('Continue with Fonepay')
    expect(payApi.initOnlinePayment).not.toHaveBeenCalled()
    expect(payApi.verifyOnlinePayment).not.toHaveBeenCalled()

    const continueBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Continue with Fonepay',
    )
    expect(continueBtn).toBeTruthy()
    await act(async () => { continueBtn?.click() })

    expect(payApi.initOnlinePayment).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'fonepay', bookingRequestId: 'req-123' }),
    )
    expect(container.textContent).toContain('Security Deposit Policy')
    expect(container.textContent).toContain('5,000')
    expect(container.textContent).toContain('Only a server-verified')
    expect(payApi.verifyOnlinePayment).not.toHaveBeenCalled()
  })

  it('switches payment provider tab to eSewa when clicked', async () => {
    vi.mocked(payApi.initOnlinePayment).mockResolvedValueOnce({
      success: true,
      intent_id: 'intent-esewa-1',
      amount_paisa: 500000,
      amount_rupees: '5000.00',
      provider: 'esewa',
      payment_url: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
      esewa_params: {
        amount: '5000.00',
        tax_amount: '0',
        total_amount: '5000.00',
        transaction_uuid: 'intent-esewa-1',
        product_code: 'EPAYTEST',
        product_service_charge: '0',
        product_delivery_charge: '0',
        success_url: 'https://example.invalid/success',
        failure_url: 'https://example.invalid/failure',
        signed_field_names: 'total_amount,transaction_uuid,product_code',
        signature: 'synthetic-test-signature',
      },
      is_sandbox: true,
    })

    await act(async () => {
      root.render(<OnlinePaymentModal {...defaultProps} />)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    const esewaBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'eSewa'
    )
    expect(esewaBtn).toBeTruthy()

    await act(async () => {
      esewaBtn?.click()
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    // Provider selection is local-only; an attempt starts only after Continue.
    expect(payApi.initOnlinePayment).not.toHaveBeenCalled()
    const continueBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Continue with eSewa',
    )
    expect(continueBtn).toBeTruthy()
    await act(async () => { continueBtn?.click() })

    expect(payApi.initOnlinePayment).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'esewa', bookingRequestId: 'req-123' }),
    )
    expect(container.textContent).toContain('eSewa Mobile Wallet')
    const form = container.querySelector('form')
    expect(form).toBeTruthy()
    expect(form?.getAttribute('method')).toBe('POST')
    expect(form?.getAttribute('action')).toBe('https://rc-epay.esewa.com.np/api/epay/main/v2/form')
    expect(form?.querySelector('input[name="signature"]')?.getAttribute('value')).toBe('synthetic-test-signature')
    expect(payApi.verifyOnlinePayment).not.toHaveBeenCalled()
  })

  it('never simulates provider success or issues a receipt from the checkout screen', async () => {
    await act(async () => { root.render(<OnlinePaymentModal {...defaultProps} />) })

    expect(payApi.initOnlinePayment).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('Simulate Successful')
    const startBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Continue with Fonepay',
    )
    expect(startBtn).toBeTruthy()
    await act(async () => { startBtn?.click() })

    const providerLink = Array.from(container.querySelectorAll('a')).find(
      (a) => a.textContent?.includes('Open Fonepay Checkout'),
    )
    expect(providerLink).toBeTruthy()
    expect(providerLink?.getAttribute('href')).toBe(
      'https://dev-clientapi.fonepay.com/api/merchantRequest?PRN=intent-789',
    )
    expect(container.textContent).toContain('server-verified')
    expect(container.textContent).not.toContain('Payment Received!')
    expect(container.textContent).not.toContain('PAY-101')
    expect(payApi.verifyOnlinePayment).not.toHaveBeenCalled()
    expect(defaultProps.onPaymentSuccess).not.toHaveBeenCalled()
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

    // The server is contacted only after explicit client checkout initiation.
    const startBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Continue with Fonepay',
    )
    expect(startBtn).toBeTruthy()
    await act(async () => { startBtn?.click() })

    expect(container.textContent).toContain('Booking request is cancelled.')
    expect(container.textContent).not.toContain('Payment Received!')
    expect(payApi.verifyOnlinePayment).not.toHaveBeenCalled()
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
