// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROWS } from '../../../data/rentals'
import { formatMoney, type Paisa } from '../../../lib/money'

const fixture = vi.hoisted(() => ({ money: true }))

vi.mock('../../../lib/moneyVisibility', async (orig) => ({
  ...(await orig<typeof import('../../../lib/moneyVisibility')>()),
  useCanViewMoney: () => fixture.money,
  useCanViewFinancialReports: () => fixture.money,
}))
vi.mock('../../../lib/device', () => ({ useViewport: () => 'desktop' }))

const { default: CustomReport } = await import('../CustomReport')

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  fixture.money = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('Custom report — Aggregated Volume', () => {
  it('equals the sum of the visible rows in paisa, not 100 times that sum', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <CustomReport />
        </MemoryRouter>,
      )
    })

    // Rentals is the default domain; every row's amount is already paisa.
    const sumPaisa = ROWS.reduce((total, b) => total + ((b.amount as number) || 0), 0)
    const tile = formatMoney(sumPaisa as Paisa)

    expect(sumPaisa).toBeGreaterThan(0)
    expect(container.textContent).toMatch(new RegExp(`Aggregated Volume\\s*${escapeRe(tile)}`))
    expect(container.textContent).not.toContain(formatMoney((sumPaisa * 100) as Paisa))
  })
})
