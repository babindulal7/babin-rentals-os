// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentCallbackPage } from '../PaymentCallbackPage'
import { verifyOnlinePayment } from '../payApi'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../payApi', () => ({ verifyOnlinePayment: vi.fn() }))

describe('real-provider return route verifies rather than trusting redirects', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    vi.resetAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    container.remove()
    window.history.replaceState({}, '', '/')
  })

  async function renderReturn(path: string) {
    window.history.replaceState({}, '', path)
    await act(async () => { root.render(<PaymentCallbackPage />) })
    await act(async () => { await Promise.resolve() })
  }

  it('does not accept forged provider-success redirects if the server rejects them', async () => {
    vi.mocked(verifyOnlinePayment).mockRejectedValue(new Error('No provider settlement'))
    await renderReturn('/pay/callback?intent_id=intent-1&provider=khalti&pidx=forged&status=Completed')
    expect(verifyOnlinePayment).toHaveBeenCalledWith(expect.objectContaining({
      intentId: 'intent-1', provider: 'khalti', pidx: 'forged',
    }))
    expect(container.textContent).toContain('Payment not confirmed')
    expect(container.textContent).not.toContain('Payment receipt:')
  })

  it('shows a receipt only after the server returns an allocated payment ID', async () => {
    vi.mocked(verifyOnlinePayment).mockResolvedValue({
      success: true, intent_id: 'intent-2', status: 'allocated',
      payment_id: 'payment-2', payment_no: 'PAY-2026-2002',
    })
    await renderReturn('/pay/callback?intent_id=intent-2&provider=fonepay&PRN=intent-2&UID=provider-2')
    expect(container.textContent).toContain('Payment verified')
    expect(container.textContent).toContain('PAY-2026-2002')
  })

  it('does not label a verified but unallocated payment as received', async () => {
    vi.mocked(verifyOnlinePayment).mockResolvedValue({
      success: true, intent_id: 'intent-3', status: 'paid', payment_id: null,
    })
    await renderReturn('/pay/callback?intent_id=intent-3&provider=esewa')
    expect(container.textContent).toContain('allocation pending')
    expect(container.textContent).not.toContain('Payment receipt:')
  })

  it('does not invoke verification if the return has no intent or is cancelled', async () => {
    await renderReturn('/pay/callback?status=failed')
    expect(verifyOnlinePayment).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Payment not confirmed')
  })
})
