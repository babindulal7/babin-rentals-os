// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SubRental } from '../SubRental'
import * as subrentalsQuery from '../../../lib/queries/subrentals'
import type { SubRentalRecord } from '../../../lib/queries/subrentals'
import { rupees } from '../../../lib/money'

// @ts-expect-error React 18 act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-admin-1', role: 'Admin', email: 'admin@babinrentals.com' },
  }),
}))

vi.mock('../../../lib/device', () => ({
  useViewport: () => 'desktop',
  useCapability: () => ({ hasHover: true }),
}))

const sampleRecord: SubRentalRecord = {
  id: 'SR-2026-0001',
  counterparty: 'Apex Film Gear',
  linkedBooking: 'BK-2026-0012',
  direction: 'Borrowing',
  equipment: 'Arri Alexa Mini LF',
  quantity: 1,
  startDateBs: '2083/03/10',
  endDateBs: '2083/03/15',
  startDateAd: '24 Jun 2026',
  endDateAd: '29 Jun 2026',
  rentalValuePaisa: rupees(95000),
  revenuePaisa: rupees(95000),
  costPaisa: rupees(75000),
  status: 'Picked Up',
  isOverdue: false,
}

/** The no-records copy the Transactions tab already uses; the Suppliers tab shows it too when nothing is recorded. */
const NO_RECORDS_TITLE = 'No sub-rentals recorded yet'
const NO_RECORDS_DESCRIPTION = 'Cross-hire borrowings and lendings with external suppliers will appear here.'
/** The filter copy, shown only while a supplier search is active. */
const NO_MATCH_TITLE = 'No suppliers match'
const NO_MATCH_DESCRIPTION = 'Adjust your search to find a sub-rental partner.'

describe('SubRental Suppliers Directory empty states', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.restoreAllMocks()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const text = () => container.textContent ?? ''
  const clearSearchAction = () =>
    [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Clear search')

  async function openSuppliers() {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SubRental />
        </MemoryRouter>,
      )
    })
    const tab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find((b) => b.textContent?.includes('Suppliers Directory'))
    if (!tab) throw new Error('no "Suppliers Directory" tab on screen')
    await act(async () => {
      tab.click()
    })
    /* The Transactions tab shows the same no-records copy, so confirm the directory is the one on screen. */
    expect(container.querySelector('input[placeholder="Search supplier name…"]')).not.toBeNull()
  }

  function typeSupplierSearch(value: string) {
    const input = container.querySelector<HTMLInputElement>('input[placeholder="Search supplier name…"]')
    if (!input) throw new Error('no supplier search input on screen')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('with no search and no records, shows the no-records copy and no filter action', async () => {
    vi.spyOn(subrentalsQuery, 'listSubRentals').mockResolvedValue({ rows: [], total: 0 })

    await openSuppliers()

    expect(text()).toContain(NO_RECORDS_TITLE)
    expect(text()).toContain(NO_RECORDS_DESCRIPTION)
    expect(text()).not.toContain(NO_MATCH_TITLE)
    expect(text()).not.toContain(NO_MATCH_DESCRIPTION)
    expect(clearSearchAction()).toBeUndefined()
  })

  it('with a search that matches no supplier, keeps the filter copy and Clear search', async () => {
    vi.spyOn(subrentalsQuery, 'listSubRentals').mockResolvedValue({ rows: [sampleRecord], total: 1 })

    await openSuppliers()
    expect(text()).toContain('Apex Film Gear')

    typeSupplierSearch('no-such-partner')

    expect(text()).toContain(NO_MATCH_TITLE)
    expect(text()).toContain(NO_MATCH_DESCRIPTION)
    expect(text()).not.toContain(NO_RECORDS_TITLE)
    expect(clearSearchAction()).toBeDefined()
  })

  it('Clear search from the filter copy brings the supplier rows back', async () => {
    vi.spyOn(subrentalsQuery, 'listSubRentals').mockResolvedValue({ rows: [sampleRecord], total: 1 })

    await openSuppliers()
    typeSupplierSearch('no-such-partner')
    expect(text()).toContain(NO_MATCH_TITLE)

    const clear = clearSearchAction()
    expect(clear).toBeDefined()
    await act(async () => {
      clear!.click()
    })

    expect(text()).not.toContain(NO_MATCH_TITLE)
    expect(text()).toContain('Apex Film Gear')
  })
})
