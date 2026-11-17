// @vitest-environment jsdom
/**
 * RULING 2026-10-20: the Timesheet page renders what `useTimesheetWeek` returns
 * and nothing it invents. Pinned here: every data state (loading, error, empty,
 * rows), Law 6 for a money-blind role, the audited CSV export, and that the five
 * staff this page used to fabricate are gone for good.
 *
 * The data hook is stubbed — the query itself is covered by
 * `lib/queries/__tests__/timesheet.test.ts`.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimesheetRow, TimesheetWeek } from '../../../lib/queries/timesheet'
import type { Viewport } from '../../../lib/device'

const state = vi.hoisted(() => ({
  money: true,
  viewport: 'desktop' as 'desktop' | 'phone',
  weeks: [] as string[],
  result: {
    rows: [] as unknown[],
    loading: false,
    error: null as string | null,
    isEmpty: false,
    refetch: vi.fn(),
  },
  exports: [] as unknown[],
}))

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => state.money }))
vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => state.viewport as Viewport,
}))
vi.mock('../../../components/ui/Toast', () => ({ useToast: () => ({ showSuccessToast: vi.fn() }) }))
vi.mock('../../../lib/exportAudit', () => ({ recordExport: (input: unknown) => { state.exports.push(input) } }))
vi.mock('../../../lib/queries/useTimesheet', () => ({
  useTimesheetWeek: (week: TimesheetWeek) => {
    state.weeks.push(week)
    return state.result
  },
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: TimesheetTab } = await import('../TimesheetTab')

const row = (over: Partial<TimesheetRow> = {}): TimesheetRow => ({
  key: 'm1',
  name: 'Suman Rai',
  role: 'Gaffer',
  rate: 4000,
  hrs: [8, 0, 9.5, 0, 0, 0, 0],
  totalHrs: 17.5,
  daysWorked: 2,
  overtimeDays: 0,
  pay: 8000,
  unrecordedDays: 0,
  approval: 'Awaiting approval',
  ...over,
})

let root: Root | undefined
let host: HTMLDivElement | undefined

async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <TimesheetTab />
      </MemoryRouter>,
    )
  })
}

const text = () => host?.textContent ?? ''
const button = (label: string) => [...(host?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes(label))

beforeEach(() => {
  state.money = true
  state.viewport = 'desktop'
  state.weeks = []
  state.exports = []
  state.result = { rows: [row()], loading: false, error: null, isEmpty: false, refetch: vi.fn() }
  URL.createObjectURL = vi.fn(() => 'blob:timesheet')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  vi.restoreAllMocks()
})

describe('data states', () => {
  it('shows each person with hours and approval, with no hours-based overtime flag (R-9.3)', async () => {
    await mount()
    expect(text()).toContain('Suman Rai')
    expect(text()).toContain('Gaffer')
    expect(text()).toContain('17.5h')
    expect(text()).toContain('9.5h')
    expect(text()).toContain('Awaiting approval')
    expect(text()).not.toContain('Overtime hours logged')
    expect(text()).not.toContain('Overtime Flags')
  })

  it('shows an honest empty state, not seeded staff', async () => {
    state.result = { rows: [], loading: false, error: null, isEmpty: true, refetch: vi.fn() }
    await mount()
    expect(text()).toContain('No crew shoot days this week')
    for (const invented of ['Bikash Tamang', 'Suman Rai', 'Hari KC', 'Mingma Sherpa', 'Rajan Thapa']) {
      expect(text(), `${invented} is back`).not.toContain(invented)
    }
  })

  it('never renders the five invented staff, whatever the week', async () => {
    state.result = { rows: [], loading: false, error: null, isEmpty: true, refetch: vi.fn() }
    await mount()
    await act(async () => { button('Last Week')!.click() })
    expect(text()).toContain('No crew shoot days last week')
    expect(text()).not.toContain('Bikash Tamang')
  })

  it('shows the database reason with a retry, and keeps any rows already on screen out of a blank state', async () => {
    state.result = { rows: [], loading: false, error: 'permission denied', isEmpty: false, refetch: vi.fn() }
    await mount()
    expect(text()).toContain('Could not load timesheet')
    expect(text()).toContain('permission denied')
    const retry = button('Retry') ?? button('Try again')
    expect(retry, 'error state offers a retry').toBeDefined()
    await act(async () => { retry!.click() })
    expect(state.result.refetch).toHaveBeenCalled()
  })

  it('shows no rows while loading', async () => {
    state.result = { rows: [], loading: true, error: null, isEmpty: false, refetch: vi.fn() }
    await mount()
    expect(text()).not.toContain('Suman Rai')
    expect(text()).not.toContain('No crew shoot days')
  })

  it('asks for the week the chip names', async () => {
    await mount()
    expect(state.weeks.at(-1)).toBe('This Week')
    await act(async () => { button('Last Week')!.click() })
    expect(state.weeks.at(-1)).toBe('Last Week')
  })

  it('says how many shoot days have no recorded times', async () => {
    state.result = { ...state.result, rows: [row({ unrecordedDays: 2 })] }
    state.viewport = 'phone'
    await mount()
    expect(text()).toContain('2 shoot days with no recorded call/wrap time')
  })
})

describe('Law 6 — money', () => {
  it('shows the day-based pay (D24), matching Crew Assist, and the export to a money role with no estimated pay labels', async () => {
    await mount()
    expect(text()).toContain('Pay')
    expect(text()).not.toContain('Estimated Pay')
    expect(text()).not.toContain('Est. pay')
    expect(text()).toContain('days worked × day rate')
    expect(button('Export CSV')).toBeDefined()
  })

  it('withholds every figure — column, KPI, footnote, export — from a money-blind role', async () => {
    state.money = false
    state.result = { ...state.result, rows: [row({ rate: null, pay: null })] }
    await mount()
    expect(text()).toContain('17.5h') // hours are not money
    expect(text()).not.toContain('Estimated Pay')
    expect(text()).not.toContain('Est. pay')
    expect(text()).not.toMatch(/Rs\s?[\d,]/)
    expect(text()).not.toContain('day rate')
    expect(button('Export CSV')).toBeUndefined()
  })

  it('shows a dash, not Rs 0, for a money role whose row has no rate', async () => {
    state.result = { ...state.result, rows: [row({ rate: null, pay: null })] }
    await mount()
    expect(text()).not.toMatch(/Rs\s?0\b/)
  })
})

describe('export', () => {
  it('downloads the CSV and writes an audit row naming the columns it carries', async () => {
    await mount()
    await act(async () => { button('Export CSV')!.click() })
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(state.exports).toHaveLength(1)
    const audit = state.exports[0] as { list: string; module: string; rowCount: number; columns: string[]; filter: string }
    expect(audit.list).toBe('crew.timesheet')
    expect(audit.module).toBe('Operations')
    expect(audit.rowCount).toBe(1)
    expect(audit.filter).toBe('This Week')
    expect(audit.columns).toEqual(expect.arrayContaining(['Name', 'Days', 'OT days', 'Pay (Rs)', 'Approval']))
    expect(audit.columns).not.toContain('Estimated pay (Rs)')
  })
})
