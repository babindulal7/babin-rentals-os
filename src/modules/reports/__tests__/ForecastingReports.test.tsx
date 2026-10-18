// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import ForecastingReports from '../ForecastingReports'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let canSeeMoneyValue = true

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => canSeeMoneyValue,
}))

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: true,
  supabase: {
    from: () => ({ select: () => ({ then: (r: any) => Promise.resolve({ data: [] }).then(r) }) }),
  },
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { role: 'Owner' } }),
}))

describe('ForecastingReports — Law 16 & What-If Scenario Studio', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    canSeeMoneyValue = true
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('renders unvalidated forecast empty state honestly (Law 16)', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <ForecastingReports />
        </MemoryRouter>
      )
    })

    expect(host.textContent).toContain('Automated Predictive Forecasting')
    expect(host.textContent).toContain('Not computed yet')
    expect(host.textContent).toContain('No validated machine-learning forecast model backs this report')
  })

  it('restricts financial scenario studio for money-blind roles', () => {
    canSeeMoneyValue = false

    act(() => {
      root.render(
        <MemoryRouter>
          <ForecastingReports />
        </MemoryRouter>
      )
    })

    // Automated status still visible
    expect(host.textContent).toContain('Not computed yet')

    // Scenario studio restricted
    expect(host.textContent).toContain('Financial scenario simulation involves revenue modeling and is restricted')
    expect(host.querySelector('input[type="range"]')).toBeNull()
    expect(host.textContent).not.toContain('Baseline Annual Revenue')
  })

  it('renders interactive scenario studio with controls and KPI cards for financial users', () => {
    canSeeMoneyValue = true

    act(() => {
      root.render(
        <MemoryRouter>
          <ForecastingReports />
        </MemoryRouter>
      )
    })

    expect(host.textContent).toContain('Interactive What-If Scenario Studio')
    expect(host.textContent).toContain('Illustrative Scenario · What-If Simulation')

    // Controls
    const baselineInput = host.querySelector<HTMLInputElement>('#scenario-baseline')
    expect(baselineInput).not.toBeNull()
    expect(baselineInput?.value).toBe('10000000')

    const slider = host.querySelector<HTMLInputElement>('#scenario-growth')
    expect(slider).not.toBeNull()
    expect(slider?.value).toBe('15')

    // KPI cards
    const labels = Array.from(host.querySelectorAll('.analytics-kpi-card__label')).map(el => el.textContent)
    expect(labels).toContain('Baseline Annual Revenue')
    expect(labels).toContain('Applied Annual Growth')

    // Multi-series chart present
    expect(host.querySelector('svg[aria-label*="Hypothetical Growth Trajectories"]')).not.toBeNull()

    // Legend has scenario provenance tag
    expect(host.textContent).toContain('scenario')
  })

  it('updates projections when user selects a different horizon', () => {
    canSeeMoneyValue = true

    act(() => {
      root.render(
        <MemoryRouter>
          <ForecastingReports />
        </MemoryRouter>
      )
    })

    // Find the 5 yrs button
    const horizonButtons = host.querySelectorAll('button[aria-pressed]')
    const fiveYearBtn = Array.from(horizonButtons).find(btn => btn.textContent?.includes('5 yrs'))
    expect(fiveYearBtn).toBeDefined()

    // Click 5 yrs button
    act(() => {
      fiveYearBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // The KPI card label updates to 5-Year Cumulative Projection
    expect(host.textContent).toContain('5-Year Cumulative Projection')
  })
})
