// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AddWaitingChargeModal } from '../AddWaitingChargeModal'
import { addWaitingChargeLine } from '../../../../lib/queries/waitingCharge'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const toast = vi.hoisted(() => ({ show: vi.fn() }))

vi.mock('../../../../components/ui/Toast', () => ({ useToast: () => ({ showSuccessToast: toast.show }) }))
vi.mock('../../../../lib/supabase', () => ({ newClientUuid: () => 'key-fixed-1' }))
vi.mock('../../../../lib/queries/waitingCharge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/queries/waitingCharge')>()
  return { ...actual, addWaitingChargeLine: vi.fn() }
})

/* S2 row 6: the person types the minutes and the amount. Nothing is priced here. */

function typeInto(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const byId = (id: string) => document.body.querySelector(`#${id}`) as HTMLInputElement
const buttonText = (text: string) =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined

describe('AddWaitingChargeModal', () => {
  let container: HTMLDivElement
  let root: Root
  const onClose = vi.fn()
  const onAdded = vi.fn()

  async function open(): Promise<void> {
    await act(async () => {
      root.render(<AddWaitingChargeModal isOpen onClose={onClose} bookingId="b1" onAdded={onAdded} />)
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.innerHTML = ''
  })

  it('adds nothing and says why when the minutes or amount are missing', async () => {
    await open()
    await act(async () => {
      buttonText('Add waiting charge')?.click()
    })
    expect(addWaitingChargeLine).not.toHaveBeenCalled()
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('minutes waited')

    await act(async () => {
      typeInto(byId('waiting-minutes-input'), '25')
    })
    await act(async () => {
      buttonText('Add waiting charge')?.click()
    })
    expect(addWaitingChargeLine).not.toHaveBeenCalled()
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('more than 0')
  })

  it('sends the typed values with one key, then closes and tells the caller', async () => {
    vi.mocked(addWaitingChargeLine).mockResolvedValue({ lineId: 'l1', invoiceId: 'i1', appendedToDraft: true })
    await open()
    await act(async () => {
      typeInto(byId('waiting-minutes-input'), '25')
      typeInto(byId('waiting-amount-input'), '150')
      typeInto(byId('waiting-note-input'), 'Client late')
    })
    await act(async () => {
      buttonText('Add waiting charge')?.click()
    })
    expect(addWaitingChargeLine).toHaveBeenCalledWith('b1', 'key-fixed-1', { minutes: 25, amountPaisa: 15000, note: 'Client late' })
    expect(toast.show).toHaveBeenCalledWith('Waiting charge added', expect.stringContaining('draft invoice'))
    expect(onAdded).toHaveBeenCalledWith({ lineId: 'l1', invoiceId: 'i1', appendedToDraft: true })
    expect(onClose).toHaveBeenCalled()
  })

  it('says it bills when the invoice is created, if there is no draft invoice yet', async () => {
    vi.mocked(addWaitingChargeLine).mockResolvedValue({ lineId: 'l2', invoiceId: null, appendedToDraft: false })
    await open()
    await act(async () => {
      typeInto(byId('waiting-minutes-input'), '10')
      typeInto(byId('waiting-amount-input'), '50')
    })
    await act(async () => {
      buttonText('Add waiting charge')?.click()
    })
    expect(toast.show).toHaveBeenCalledWith('Waiting charge added', expect.stringContaining('bill when the invoice is created'))
  })

  it('keeps the modal open and shows the refusal when the database refuses an issued invoice', async () => {
    vi.mocked(addWaitingChargeLine).mockRejectedValue(new Error("This booking's invoice (INV-1) is already issued (Sent). Nothing was added."))
    await open()
    await act(async () => {
      typeInto(byId('waiting-minutes-input'), '10')
      typeInto(byId('waiting-amount-input'), '50')
    })
    await act(async () => {
      buttonText('Add waiting charge')?.click()
    })
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('already issued')
    expect(onClose).not.toHaveBeenCalled()
    expect(onAdded).not.toHaveBeenCalled()
    expect(toast.show).not.toHaveBeenCalled()
  })
})
