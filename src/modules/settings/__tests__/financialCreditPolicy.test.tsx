// @vitest-environment jsdom
/**
 * RULING 2026-10-18 (Babin's ruling): the tier credit policy lives in
 * Settings ▸ Business with the other business rules. It is read live from
 * `membership_plans`, never from the hard-coded plan list.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/queries/useClients', () => ({
  useMembershipPlans: () => ({
    rows: [
      { level: 'Creator', label: 'Creator', defaultCreditLimit: 2_500_000, individualDiscountPct: 5 },
      { level: 'Elite', label: 'Elite', defaultCreditLimit: null, individualDiscountPct: null },
    ],
    loading: false,
    error: null,
    isEmpty: false,
    refetch: vi.fn(),
  }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { FinancialPane } = await import('../sections/Financial')

let root: Root | undefined
let host: HTMLDivElement | undefined

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  host?.remove()
})

describe('Settings ▸ Business — credit policy by tier', () => {
  it('renders the live tier policy inside the Business money pane', async () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(
        <MemoryRouter>
          <FinancialPane />
        </MemoryRouter>,
      )
    })
    const text = host.textContent ?? ''
    expect(text).toContain('Credit policy by membership tier')
    expect(text).toContain('Creator')
    // Elite's limit and discount are null in the table: never shown as a number.
    expect(text).toContain('Negotiated')
  })
})
