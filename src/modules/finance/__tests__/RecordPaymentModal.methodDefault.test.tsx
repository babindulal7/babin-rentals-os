// @vitest-environment jsdom
/**
 * T3-15 — Record Payment opens on the method this client used last.
 *
 * The old default was `'Bank Transfer'` for everybody: a guess, and a wrong one
 * for most Kathmandu receipts. The replacement is evidence — the label written
 * into the client's most recent `payments.notes` — and this suite pins every way
 * that evidence can be absent or late:
 *
 *  · a repeat client opens with their last method already chosen;
 *  · a client with no labelled receipt opens with NOTHING chosen (the card's
 *    "new client gets no preselection"), and the form refuses to submit until
 *    somebody picks one;
 *  · a read that resolves after the operator has chosen does not overwrite them;
 *  · switching to another client's invoice asks about THAT client;
 *  · a failed read says why and leaves the picker empty rather than guessing.
 *
 * The query and the notes parser are covered separately in
 * `src/lib/queries/__tests__/lastPaymentMethod.test.ts`; here the read is mocked
 * so each state can be produced on demand.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const recordPaymentSpy = vi.fn(async (_input: unknown, _ctx: unknown) => ({ success: true, paymentId: 'PAY-0001' }))
vi.mock('../../../actions/finance/recordPayment', () => ({
  recordPayment: (input: unknown, ctx: unknown) => recordPaymentSpy(input, ctx),
}))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-REAL', name: 'Tester', role: 'Owner', isSharedDevice: false } }),
}))
vi.mock('../../../lib/queries/bankAccounts', () => ({
  listBankAccounts: vi.fn(async () => []),
}))

const lastMethod = vi.hoisted(() => vi.fn<(clientId: string) => Promise<string | null>>(async () => null))
vi.mock('../../../lib/queries/finance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/finance')>()
  return {
    ...actual,
    lastPaymentMethodForClient: (clientId: string) => lastMethod(clientId),
  }
})

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { RecordPaymentModal } = await import('../modals/RecordPaymentModal')

const CLIENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CLIENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const INV_A = '11111111-1111-4111-8111-111111111111'
const INV_B = '22222222-2222-4222-8222-222222222222'

// Two invoices for two DIFFERENT clients, so nothing is preselected and the
// picker genuinely exercises "switch client" (RULING 2026-10-14).
const INVOICES = [
  {
    id: INV_A,
    invoiceNo: 'INV-91',
    client: 'Dhaulagiri Weddings',
    amount: 'Rs 33,448',
    status: 'Sent',
    booking: 'B-888',
    clientId: CLIENT_A,
    outstandingRupees: 33_448,
  },
  {
    id: INV_B,
    invoiceNo: 'INV-101',
    client: 'Deepak Lama',
    amount: 'Rs 1,40,685',
    status: 'Sent',
    booking: 'B-903',
    clientId: CLIENT_B,
    outstandingRupees: 140_685,
  },
]

/*
 * `initialInvoiceId` is passed because this harness is the Booking Detail case:
 * the caller already knows which invoice it is settling. Without it the picker
 * would open unselected (RULING 2026-10-14 — two clients' bills are on offer, so
 * no invoice is presumed) and there would be no client to ask about at all.
 */
async function mount(initialInvoiceId: string = INV_A) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <RecordPaymentModal
          isOpen
          onClose={() => {}}
          onSuccess={() => {}}
          invoices={INVOICES}
          initialInvoiceId={initialInvoiceId}
        />
      </StrictMode>,
    )
  })
  // Let the last-method read settle (and any state it triggers).
  await act(async () => {})
  return container
}

const methodRadios = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLInputElement>('input[type="radio"][name="rpm-method"]'))
const chosen = (c: HTMLElement) => methodRadios(c).filter((r) => r.checked).map((r) => r.value)
const invoiceSelect = (c: HTMLElement) => c.querySelector('select') as HTMLSelectElement
const amountInput = (c: HTMLElement) => c.querySelector('input[type="number"]') as HTMLInputElement
const submitButton = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('button')).find((b) => /Record Payment/.test(b.textContent ?? ''))!

