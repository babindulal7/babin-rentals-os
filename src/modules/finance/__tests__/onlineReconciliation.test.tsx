// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Paisa } from '../../../lib/money'
import type { OnlineReconciliationRow, PaymentIntentRow } from '../../../lib/queries/reconciliation'

const mockReconRows: OnlineReconciliationRow[] = [
  {
    provider: 'fonepay',
    day: '2026-11-19',
    total_intents: 3,
    paid_intents: 1,
    allocated_intents: 1,
    refunded_intents: 1,
    total_collected_paisa: 500000 as Paisa,
    total_allocated_paisa: 300000 as Paisa,
    total_refunded_paisa: 200000 as Paisa,
    flagged_unreconciled_intents: 1,
  },
  {
    provider: 'esewa',
    day: '2026-11-19',
    total_intents: 2,
    paid_intents: 0,
    allocated_intents: 2,
    refunded_intents: 0,
    total_collected_paisa: 400000 as Paisa,
    total_allocated_paisa: 400000 as Paisa,
    total_refunded_paisa: 0 as Paisa,
    flagged_unreconciled_intents: 0,
  },
]

const mockIntents: PaymentIntentRow[] = [
  {
    id: 'intent-uuid-1',
    client_uuid: 'client-uuid-1',
    booking_id: null,
    booking_request_id: 'req-uuid-1',
    client_id: 'client-1',
    provider: 'fonepay',
    amount_paisa: 200000 as Paisa,
    status: 'paid',
    provider_ref: 'FP-REF-001',
    payment_id: null,
    paid_at: '2026-11-15T10:00:00Z',
    allocated_at: null,
    refunded_at: null,
    refund_ref: null,
    refund_reason: null,
    refund_type: null,
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
]

const mockFetchRecon = vi.fn(async () => mockReconRows)
const mockFetchIntents = vi.fn(async () => mockIntents)
const mockRefundPaymentIntent = vi.fn(async (_params?: unknown) => ({ success: true, status: 'refunded' }))

vi.mock('../../../lib/queries/reconciliation', () => ({
  fetchOnlineReconciliation: () => mockFetchRecon(),
  fetchPaymentIntents: () => mockFetchIntents(),
}))

vi.mock('../../../actions/finance/refundPaymentIntent', () => ({
  refundPaymentIntent: (params: unknown) => mockRefundPaymentIntent(params),
}))

const auth = vi.hoisted(() => ({
  canViewMoney: true,
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => auth.canViewMoney,
}))

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const { OnlineReconciliationWorkspace } = await import('../OnlineReconciliationWorkspace')

async function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <OnlineReconciliationWorkspace />
      </StrictMode>
    )
  })
  return container
}

describe('OnlineReconciliationWorkspace (T7-07, B39)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.canViewMoney = true
  })

  it('renders reconciliation metrics and stale intent alert banner', async () => {
    const c = await mount()
    expect(c.textContent).toContain('Online Payment Reconciliation & Refunds')
    expect(c.textContent).toContain('1 Unallocated Online Payment Older Than 3 Days')
    expect(c.textContent).toContain('Total Collected Online')
    expect(c.textContent).toContain('Allocated to Bookings')
    expect(c.textContent).toContain('Fonepay')
    expect(c.textContent).toContain('eSewa')
  })

  it('renders online payment intents with provider ref and status', async () => {
    const c = await mount()
    expect(c.textContent).toContain('FP-REF-001')
    expect(c.textContent).toContain('Unallocated > 3d')
  })

  it('opens refund modal and allows processing a wallet refund with provider reference', async () => {
    const c = await mount()
    const refundBtn = Array.from(c.querySelectorAll('button')).find((b) =>
      /Refund \/ Credit/i.test(b.textContent ?? '')
    )
    expect(refundBtn).toBeDefined()

    await act(async () => {
      refundBtn?.click()
    })

    expect(c.textContent).toContain('Process Online Payment Refund')
    expect(c.textContent).toContain('Resolution Method')
    expect(c.textContent).toContain('Refund to Wallet / Source')

    const refInput = c.querySelector('input[placeholder*="FP-RET"]') as HTMLInputElement
    expect(refInput).toBeDefined()

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(refInput, 'FP-REVERSAL-999')
      refInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const submitBtn = Array.from(c.querySelectorAll('button')).find((b) =>
      /Confirm Wallet Refund/i.test(b.textContent ?? '')
    )
    expect(submitBtn).toBeDefined()

    await act(async () => {
      submitBtn?.click()
    })

    expect(mockRefundPaymentIntent).toHaveBeenCalledWith({
      intentId: 'intent-uuid-1',
      refundType: 'wallet_refund',
      refundRef: 'FP-REVERSAL-999',
      reason: undefined,
    })
  })

  it('allows processing store account credit per B39 client choice', async () => {
    const c = await mount()
    const refundBtn = Array.from(c.querySelectorAll('button')).find((b) =>
      /Refund \/ Credit/i.test(b.textContent ?? '')
    )
    await act(async () => {
      refundBtn?.click()
    })

    const creditRadio = Array.from(c.querySelectorAll('input[type="radio"]')).find(
      (r) => (r as HTMLInputElement).value === 'account_credit'
    ) as HTMLInputElement
    expect(creditRadio).toBeDefined()

    await act(async () => {
      creditRadio.click()
    })

    const submitBtn = Array.from(c.querySelectorAll('button')).find((b) =>
      /Issue Store Credit/i.test(b.textContent ?? '')
    )
    expect(submitBtn).toBeDefined()

    await act(async () => {
      submitBtn?.click()
    })

    expect(mockRefundPaymentIntent).toHaveBeenCalledWith({
      intentId: 'intent-uuid-1',
      refundType: 'account_credit',
      refundRef: undefined,
      reason: undefined,
    })
  })

  it('displays access restricted for money-blind roles (Law 6)', async () => {
    auth.canViewMoney = false
    const c = await mount()
    expect(c.textContent).toContain('Access restricted: Money-blind role cannot view online payment reconciliation')
  })
})
