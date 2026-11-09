// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SubRental } from '../SubRental'
import * as subRentalsApi from '../../../lib/queries/subrentals'
import type { Paisa } from '../../../lib/money'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-coord',
      name: 'Ram Coordinator',
      role: 'Coordinator',
    },
  }),
}))

describe('SubRental — error handling and loading truthfulness (UX-13)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.restoreAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders ErrorBanner with retry button when listSubRentals fails instead of false empty state', async () => {
    vi.spyOn(subRentalsApi, 'listSubRentals').mockRejectedValueOnce(new Error('Failed to query sub-rentals'))

    await act(async () => {
      root.render(
        <MemoryRouter>
          <SubRental />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('Could not load sub-rentals')
    expect(alert?.textContent).toContain('Failed to query sub-rentals')
    expect(container.textContent).not.toContain('No records found')
  })

  it('renders table data when listSubRentals succeeds', async () => {
    const mockRecord: subRentalsApi.SubRentalRecord = {
      id: 'SR-101',
      linkedBooking: 'BK-1001',
      counterparty: 'Partner Rentals Boudha',
      equipment: 'Sony A7S III Body',
      direction: 'Borrowing',
      quantity: 1,
      status: 'On Rent',
      startDateBs: '2083/03/10',
      endDateBs: '2083/03/15',
      startDateAd: '2026-11-06',
      endDateAd: '2026-11-08',
      rentalValuePaisa: 300000 as Paisa,
      revenuePaisa: 800000 as Paisa,
      costPaisa: 600000 as Paisa,
      isOverdue: false,
    }

    vi.spyOn(subRentalsApi, 'listSubRentals').mockResolvedValueOnce({
      rows: [mockRecord],
      total: 1,
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <SubRental />
        </MemoryRouter>,
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.textContent).toContain('SR-101')
    expect(container.textContent).toContain('Partner Rentals Boudha')
  })
})
