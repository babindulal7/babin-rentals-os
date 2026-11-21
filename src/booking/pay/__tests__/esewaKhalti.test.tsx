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

describe('T7-06 · eSewa and Khalti payment providers', () => {
  let container: HTMLDivElement
  let root: Root

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    bookingRequestId: 'req-multi-123',
    clientUuid: 'cli-multi-uuid',
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
      { provider: 'khalti', name: 'Khalti', enabled: true, env: 'sandbox' },
    ])

    vi.mocked(payApi.initOnlinePayment).mockImplementation(async (params) => {
      const provider = params.provider || 'fonepay'
      const amountPaisa = 1200000
      const amtRupees = '12000.00'

      if (provider === 'esewa') {
        return {
          success: true,
          intent_id: 'intent-esewa-1',
          amount_paisa: amountPaisa,
          amount_rupees: amtRupees,
          provider: 'esewa',
          payment_url: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
          esewa_params: {
            amount: amtRupees,
            tax_amount: '0',
            total_amount: amtRupees,
            transaction_uuid: 'intent-esewa-1',
            product_code: 'EPAYTEST',
            product_service_charge: '0',
            product_delivery_charge: '0',
            success_url: 'https://book.babinrentals.com/pay/callback',
            failure_url: 'https://book.babinrentals.com/pay/callback?status=failed',
            signed_field_names: 'total_amount,transaction_uuid,product_code',
            signature: 'mock_esewa_signature',
          },
          is_sandbox: true,
        }
      }

      if (provider === 'khalti') {
        return {
          success: true,
          intent_id: 'intent-khalti-1',
          amount_paisa: amountPaisa,
          amount_rupees: amtRupees,
          provider: 'khalti',
          pidx: 'KH-12345678',
          payment_url: 'https://test-pay.khalti.com/?pidx=KH-12345678',
          is_sandbox: true,
        }
      }

      return {
        success: true,
        intent_id: 'intent-fonepay-1',
        amount_paisa: amountPaisa,
        amount_rupees: amtRupees,
        provider: 'fonepay',
        payment_url: 'https://dev-clientapi.fonepay.com/api/merchantRequest?PRN=intent-fonepay-1',
        fonepay_params: {
          PID: 'MDULAL',
          MD: 'P',
          PRN: 'intent-fonepay-1',
          AMT: amtRupees,
          CRN: 'NPR',
          DT: '11/21/2026',
          R1: 'Rental Advance - Intent intent-f',
          R2: 'Babin Rentals',
          RU: 'https://book.babinrentals.com/pay/callback',
          DV: 'dv_hash_test',
        },
        is_sandbox: true,
      }
    })

    vi.mocked(payApi.verifyOnlinePayment).mockResolvedValue({
      success: true,
      intent_id: 'intent-any',
      status: 'paid',
      payment_no: 'PAY-ONLINE-999',
      amount_paisa: 1200000,
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

  it('renders tabs for all enabled providers (Fonepay, eSewa, Khalti)', async () => {
    await act(async () => {
      root.render(<OnlinePaymentModal {...defaultProps} />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const tabTexts = buttons.map((b) => b.textContent?.trim())
    expect(tabTexts).toContain('Fonepay')
    expect(tabTexts).toContain('eSewa')
    expect(tabTexts).toContain('Khalti')
  })

  it('filters out disabled providers when switched off', async () => {
    vi.mocked(payApi.fetchOnlinePaymentProviders).mockResolvedValueOnce([
      { provider: 'fonepay', name: 'Fonepay', enabled: true, env: 'sandbox' },
      { provider: 'esewa', name: 'eSewa', enabled: false, env: 'sandbox' }, // disabled
      { provider: 'khalti', name: 'Khalti', enabled: false, env: 'sandbox' }, // disabled
    ])

    await act(async () => {
      root.render(<OnlinePaymentModal {...defaultProps} />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const tabTexts = buttons.map((b) => b.textContent?.trim())
    expect(tabTexts).not.toContain('eSewa')
    expect(tabTexts).not.toContain('Khalti')
  })

  it('switches to eSewa tab and renders eSewa checkout details', async () => {
    await act(async () => {
      root.render(<OnlinePaymentModal {...defaultProps} />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const esewaTab = buttons.find((b) => b.textContent?.trim() === 'eSewa')
    expect(esewaTab).toBeTruthy()

    await act(async () => {
      esewaTab?.click()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(payApi.initOnlinePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'esewa',
      })
    )
    expect(container.textContent).toContain('eSewa Mobile Wallet')
    expect(container.textContent).toContain('Pay via eSewa ↗')
  })

  it('switches to Khalti tab and renders Khalti checkout details', async () => {
    await act(async () => {
      root.render(<OnlinePaymentModal {...defaultProps} />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const khaltiTab = buttons.find((b) => b.textContent?.trim() === 'Khalti')
    expect(khaltiTab).toBeTruthy()

    await act(async () => {
      khaltiTab?.click()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(payApi.initOnlinePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'khalti',
      })
    )
    expect(container.textContent).toContain('Khalti Digital Wallet')
    expect(container.textContent).toContain('Pay via Khalti ↗')
  })

  it('simulates eSewa payment and verifies server-to-server', async () => {
    await act(async () => {
      root.render(<OnlinePaymentModal {...defaultProps} />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    // Switch to eSewa
    const buttons = Array.from(container.querySelectorAll('button'))
    const esewaTab = buttons.find((b) => b.textContent?.trim() === 'eSewa')
    await act(async () => {
      esewaTab?.click()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    // Click Simulate Successful Payment
    const simulateBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Simulate Successful ESEWA')
    )
    expect(simulateBtn).toBeTruthy()

    await act(async () => {
      simulateBtn?.click()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(payApi.verifyOnlinePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'esewa',
        intentId: 'intent-esewa-1',
        responseCode: 'successful',
      })
    )
    expect(container.textContent).toContain('Payment Received!')
    expect(container.textContent).toContain('PAY-ONLINE-999')
  })

  it('simulates Khalti payment and verifies server-to-server', async () => {
    await act(async () => {
      root.render(<OnlinePaymentModal {...defaultProps} />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    // Switch to Khalti
    const buttons = Array.from(container.querySelectorAll('button'))
    const khaltiTab = buttons.find((b) => b.textContent?.trim() === 'Khalti')
    await act(async () => {
      khaltiTab?.click()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    // Click Simulate Successful Payment
    const simulateBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Simulate Successful KHALTI')
    )
    expect(simulateBtn).toBeTruthy()

    await act(async () => {
      simulateBtn?.click()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(payApi.verifyOnlinePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'khalti',
        intentId: 'intent-khalti-1',
        responseCode: 'successful',
      })
    )
    expect(container.textContent).toContain('Payment Received!')
    expect(container.textContent).toContain('PAY-ONLINE-999')
  })
})
