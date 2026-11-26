// @vitest-environment jsdom
/**
 * What the report pages draw from their queries, for the copy and empty-state
 * fixes from the app audit. The query side is covered by the query tests beside
 * operationReports, activityReports and clientReports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { SystemRole } from '../../../types/database'

const state = vi.hoisted(() => ({
  role: 'Owner' as SystemRole,
  answers: {} as Record<string, () => Promise<unknown>>,
}))
const answer = (key: string) => () => (state.answers[key] ?? (() => new Promise(() => {})))()

vi.mock('../../../lib/supabase', () => ({ IS_MOCK: true, supabase: {} }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Test User', role: state.role } }),
}))
vi.mock('../../../lib/queries/rentalReports', () => ({
  getRentalPerformanceReport: vi.fn(answer('rental')),
  getRentalDurationReport: vi.fn(answer('rentalDuration')),
  getCancellationsReport: vi.fn(answer('rentalCancel')),
}))
vi.mock('../../../lib/queries/operationReports', () => ({ getOperationsReport: vi.fn(answer('ops')) }))
vi.mock('../../../lib/queries/damageMaintenanceReports', () => ({ getDamageMaintenanceReport: vi.fn(answer('dm')) }))
vi.mock('../../../lib/queries/activityReports', () => ({ getActivityReport: vi.fn(answer('activity')) }))
vi.mock('../../../lib/queries/equipmentPerformance', () => ({ getEquipmentPerformanceSummary: vi.fn(answer('equipment')) }))

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const pages = {
  RentalReports: (await import('../RentalReports')).default,
  OperationsReports: (await import('../OperationsReports')).default,
  DamageMaintenanceReports: (await import('../DamageMaintenanceReports')).default,
  ActivityReports: (await import('../ActivityReports')).default,
  EquipmentPerformance: (await import('../EquipmentPerformance')).default,
}

const P = 0 as never

/* ── Query answers ──────────────────────────────────────────────────────────── */

// A return is on the page so the operations report is not "nothing at all", and no handover is.
const opsNoHandover = {
  metrics: { totalPickups: 0, onTimePickupRate: null, totalReturns: 1, onTimeReturnRate: 100, currentlyOverdue: 0, totalPackingJobs: 0, packingFulfillmentRate: null, idVerificationRate: null },
  deliveryMethods: [],
  returnConditions: [{ condition: 'Good', count: 1, percent: 100 }],
  pickups: [],
  returns: [{ id: 'r1', bookingNo: 'BK-1', clientName: 'Sagarmatha', returnAt: '2026-11-20T09:00:00Z', returningPerson: 'Sita', condition: 'Good', damageSuspected: false, status: 'Completed' }],
  overdueList: [],
  packingJobs: [],
}

const packingJob = (id: string, bookingNo: string, latePickup: boolean) => ({
  id, bookingNo, clientName: 'Sagarmatha', project: 'Film', pickupScheduled: latePickup ? '2026-07-16T00:15:00Z' : '2026-11-24T10:00:00Z',
  itemCount: 3, state: 'pending', latePickup,
})
const opsPacking = {
  ...opsNoHandover,
  packingJobs: [packingJob('p1', 'BK-LATE', true), packingJob('p2', 'BK-UPCOMING', false)],
}

const activity = {
  metrics: { totalEvents: 4, successfulEvents: 4, failedEvents: 0, criticalEvents: 0, activeOperators: 1, mostActiveModule: 'Rentals', mostActiveOperator: 'Babin Dulal' },
  eventsByCategory: [{ label: 'Rentals', count: 3, percentage: 75, color: 'var(--primary)' }, { label: 'Authentication', count: 1, percentage: 25, color: '#8b5cf6' }],
  eventsBySeverity: [{ label: 'Informational', count: 4, percentage: 100, color: 'var(--muted)' }],
  staffSummaries: [{
    userId: 'u1', name: 'Babin Dulal', role: 'Owner', employeeCode: 'E-1', totalActions: 4,
    actionsBreakdown: { Rentals: 3, Authentication: 1 }, otherActions: 1, lastActive: '2026-11-24T03:29:00Z', recentAction: 'Login',
  }],
  recentEvents: [{
    id: 'e1', timestamp: '2026-11-24T03:29:00Z', actorId: 'u1', actorName: 'Babin Dulal', actorRole: 'Owner', action: 'Login',
    category: 'Authentication', module: 'Authentication', severity: 'Informational', status: 'Success', tableName: 'auth.sessions',
    recordId: '8788b5fd-0000-4000-8000-000000000000', ipAddress: null, deviceType: null, reason: null,
  }],
}

