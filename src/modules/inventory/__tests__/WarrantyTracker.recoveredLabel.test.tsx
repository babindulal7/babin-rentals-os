// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => true,
}))

vi.mock('../../../lib/device', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop',
}))

// Premium Rs 18,000 and Rs 42,000 recovered: the ratio is 42,000 / 18,000 = 233%, a share of premium recovered.
vi.mock('../../../lib/queries/warranty', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/queries/warranty')>()),
  getWarrantyItems: () => [
    {
      id: 'WAR-TEST-1',
      name: 'Sony FX3',
      serialNo: 'SN-TEST-1',
      category: 'Cameras',
      provider: 'Sony Pro Nepal',
      startDate: '2024-03-14',
      endDate: '2027-03-14',
      termMonths: 36,
      premiumCost: 18000,
      claimsCount: 1,
      claimsRecovered: 42000,
      status: 'Active',
      daysRemaining: 900,
    },
  ],
}))

const { default: WarrantyTracker } = await import('../WarrantyTracker')

describe('WarrantyTracker: recovered-to-premium ratio is labelled for what it computes', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  it('reads "% of premium recovered" on a claimed item and never "% ROI"', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <WarrantyTracker />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('233% of premium recovered')
    expect(container.textContent).not.toContain('% ROI')
  })
})
