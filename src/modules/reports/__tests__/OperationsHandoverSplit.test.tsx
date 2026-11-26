// @vitest-environment jsdom
/**
 * The Handover Fulfillment Method card. It draws the booking split only once a
 * handover has been completed in the period (Total Dispatches above zero), and
 * says so otherwise.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({
  answer: (): Promise<unknown> => new Promise(() => {}),
}))

vi.mock('../../../lib/supabase', () => ({ IS_MOCK: true, supabase: {} }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Test User', role: 'Owner' } }),
}))
vi.mock('../../../lib/queries/operationReports', () => ({
  getOperationsReport: vi.fn(() => state.answer()),
}))

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const OperationsReports = (await import('../OperationsReports')).default

const returnRow = {
  id: 'r1', bookingNo: 'BK-1', clientName: 'Sagarmatha', returnAt: '2026-11-20T09:00:00Z',
  returningPerson: 'Sita', condition: 'Good', damageSuspected: false, status: 'Completed',
}

const base = {
  metrics: {
    totalPickups: 0, onTimePickupRate: null, totalReturns: 1, onTimeReturnRate: 100,
    currentlyOverdue: 0, totalPackingJobs: 0, packingFulfillmentRate: null, idVerificationRate: null,
  },
  deliveryMethods: [] as Array<{ method: string; count: number; percent: number }>,
  returnConditions: [{ condition: 'Good', count: 1, percent: 100 }],
  pickups: [],
  returns: [returnRow],
  overdueList: [],
  packingJobs: [],
}

// Bookings exist and split by delivery type, but no handover has been completed.
const bookingsOnly = {
  ...base,
  deliveryMethods: [{ method: 'Client Pickup', count: 120, percent: 100 }],
}

// Two handovers completed: the booking split is drawn.
const withHandovers = {
  ...base,
  metrics: { ...base.metrics, totalPickups: 2, idVerificationRate: 100 },
  deliveryMethods: [
    { method: 'Client Pickup', count: 1, percent: 50 },
    { method: 'Babin Delivery', count: 1, percent: 50 },
  ],
}

let container: HTMLDivElement
let root: Root

async function render() {
  await act(async () => root.render(<MemoryRouter><OperationsReports /></MemoryRouter>))
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

function cardText(heading: string): string {
  const h3 = [...container.querySelectorAll('h3')].find((h) => h.textContent?.trim() === heading)
  expect(h3, `card "${heading}"`).toBeDefined()
  return h3?.parentElement?.textContent ?? ''
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Handover Fulfillment Method card', () => {
  it('says there are no completed handovers, and draws no split, when none is completed', async () => {
    state.answer = () => Promise.resolve(bookingsOnly)
    await render()
    const card = cardText('Handover Fulfillment Method')
    expect(card).toContain('No completed handovers to show.')
    expect(card).not.toContain('Client Pickup')
  })

  it('draws the booking split once a handover has been completed', async () => {
    state.answer = () => Promise.resolve(withHandovers)
    await render()
    const card = cardText('Handover Fulfillment Method')
    expect(card).toContain('Client Pickup')
    expect(card).toContain('Babin Delivery')
    expect(card).not.toContain('No completed handovers to show.')
  })
})