async function changeSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function typeAmount(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function pick(c: HTMLElement, value: string) {
  const radio = methodRadios(c).find((r) => r.value === value)!
  await act(async () => { radio.click() })
}

beforeEach(() => {
  lastMethod.mockReset()
  lastMethod.mockResolvedValue(null)
  recordPaymentSpy.mockClear()
})

describe('T3-15 — the method default', () => {
  it('a repeat client opens on the method they paid by last', async () => {
    lastMethod.mockResolvedValue('Fonepay')
    const c = await mount()

    expect(lastMethod).toHaveBeenCalledWith(CLIENT_A)
    expect(chosen(c)).toEqual(['Fonepay'])
    // The operator must be able to tell a default from their own choice.
    expect(c.textContent).toContain('Preselected: how this client paid last')
  })

  it('a client with no labelled receipt opens with NOTHING selected', async () => {
    lastMethod.mockResolvedValue(null)
    const c = await mount()

    expect(chosen(c)).toEqual([])
    expect(c.textContent).toContain('Pick the method')
    // Never worded as "new client": a money-blind session and a client whose
    // receipts predate the label read the same way, and neither is new.
    expect(c.textContent).not.toContain('New client')
  })

  it('refuses to record until a method is chosen, and says why inline', async () => {
    lastMethod.mockResolvedValue(null)
    const c = await mount()
    await typeAmount(amountInput(c), '1000')
    await act(async () => { submitButton(c).click() })

    expect(recordPaymentSpy).not.toHaveBeenCalled()
    expect(c.textContent).toContain('Choose how the payment was made')
  })

  it('sends the method the operator picked when there was no default', async () => {
    lastMethod.mockResolvedValue(null)
    const c = await mount()
    await pick(c, 'Cash')
    await typeAmount(amountInput(c), '1000')
    await act(async () => { submitButton(c).click() })

    expect(recordPaymentSpy).toHaveBeenCalledTimes(1)
    const [input] = recordPaymentSpy.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(input.paymentMethod).toBe('Cash')
  })

  it('never overwrites a choice the operator made while the read was still in flight', async () => {
    let resolveRead: (v: string | null) => void = () => {}
    lastMethod.mockReturnValue(new Promise<string | null>((res) => { resolveRead = res }))

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <StrictMode>
          <RecordPaymentModal
            isOpen
            onClose={() => {}}
            onSuccess={() => {}}
            invoices={INVOICES}
            initialInvoiceId={INV_A}
          />
        </StrictMode>,
      )
    })
    // The read has not answered yet; the desk taps Cash first.
    await pick(container, 'Cash')
    await act(async () => { resolveRead('Fonepay') })
    await act(async () => {})

    expect(chosen(container)).toEqual(['Cash'])
    expect(container.textContent).not.toContain('Preselected')
  })

  it('asks about the client whose invoice is selected, and re-derives when it changes', async () => {
    lastMethod.mockImplementation(async (clientId) => (clientId === CLIENT_A ? 'Fonepay' : 'Cheque'))
    const c = await mount()
    await changeSelect(invoiceSelect(c), INV_A)
    await act(async () => {})

    expect(chosen(c)).toEqual(['Fonepay'])

    await changeSelect(invoiceSelect(c), INV_B)
    await act(async () => {})

    expect(lastMethod).toHaveBeenCalledWith(CLIENT_B)
    expect(chosen(c)).toEqual(['Cheque'])
  })

  it('states a failed read and leaves the picker empty rather than guessing', async () => {
    lastMethod.mockRejectedValue(new Error('permission denied for table payments'))
    const c = await mount()

    expect(chosen(c)).toEqual([])
    expect(c.textContent).toContain("This client's last method could not be read")
    expect(c.textContent).toContain('permission denied for table payments')
  })

  it('does not ask at all when the caller supplies no client id', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <StrictMode>
          <RecordPaymentModal
            isOpen
            onClose={() => {}}
            onSuccess={() => {}}
            invoices={INVOICES.map(({ clientId: _c, ...rest }) => rest)}
            initialInvoiceId={INV_A}
          />
        </StrictMode>,
      )
    })
    await act(async () => {})

    expect(lastMethod).not.toHaveBeenCalled()
    expect(chosen(container)).toEqual([])
  })
})
