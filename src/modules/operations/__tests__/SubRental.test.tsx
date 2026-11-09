// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
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

const sampleRecords: SubRentalRecord[] = [
  {
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
  },
]

describe('SubRental component (#19 Five Screen States & Error Handling)', () => {
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

  it('renders loading skeleton and dash count while query is pending', async () => {
    // Hang promise to test loading state
    vi.spyOn(subrentalsQuery, 'listSubRentals').mockReturnValue(new Promise(() => {}))

    await act(async () => {
      root.render(
        <MemoryRouter>
          <SubRental />
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('Loading sub-rental register…')
    expect(container.textContent).toContain('—')
  })

  it('renders ErrorBanner and retry affordance when listSubRentals fails (#19)', async () => {
    vi.spyOn(subrentalsQuery, 'listSubRentals').mockRejectedValue(new Error('PostgREST connection refused'))

    await act(async () => {
      root.render(
        <MemoryRouter>
          <SubRental />
        </MemoryRouter>,
      )
    })

    // Must NOT silently show "0 records" and "No records found"
    expect(container.textContent).toContain('Could not load sub-rentals')
    expect(container.textContent).toContain('PostgREST connection refused')
    expect(container.textContent).toContain('Unable to load sub-rentals')

    const retryBtns = container.querySelectorAll('button')
    const hasRetry = Array.from(retryBtns).some((b) => b.textContent?.includes('Retry'))
    expect(hasRetry).toBe(true)
  })

  it('re-fetches and displays records upon clicking Retry after an error', async () => {
    const listSpy = vi.spyOn(subrentalsQuery, 'listSubRentals')
      .mockRejectedValueOnce(new Error('Network offline'))
      .mockResolvedValueOnce({ rows: sampleRecords, total: 1 })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <SubRental />
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('Network offline')

    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Retry'))!
    expect(retryBtn).toBeDefined()

    await act(async () => {
      retryBtn.click()
    })

    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(container.textContent).not.toContain('Network offline')
    expect(container.textContent).toContain('SR-2026-0001')
    expect(container.textContent).toContain('Apex Film Gear')
  })

  it('renders honest initial empty state when no records exist', async () => {
    vi.spyOn(subrentalsQuery, 'listSubRentals').mockResolvedValue({ rows: [], total: 0 })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <SubRental />
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('No sub-rentals recorded yet')
    expect(container.textContent).toContain('Cross-hire borrowings and lendings with external suppliers will appear here.')
  })

  it('renders records table and filter counts when data is loaded successfully', async () => {
    vi.spyOn(subrentalsQuery, 'listSubRentals').mockResolvedValue({ rows: sampleRecords, total: 1 })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <SubRental />
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('SR-2026-0001')
    expect(container.textContent).toContain('Arri Alexa Mini LF')
    expect(container.textContent).toContain('Apex Film Gear')
    expect(container.textContent).toContain('Borrowing (1) · Lending (0)')
  })
})
