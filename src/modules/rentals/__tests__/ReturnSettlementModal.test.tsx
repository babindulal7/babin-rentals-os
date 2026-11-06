// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  ReturnSettlementModal,
  type ReturnSettlementDamageItem,
  type ReturnSettlementSummary,
} from '../modals/ReturnSettlementModal'
import { rupees } from '../../../lib/money'
import { fetchDepositSettlementDetails } from '../../../lib/queries/depositSettlement'

vi.mock('../../../lib/queries/depositSettlement', () => ({
  fetchDepositSettlementDetails: vi.fn(),
}))

const refundAccounts = [
  { id: 'cash', accountName: 'Front drawer', bankName: '', channelGroup: 'Cash', isPrimary: false },
  { id: 'bank', accountName: 'Operating account', bankName: 'Example Bank', channelGroup: 'Bank', isPrimary: true },
] as const

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'USR-001', name: 'Babin Shrestha', role: 'Owner' },
  }),
}))

function setNativeValue(element: HTMLElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set
  const prototype = Object.getPrototypeOf(element)
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value)
  } else if (valueSetter) {
    valueSetter.call(element, value)
  } else {
    ;(element as HTMLInputElement).value = value
  }
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('ReturnSettlementModal (Deposit Reconciliation & Damage Invoicing)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.mocked(fetchDepositSettlementDetails).mockResolvedValue({
      heldPaisa: rupees(20000), accounts: [...refundAccounts], originalAccountId: 'cash',
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    bookingNo: 'BK-2026-0801',
    clientName: 'Sagarmatha Films',
    clientPhone: '9841234567',
    bookingId: 'booking-id',
    scheduledReturnIso: '2026-08-05T06:00:00.000Z',
    actualReturnIso: '2026-08-05T06:00:00.000Z', // on time
    dayRatePaisa: rupees(5000),
    dayRateBasis: 'Equipment Day Rate',
    totalItemCount: 6,
    itemsWithIssues: [] as ReturnSettlementDamageItem[],
    onConfirmSettlement: vi.fn(),
  }

  it('renders deposit held tile and cleanly refunds full deposit when no issues', async () => {
    await act(async () => {
      root.render(<ReturnSettlementModal {...baseProps} />)
    })

    const text = document.body.textContent || ''
    expect(text).toContain('Return Settlement & Deposit Reconciliation')
    expect(text).toContain('Security Deposit Held')
    expect(text).toContain('Rs 20,000')
    expect(text).toContain('Net Deposit Refund')
  })

  it('calculates late fee when return is overdue and allows charging it', async () => {
    const overdueProps = {
      ...baseProps,
      actualReturnIso: '2026-08-05T09:15:00.000Z',
    }

    await act(async () => {
      root.render(<ReturnSettlementModal {...overdueProps} />)
    })

    const text = document.body.textContent || ''
    expect(text).toContain('Late Return Duration: 3h 15m')
    expect(text).toContain('Charge Late Fee')
    // Net refund should now be 20,000 - 5,000 = 15,000
    expect(text).toContain('Rs 15,000')
  })

  it('enforces waiver policy (min 10 chars) when waiving late fee', async () => {
    const overdueProps = {
      ...baseProps,
      actualReturnIso: '2026-08-05T09:15:00.000Z',
    }

    await act(async () => {
      root.render(<ReturnSettlementModal {...overdueProps} />)
    })

    // Select Waive Late Fee radio button
    const radios = [...document.body.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    const waiveRadio = radios.find((r) => r.value === 'Waive' || r.nextSibling?.textContent?.includes('Waive'))
    expect(waiveRadio).toBeTruthy()

    act(() => {
      waiveRadio?.click()
    })

    expect(document.body.textContent).toContain('Waiver Authorization')

    // Try to record settlement without entering a valid reason
    const buttons = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    const submitBtn = buttons.find((b) => b.textContent?.includes('Record Settlement'))
    expect(submitBtn).toBeTruthy()

    await act(async () => {
      submitBtn?.click()
    })

    expect(document.body.textContent).toContain('Say why this fee is being waived — at least 10 characters')
    expect(overdueProps.onConfirmSettlement).not.toHaveBeenCalled()

    // Enter valid reason >= 10 chars
    const textarea = document.body.querySelector<HTMLTextAreaElement>('textarea')
    expect(textarea).toBeTruthy()

    act(() => {
      if (textarea) {
        setNativeValue(textarea, 'Traffic roadblock delayed crew return')
      }
    })

    await act(async () => {
      submitBtn?.click()
    })

    expect(overdueProps.onConfirmSettlement).toHaveBeenCalledTimes(1)
    const callArgs = overdueProps.onConfirmSettlement.mock.calls[0]
    expect(callArgs).toBeDefined()
    const summary = callArgs![0] as ReturnSettlementSummary
    expect(summary.refundAccountId).toBe('cash')
    expect(summary.lateFeeChargedPaisa).toBe(rupees(0))
    expect(summary.lateFeeWaiver?.reason).toBe('Traffic roadblock delayed crew return')
    expect(summary.lateFeeWaiver?.approverName).toBe('Babin Shrestha')
  })

  it('computes balance owed by client when damage charges exceed deposit held', async () => {
    vi.mocked(fetchDepositSettlementDetails).mockResolvedValueOnce({
      heldPaisa: rupees(10000), accounts: [...refundAccounts], originalAccountId: 'cash',
    })
    const damagedProps = {
      ...baseProps,
      itemsWithIssues: [
        {
          key: 'item-1',
          name: 'RED Komodo-X Sensor Glass',
          serial: 'SN-KOM-01',
          condition: 'Scratched Optical Element',
          isMissing: false,
          notes: 'Deep scratch near centre of sensor filter',
        },
      ],
    }

    await act(async () => {
      root.render(<ReturnSettlementModal {...damagedProps} />)
    })

    expect(document.body.textContent).toContain('RED Komodo-X Sensor Glass')
    const estimateInput = document.body.querySelector<HTMLInputElement>('input[placeholder="0"]')
    expect(estimateInput).toBeTruthy()

    // Type 25,000 Rs repair estimate
    act(() => {
      if (estimateInput) {
        setNativeValue(estimateInput, '25000')
      }
    })

    // Total deductions = 25,000. Deposit held = 10,000. Balance Owed = 15,000.
    const text = document.body.textContent || ''
    expect(text).toContain('Balance Owed by Client')
    expect(text).toContain('Rs 15,000')
  })

  it('renders WhatsApp return receipt share button', async () => {
    await act(async () => {
      root.render(<ReturnSettlementModal {...baseProps} />)
    })

    const links = [...document.body.querySelectorAll<HTMLAnchorElement>('a')]
    const waLink = links.find((l) => l.textContent?.includes('Send Return Receipt'))
    expect(waLink).toBeTruthy()
    expect(waLink?.getAttribute('href')).toContain('https://wa.me/9779841234567')
  })

  it('requires a choice for an ambiguous receipt and records the selected account', async () => {
    const onConfirmSettlement = vi.fn()
    vi.mocked(fetchDepositSettlementDetails).mockResolvedValueOnce({
      heldPaisa: rupees(8000), accounts: [...refundAccounts], originalAccountId: null,
    })
    await act(async () => {
      root.render(<ReturnSettlementModal {...baseProps} onConfirmSettlement={onConfirmSettlement} />)
    })
    const submit = [...document.body.querySelectorAll('button')]
      .find(button => button.textContent?.includes('Record Settlement'))
    expect(submit?.disabled).toBe(true)
    const select = document.getElementById('refund-payment-account') as HTMLSelectElement
    act(() => setNativeValue(select, 'bank'))
    expect(submit?.disabled).toBe(false)
    await act(async () => submit?.click())
    expect(onConfirmSettlement).toHaveBeenCalledWith(expect.objectContaining({
      depositRefundPaisa: rupees(8000), refundAccountId: 'bank',
    }))
  })

})