const perf = (id: string, name: string, revenue: number, units: number, revenuePerUnit: number | null) => ({
  productId: id, name, category: 'Cameras', revenue, bookings: 2, units, revenuePerUnit,
})
// Money is paisa: Rs 1,500 is 150000. The lowest-per-unit list is passed in an
// order that is not sorted by per-unit value, so the table's own sort is what is tested.
const topPerformers = [
  perf('p1', 'Sony FX3', 132050000, 2, 66025000),
  perf('p2', 'Aputure 600D Pro', 67680000, 1, 67680000),
  perf('p3', 'DJI Ronin 4D', 60000000, 1, 60000000),
  perf('p4', 'DJI RS 3 Pro', 50540000, 1, 50540000),
  perf('p5', 'Sony FE 24-70mm', 39000000, 1, 39000000),
]
const worstPerformers = [
  perf('w1', 'Boom Pole Carbon 3m', 150000, 1, 150000),
  perf('w2', 'Kupo Grip Head 4in', 70000, 1, 70000),
  perf('w3', 'Manfrotto Super Clamp', 21000, 1, 21000),
]
const equipment = {
  revenue: 4000000,
  productsRented: 8,
  rows: [...topPerformers, ...worstPerformers],
  topPerformers,
  worstPerformers,
}

const durations = { totalRentals: 4, averageDuration: 2.5, medianDuration: 2, longestDuration: 1, shortestDuration: 3, buckets: [] }
const rentalPerformance = {
  metrics: { totalBookings: 4, activeRentals: 1, completedRentals: 2, cancelledRentals: 0, totalRevenue: P, averageBookingValue: P, totalRentalDays: 10, averageDurationDays: 2.5 },
  stages: [], projectTypes: [], topBookings: [],
}
const noCancellations = { totalCancellations: 0, cancellationRate: 0, totalLostRevenue: P, averageNoticeDays: null, reasons: [], cancelledBookings: [] }

const damageWithoutCategories = {
  metrics: { totalFindings: 0, totalDamageCost: P, totalChargedToClient: P, activeRepairs: 0, averageTurnaroundDays: null, totalRepairSpend: P, routineServicesCompleted: 0, fleetAvailabilityRate: null, sidelinedUnitsCount: 0, rentalReadyUnits: 0 },
  severityBreakdown: [],
  damageTypeBreakdown: [],
  incidents: [],
  // One repair keeps the page from its nothing-yet state; the damage tab does not draw repairs.
  repairs: [{ id: 'rp1' }],
  servicing: [],
  sidelinedUnits: [],
}

/* ── Render helpers ─────────────────────────────────────────────────────────── */

let container: HTMLDivElement
let root: Root
async function render(Page: () => React.ReactElement | null) {
  await act(async () => root.render(<MemoryRouter><Page /></MemoryRouter>))
}
const text = () => container.textContent ?? ''
const countOf = (needle: string) => text().split(needle).length - 1
async function clickTab(label: string) {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
  expect(button, `tab "${label}"`).toBeDefined()
  await act(async () => button?.click())
}
/** The text of a report card, found by its heading. Its cards are plain divs whose heading is a direct child. */
const cardText = (heading: string) => {
  const h3 = [...container.querySelectorAll('h3')].find((h) => h.textContent?.trim() === heading)
  expect(h3, `card "${heading}"`).toBeDefined()
  return h3?.parentElement?.textContent ?? ''
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  state.role = 'Owner'
  state.answers = {}
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Operations: the handover split and the packing queue', () => {
  it('shows no split, and says so, when no handover has been completed', async () => {
    state.answers.ops = () => Promise.resolve(opsNoHandover)
    await render(pages.OperationsReports)
    await clickTab('Pickups & Handover')
    expect(cardText('Handover Fulfillment Method')).toContain('No completed handovers to show.')
    expect(text()).not.toContain('Pickup 120')
  })

  it('flags the packing job whose pickup is already late, and no other', async () => {
    state.answers.ops = () => Promise.resolve(opsPacking)
    await render(pages.OperationsReports)
    await clickTab('Packing Fulfillment')
    expect(countOf('Late pickup')).toBe(1)
    const late = [...container.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes('BK-LATE'))
    expect(late?.textContent).toContain('Late pickup')
    const upcoming = [...container.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes('BK-UPCOMING'))
    expect(upcoming?.textContent).not.toContain('Late pickup')
  })
})

