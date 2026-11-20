// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { SystemRole } from '../../../types/database'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

const state = vi.hoisted(() => ({
  role: 'Owner' as SystemRole,
  cashFlow: vi.fn(),
  workingCapital: vi.fn(),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Test User', role: state.role, isSharedDevice: false } }),
}))
vi.mock('../../../lib/queries/liquidity', () => ({
  getCashFlowSummary: state.cashFlow,
  getWorkingCapitalSummary: state.workingCapital,
}))

import CashFlowReport from '../CashFlowReport'
import WorkingCapitalReport from '../WorkingCapitalReport'

const pages = [
  { name: 'Cash Flow', Page: CashFlowReport, read: () => state.cashFlow },
  { name: 'Working Capital', Page: WorkingCapitalReport, read: () => state.workingCapital },
] as const

const REFUSED: SystemRole[] = ['Coordinator', 'Warehouse', 'Technician', 'Driver', 'Client']
const PERMITTED: SystemRole[] = ['Owner', 'Admin', 'Manager', 'Accounts']

let container: HTMLDivElement
let root: Root

async function render(Page: () => JSX.Element) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    )
  })
}

beforeEach(() => {
  state.cashFlow.mockReset().mockReturnValue(new Promise(() => {}))
  state.workingCapital.mockReset().mockReturnValue(new Promise(() => {}))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe.each(pages)('$name — who may open the company report (R17-9, PERMISSIONS §5)', ({ Page, read }) => {
  it.each(REFUSED)('%s: the restricted state, and no read is sent', async (role) => {
    state.role = role
    await render(Page)
    // The read first: a refused role must never send it, whatever the page says.
    expect(read()).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Owner, Admin, Manager or Accounts')
    expect(container.textContent).not.toContain('Coordinator')
  })

  it.each(PERMITTED)('%s: the report is read', async (role) => {
    state.role = role
    await render(Page)
    expect(read()).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toContain('Owner, Admin, Manager or Accounts')
  })
})
