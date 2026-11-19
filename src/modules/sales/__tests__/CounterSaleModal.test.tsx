// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Set mock environment
process.env.VITE_DATA_SOURCE = 'mock'
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key'

// @ts-expect-error React 18 act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockProducts = [
  {
    id: '11111111-2222-4333-8444-555555555555',
    name: 'AA Rechargeable Batteries 4-Pack',
    asset_code: 'EQ-BATT',
    unit_sale_price: 400.0,
    total_quantity: 10,
  },
  {
    id: '66666666-7777-4888-8999-000000000000',
    name: 'Pro Gaffer Tape Black',
    asset_code: 'EQ-TAPE',
    unit_sale_price: 500.0,
    total_quantity: 5,
  },
]

const rpcSpy = vi.fn().mockResolvedValue({
  data: {
    booking_id: 'b-sale-1',
    booking_no: 'B-901',
    booking_kind: 'counter_sale',
    stage: 'Booked',
    line_count: 1,
    client_uuid: 'uuid-sale-1',
    status: 'created',
  },
  error: null,
})

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: mockProducts, error: null }),
          }),
        }),
      }),
    }),
    rpc: (...args: unknown[]) => rpcSpy(...args),
  },
  newClientUuid: () => '99999999-9999-4999-8999-999999999999',
}))

import { CounterSaleModal } from '../CounterSaleModal'

describe('CounterSaleModal', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    rpcSpy.mockClear()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders products and hides prices for money-blind role (Warehouse)', async () => {
    await act(async () => {
      root.render(
        <CounterSaleModal
          isOpen={true}
          onClose={vi.fn()}
          userId="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
          userRole="Warehouse"
        />
      )
    })

    // Allow async load
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(container.textContent).toContain('AA Rechargeable Batteries 4-Pack')
    expect(container.textContent).toContain('Stock: 10 available')
    // Law 6: Warehouse must never see unit price in DOM
    expect(container.textContent).not.toContain('Unit:')
    expect(container.textContent).not.toContain('400')
    expect(container.textContent).not.toContain('Total:')
  })

  it('renders prices for money role (Coordinator / Owner)', async () => {
    await act(async () => {
      root.render(
        <CounterSaleModal
          isOpen={true}
          onClose={vi.fn()}
          userId="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
          userRole="Coordinator"
        />
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(container.textContent).toContain('AA Rechargeable Batteries 4-Pack')
    expect(container.textContent).toContain('Stock: 10 available')
    expect(container.textContent).toContain('Unit:')
  })

  it('allows adding 3 batteries in <= 5 taps and completing sale', async () => {
    const handleSaleCreated = vi.fn()

    await act(async () => {
      root.render(
        <CounterSaleModal
          isOpen={true}
          onClose={vi.fn()}
          userId="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
          userRole="Warehouse"
          onSaleCreated={handleSaleCreated}
        />
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Tap 1: Add battery (qty = 1)
    const addBtn = container.querySelector(
      'button[aria-label="Add or increase quantity of AA Rechargeable Batteries 4-Pack"]'
    ) as HTMLButtonElement
    expect(addBtn).not.toBeNull()
    await act(async () => {
      addBtn.click()
    })

    // Tap 2: Increase battery (qty = 2)
    await act(async () => {
      addBtn.click()
    })

    // Tap 3: Increase battery (qty = 3)
    await act(async () => {
      addBtn.click()
    })

    expect(container.textContent).toContain('3 items selected')

    // Tap 4: Complete Counter Sale
    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Complete Counter Sale')
    ) as HTMLButtonElement
    expect(submitBtn).not.toBeNull()
    await act(async () => {
      submitBtn.click()
    })

    // Wait for async execution
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(rpcSpy).toHaveBeenCalledWith(
      'create_counter_sale',
      expect.objectContaining({
        p_payload: expect.objectContaining({
          lines: [{ product_id: '11111111-2222-4333-8444-555555555555', qty: 3, client_uuid: undefined }],
        }),
      })
    )

    expect(handleSaleCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'b-sale-1',
        bookingNo: 'B-901',
      })
    )
  })
})