describe('Activity: Operator Breakdown and the audit stream', () => {
  it('adds an Other column, so the domain columns add up to Total Actions', async () => {
    state.answers.activity = () => Promise.resolve(activity)
    await render(pages.ActivityReports)
    await clickTab('Operator Breakdown')
    const headers = [...container.querySelectorAll('th')].map((th) => th.textContent?.trim())
    expect(headers).toContain('Other')
    const cells = [...(container.querySelector('tbody tr')?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.trim())
    // Staff, role, total, Rentals, Operations, Inventory, Finance, Other, last active.
    expect(cells).toHaveLength(9)
    expect(cells[2]).toBe('4')
    expect(cells[3]).toBe('3')
    expect(cells[7]).toBe('1')
  })

  it('names the audit target in staff words, with no table name or system name', async () => {
    state.answers.activity = () => Promise.resolve(activity)
    await render(pages.ActivityReports)
    await clickTab('Audit Trail Stream')
    expect(text()).toContain('Sign-in 8788b5fd')
    expect(text()).not.toContain('auth.sessions')
    expect(text()).not.toContain('PostgreSQL')
    expect(text()).not.toContain('audit_events')
  })
})

describe('Equipment performance tables', () => {
  it('captions both five-row tables, and leads the lowest-per-unit table with Per Unit', async () => {
    state.answers.equipment = () => Promise.resolve(equipment)
    await render(pages.EquipmentPerformance)
    expect(text()).toContain('Top 5 products by revenue.')
    expect(text()).toContain('Lowest 5 products by revenue per unit, lowest first.')

    const lowest = container.querySelector('section[aria-label="Lowest Revenue per Unit"]')
    expect(lowest).not.toBeNull()
    expect(lowest?.querySelector('thead th')?.textContent).toContain('Per Unit')
    // Sorted ascending by per-unit value: the Rs 210 product leads, not the alphabetically first one.
    expect(lowest?.querySelector('tbody tr td')?.textContent).toContain('Rs 210')
  })
})

describe('Rentals: duration labels and the cancellation chart', () => {
  it('pluralises the shortest and longest rental from the count', async () => {
    state.answers.rental = () => Promise.resolve(rentalPerformance)
    state.answers.rentalDuration = () => Promise.resolve(durations)
    state.answers.rentalCancel = () => Promise.resolve(noCancellations)
    await render(pages.RentalReports)
    await clickTab('Duration')
    expect(text()).toMatch(/Shortest Rental\W*3 Days/)
    expect(text()).toMatch(/Longest Rental\W*1 Day(?!s)/)
  })

  it('says so inside the cancellation causes chart when there are none', async () => {
    state.answers.rental = () => Promise.resolve(rentalPerformance)
    state.answers.rentalDuration = () => Promise.resolve(durations)
    state.answers.rentalCancel = () => Promise.resolve(noCancellations)
    await render(pages.RentalReports)
    await clickTab('Cancellations')
    expect(cardText('Primary Cancellation Causes')).toContain('No cancelled bookings to show.')
  })
})

describe('Damage findings charts', () => {
  it('say so inside the severity and damage-category panels when there is nothing to chart', async () => {
    state.answers.dm = () => Promise.resolve(damageWithoutCategories)
    await render(pages.DamageMaintenanceReports)
    expect(cardText('Findings by Severity Rating')).toContain('No damage findings to show.')
    expect(cardText('Primary Damage Categories')).toContain('No damage findings to show.')
  })
})
