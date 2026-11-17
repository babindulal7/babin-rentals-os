// @vitest-environment jsdom
/**
 * RULING 2026-11-17 (R-17.1): the Record TDS screen shows the figure the system computed and
 * records it in one tap; it never works the figure out itself. These pin what the operator
 * sees and what reaches the action, for each role that may or may not record and reverse.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ClientTdsStatus } from '../../../lib/queries/clientTds'
import type { Paisa } from '../../../lib/money'

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  record: vi.fn(),
  reverse: vi.fn(),
}))

vi.mock('../../../lib/queries/clientTds', () => ({ getClientTdsStatus: mocks.status }))
vi.mock('../../../actions/finance/recordClientTds', () => ({
  recordClientTds: mocks.record,
  reverseClientTds: mocks.reverse,
  TDS_REASON_MIN: 10,
  CERTIFICATE_MAX: 60,
}))
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u-1', role: 'Accounts' } }) }))
vi.mock('../../../lib/network', () => ({ useNetwork: () => true }))
vi.mock('../../../lib/supabase', () => ({ newClientUuid: () => '00000000-0000-4000-8000-000000000001' }))

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { ClientTdsModal } = await import('../modals/ClientTdsModal')

const p = (n: number) => n as unknown as Paisa

const recordable = (over: Partial<ClientTdsStatus> = {}): ClientTdsStatus => ({
  invoiceId: 'inv-1',
  ratePercent: 1.5,
  basePaisa: p(1_000_000),
  amountPaisa: p(15_000),
  outstandingPaisa: p(15_000),
  canRecord: true,
  blockedReason: null,
  active: null,
  ...over,
})

const recorded = (): ClientTdsStatus =>
  recordable({
    canRecord: false,
    blockedReason: 'TDS is already recorded for this invoice.',
    active: { ledgerId: 'led-1', amountPaisa: p(15_000), certificateNumber: 'TDS-77', deductedOn: '2026-11-17' },
  })

const baseProps = {
  isOpen: true,
  invoice: { id: 'inv-1', invoiceNo: 'INV-9', clientName: 'Acme Films' },
  canRecord: true,
  canReverse: false,
}

let root: Root
let onClose: ReturnType<typeof vi.fn>
let onDone: ReturnType<typeof vi.fn>

async function mount(props: Partial<typeof baseProps> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<ClientTdsModal {...baseProps} {...props} onClose={onClose} onDone={onDone} />)
  })
  await settle()
}

/** Let the status read and any state updates it triggers land. */
async function settle() {
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve() })
}

const buttons = () => Array.from(document.body.querySelectorAll('button'))
const button = (name: RegExp | string) =>
  buttons().find((b) => (typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? '')))
const text = () => document.body.textContent ?? ''

async function click(el: Element | undefined) {
  if (!el) throw new Error('button not found')
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await settle()
}

async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  onClose = vi.fn()
  onDone = vi.fn()
  mocks.status.mockReset().mockResolvedValue(recordable())
  mocks.record.mockReset().mockResolvedValue({ amountPaisa: p(15_000), outstandingPaisa: p(0) })
  mocks.reverse.mockReset().mockResolvedValue({ amountPaisa: p(15_000), outstandingPaisa: p(15_000) })
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  document.body.innerHTML = ''
})

describe('ClientTdsModal — recording', () => {
  it('shows the system figure and records it in one tap', async () => {
    await mount()
    const record = button(/Record TDS/)
    expect(record?.textContent).toContain('Rs 150') // 15,000 paisa, as the server computed it
    expect(text()).toMatch(/1\.5% of/)

    await click(record)

    expect(mocks.record).toHaveBeenCalledTimes(1)
    const input = mocks.record.mock.calls[0]![0] as Record<string, unknown>
    expect(input).toMatchObject({ invoiceId: 'inv-1', certificateNumber: '' })
    expect(JSON.stringify(input)).not.toMatch(/rate|percent|amount/i)
    expect(onDone).toHaveBeenCalledWith(expect.stringContaining('Invoice settled'))
    expect(onClose).toHaveBeenCalled()
  })

  it('sends the certificate number the operator typed', async () => {
    await mount()
    await type(document.getElementById('tds-certificate') as HTMLInputElement, 'TDS-0042')
    await click(button(/Record TDS/))
    expect(mocks.record.mock.calls[0]![0]).toMatchObject({ certificateNumber: 'TDS-0042' })
  })

  it('shows the refusal inline and keeps the form open', async () => {
    mocks.record.mockRejectedValue(new Error('TDS is already recorded for this invoice. Reverse it first to record it again.'))
    await mount()
    await click(button(/Record TDS/))
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('already recorded')
    expect(onClose).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('offers no record button when the system says it cannot be recorded', async () => {
    mocks.status.mockResolvedValue(recordable({ canRecord: false, blockedReason: 'This invoice is voided, so it cannot take TDS.' }))
    await mount()
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('voided')
    expect(button(/Record TDS/)).toBeUndefined()
  })

  it('offers no record button to a role that cannot record', async () => {
    await mount({ canRecord: false, canReverse: true })
    expect(text()).toContain('Your role cannot record TDS')
    expect(button(/Record TDS/)).toBeUndefined()
  })

  it('says so when the figure cannot be read, and offers a retry', async () => {
    mocks.status.mockRejectedValueOnce(new Error('TDS is not available on this server yet.'))
    await mount()
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('not available on this server yet')
    await click(button('Try again'))
    expect(button(/Record TDS/)).toBeDefined()
  })
})

describe('ClientTdsModal — reversing', () => {
  beforeEach(() => {
    mocks.status.mockResolvedValue(recorded())
  })

  it('shows what is recorded, with the certificate and date', async () => {
    await mount({ canReverse: true })
    expect(text()).toContain('TDS recorded')
    expect(text()).toContain('Certificate TDS-77')
    expect(button(/Record TDS/)).toBeUndefined()
  })

  it('does not let a role without reverse rights reverse', async () => {
    await mount({ canReverse: false })
    expect(text()).toContain('Only the Owner, Admin or a Manager can reverse TDS')
    expect(button(/Reverse/)).toBeUndefined()
  })

  it('needs a reason of at least 10 characters before it will reverse', async () => {
    await mount({ canReverse: true })
    await click(button('Reverse this TDS'))
    expect(button('Reverse TDS')?.disabled).toBe(true)

    await type(document.getElementById('tds-reason') as HTMLTextAreaElement, 'oops')
    expect(button('Reverse TDS')?.disabled).toBe(true)

    await type(document.getElementById('tds-reason') as HTMLTextAreaElement, 'Entered on the wrong invoice')
    expect(button('Reverse TDS')?.disabled).toBe(false)
    await click(button('Reverse TDS'))

    expect(mocks.reverse).toHaveBeenCalledTimes(1)
    expect(mocks.reverse.mock.calls[0]![0]).toMatchObject({ ledgerId: 'led-1', reason: 'Entered on the wrong invoice' })
    expect(onDone).toHaveBeenCalledWith(expect.stringContaining('reversed'))
  })
})
