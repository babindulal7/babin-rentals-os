// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import RentalReports from '../RentalReports'

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
  canSeeMoney: true,
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => state.canSeeMoney,
}))

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: true,
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [] }),
    }),
  },
}))

describe('RentalReports UI Component', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    state.canSeeMoney = true
  })

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount()
      })
      container.remove()
      container = null
      root = null
    }
    vi.clearAllMocks()
  })

  it('mounts cleanly and displays rental performance KPIs with money visible', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <RentalReports />
        </MemoryRouter>,
      )
    })

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Rentals Reports')
    expect(bodyText).toContain('Performance')
    expect(bodyText).toContain('Rental Revenue')
    expect(bodyText).toContain('Rs 48,25,000')
  })

  it('hides monetary amounts from money-blind roles (Law 6)', async () => {
    state.canSeeMoney = false

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <RentalReports />
        </MemoryRouter>,
      )
    })

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Rentals Reports')
    expect(bodyText).toContain('Rental Revenue—')
    expect(bodyText).not.toContain('Rs 48,25,000')
    expect(bodyText).not.toContain('Rs 4,85,000')
  })
})
