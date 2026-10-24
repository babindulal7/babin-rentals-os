// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientCombobox } from '../ClientCombobox'
import { AddItemPanel } from '../AddItemPanel'
import { NO_WINDOW } from '../itemCatalogue'
import type { ClientRecord } from '../../../../lib/queries/clients'
import { rupees } from '../../../../lib/money'

vi.mock('../../../../lib/queries/clients', () => ({ CLIENTS_DATA: [] }))

const client: ClientRecord = {
  id: 'search-test', name: 'Search Test Client', email: 'search@example.test', phone: '9800000000',
  address: 'Test address', clientType: 'Organisation', membership: 'Creator', isBlocked: false,
  outstandingPaisa: rupees(0), depositHeldPaisa: rupees(0), creditLimitPaisa: rupees(0), creditUsedPaisa: rupees(0),
  currentRentalsCount: 0, activeBookings: [], contactPerson: { name: 'Test contact', designation: '', phone: '9800000000' },
  kycStatus: 'Verified', kycDocsCount: 1, totalRentalsCount: 1, totalSpentPaisa: rupees(0),
  lastRentalAd: '18 Jul 2026', lastRentalBs: '2083/04/03',
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: false, media, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('Booking search controls', () => {
  it('clears only the client query, keeps the committed selection and restores it on Escape', async () => {
    const select = vi.fn()
    const history = vi.fn()
    await act(async () => root.render(<ClientCombobox clients={[client]} selectedClientId={client.id}
      onSelect={select} onCreateNew={vi.fn()} showOutstanding={false}
      inputAction={<button type="button" onClick={history}>Client History</button>} />))
    const input = host.querySelector<HTMLInputElement>('[role="combobox"]')!
    await act(async () => input.focus())
    await type(input, 'unknown')
    const clear = host.querySelector<HTMLButtonElement>('[aria-label="Clear client search"]')!
    expect(clear).not.toBeNull()
    expect(clear.style.width).toBe('44px')
    await act(async () => clear.click())
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain(client.name)
    expect(select).not.toHaveBeenCalled()
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(input.value).toBe(client.name)
    expect(input.getAttribute('aria-expanded')).toBe('false')
    await act(async () => host.querySelector<HTMLButtonElement>('button:last-child')!.click())
    expect(history).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toMatch(/Outstanding|No balance due/)
  })

  it('opens the client list with its labelled button and selects by keyboard without submitting', async () => {
    const select = vi.fn()
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
    await act(async () => root.render(<form onSubmit={submit}><ClientCombobox clients={[client]}
      selectedClientId={null} onSelect={select} onCreateNew={vi.fn()} /></form>))
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Show clients"]')!.click())
    const input = host.querySelector<HTMLInputElement>('[role="combobox"]')!
    expect(input.getAttribute('aria-expanded')).toBe('true')
    await type(input, 'Search Test')
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    expect(select).toHaveBeenCalledWith(client)
    expect(submit).not.toHaveBeenCalled()
  })

  it.each([true, false])('clears equipment search with a 44px action and preserves filters (inline: %s)', async (inline) => {
    const add = vi.fn()
    await act(async () => root.render(<AddItemPanel inline={inline} window={NO_WINDOW} days={1}
      existingLineIds={[]} equipment={[]} bundles={[]} crew={[]} transport={[]} onAdd={add} />))
    if (!inline) await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Add item — search bundles, equipment and services"]')!.click())
    const input = host.querySelector<HTMLInputElement>('[role="combobox"]')!
    await act(async () => input.focus())
    const filter = host.querySelector<HTMLSelectElement>('[aria-label="Filter by availability"]')!
    await act(async () => { filter.value = 'available'; filter.dispatchEvent(new Event('change', { bubbles: true })) })
    await type(input, 'unmatched equipment')
    const clear = host.querySelector<HTMLButtonElement>('[aria-label="Clear search query"]')!
    expect(clear.style.width).toBe('44px')
    expect(clear.style.minHeight).toBe('44px')
    await act(async () => clear.click())
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(filter.value).toBe('available')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(add).not.toHaveBeenCalled()
  })
})
