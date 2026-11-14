// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { SPEC_TABS, FINANCE_TAB_ROUTES } from '../../../data/nav'
import Finance from '../Finance'
import Payments from '../Payments'
import { financeTabPath } from '../../../lib/routeTargets'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

// Roomy desktop viewport so all buttons are rendered
vi.mock('../../../lib/device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/device')>()
  return {
    ...actual,
    useViewport: () => 'desktop',
    useTabularLayout: () => true,
    useDevice: () => ({ isPhone: false, isTablet: false, isDesktop: true }),
  }
})

let currentRole = 'Owner'
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', role: currentRole, branch_id: 'b1' },
    session: { user: { id: 'test-user' } },
  }),
}))

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: true,
  newClientUuid: () => 'test-uuid',
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null, count: 0 }),
          single: () => Promise.resolve({ data: null, error: null }),
        }),
        order: () => Promise.resolve({ data: [], error: null, count: 0 }),
      }),
    }),
  },
}))

describe('Card E-7 — Finance tabs simplification (R-10.8, R-10.9, G-12)', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    currentRole = 'Owner'
    return () => {
      container.remove()
    }
  })

  it('R-10.8: SPEC_TABS["/finance"] has exactly 4 tabs: Invoices · Payments · Expenses · Reports', () => {
    expect(SPEC_TABS['/finance']).toEqual(['Invoices', 'Payments', 'Expenses', 'Reports'])
  })

  it('R-10.8: FINANCE_TAB_ROUTES gives every tab an entry matching its destination', () => {
    expect(Object.keys(FINANCE_TAB_ROUTES)).toEqual(['Invoices', 'Payments', 'Expenses', 'Reports'])
    expect(FINANCE_TAB_ROUTES['Invoices']).toBe('/finance')
    expect(FINANCE_TAB_ROUTES['Payments']).toBe('/finance/payments')
    expect(FINANCE_TAB_ROUTES['Expenses']).toBe('/finance/expenses')
    expect(FINANCE_TAB_ROUTES['Reports']).toBe('/reports/pulse')
  })

  it('R-10.8: /finance renders exactly 4 tabs in the SegmentedControl', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/finance']}>
          <Finance />
        </MemoryRouter>,
      )
    })

    const segmented = container.querySelector('[aria-label="Finance sections"]')
    expect(segmented).not.toBeNull()
    const tabs = [...(segmented?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim())
    expect(tabs).toEqual(['Invoices', 'Payments', 'Expenses', 'Reports'])
  })

  it('R-10.8: landing on /finance defaults to Invoices tab with invoice actions', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/finance']}>
          <Finance />
        </MemoryRouter>,
      )
    })

    const newInvoiceBtn = container.querySelector('button[aria-label="Create Invoice"]')
    expect(newInvoiceBtn).not.toBeNull()
    expect(container.textContent).toContain('Outstanding Invoices')
  })

  it('R-10.9: /finance?tab=reports renders Dashboard section (Collections by day & Outstanding invoices) at top of Reports', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/finance?tab=reports']}>
          <Finance />
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('Collections by day')
    expect(container.textContent).toContain('Outstanding invoices')
  })

  it('R-10.9: Payments renders a Daily Closing button that opens Daily Closing modal', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/finance/payments']}>
          <Payments />
        </MemoryRouter>,
      )
    })

    const closingBtn = container.querySelector('[data-testid="daily-closing-button"]')
    expect(closingBtn).not.toBeNull()
    expect(closingBtn?.textContent).toContain('Daily Closing')

    await act(async () => {
      ;(closingBtn as HTMLButtonElement).click()
    })

    const modal = document.body.querySelector('[role="dialog"]')
    expect(modal).not.toBeNull()
    expect(modal?.textContent).toContain('Daily Closing')
  })

  it('R-10.9: Payments opens Daily Closing modal when action=closing query param is present', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/finance/payments?action=closing']}>
          <Payments />
        </MemoryRouter>,
      )
    })

    const modal = document.body.querySelector('[role="dialog"]')
    expect(modal).not.toBeNull()
    expect(modal?.textContent).toContain('Daily Closing')
  })

  it('G-12: financeTabPath maps legacy documents to /rentals?tab=documents and closing to /finance?tab=payments&action=closing', () => {
    expect(financeTabPath('documents')).toBe('/rentals?tab=documents')
    expect(financeTabPath('closing')).toBe('/finance?tab=payments&action=closing')
  })

  it('Law 6: Money-blind role (Warehouse) sees restricted view on Finance and cannot see monetary tabs/actions', async () => {
    currentRole = 'Warehouse'
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/finance']}>
          <Finance />
        </MemoryRouter>,
      )
    })

    const text = container.textContent ?? ''
    expect(text).toContain('restricted')
    expect(container.querySelector('button[aria-label="Record Payment"]')).toBeNull()
  })
})
