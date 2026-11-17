// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DepositSetup } from '../DepositSetup'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const mockRpc = vi.fn()
const mockFrom = vi.fn()

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
  newClientUuid: () => 'mock-uuid-1234',
}))

describe('DepositSetup component (T3-02)', () => {
  let container: HTMLDivElement
  let root: Root

  const sampleProducts = [
    {
      id: 'prod-1',
      name: 'Sony FX3 Camera',
      sku: 'CAM-FX3',
      category: 'Cameras',
      brand: 'Sony',
      deposit_fixed: 5000,
      deposit_percent: null,
      replacement_value: 450000,
      is_active: true,
      rental_enabled: true,
    },
    {
      id: 'prod-2',
      name: 'Aputure 600d Pro',
      sku: 'LIGHT-600D',
      category: 'Lighting',
      brand: 'Aputure',
      deposit_fixed: null,
      deposit_percent: 15,
      replacement_value: 200000,
      is_active: true,
      rental_enabled: true,
    },
    {
      id: 'prod-3',
      name: '50mm f/1.2 GM',
      sku: 'LENS-50',
      category: 'Lenses',
      brand: 'Sony',
      deposit_fixed: null,
      deposit_percent: null,
      replacement_value: 250000,
      is_active: true,
      rental_enabled: true,
    },
  ]

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.clearAllMocks()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'products_v') {
        const queryBuilder: Record<string, unknown> = {}
        queryBuilder.order = vi.fn().mockResolvedValue({
          data: sampleProducts,
          error: null,
        })
        queryBuilder.eq = vi.fn().mockReturnValue(queryBuilder)
        return {
          select: vi.fn().mockReturnValue(queryBuilder),
        }
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    })

    mockRpc.mockResolvedValue({ data: { success: true }, error: null })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders RestrictedState for money-blind Warehouse role (Law 6)', async () => {
    await act(async () => {
      root.render(<DepositSetup role="Warehouse" />)
    })

    expect(container.textContent).toContain('Deposit setup is a money role action')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('renders products, progress counter, and filter chips for money role (Owner)', async () => {
    await act(async () => {
      root.render(<DepositSetup role="Owner" />)
    })

    // Progress: 2 out of 3 set (67%)
    expect(container.textContent).toContain('2 / 3 set (67%)')
    expect(container.textContent).toContain('Sony FX3 Camera')
    expect(container.textContent).toContain('Aputure 600d Pro')
    expect(container.textContent).toContain('50mm f/1.2 GM')

    // Filter chips present
    expect(container.textContent).toContain('No deposit set (1)')
    expect(container.textContent).toContain('Deposit set (2)')
  })

  it('filters by "No deposit set" showing only products without deposit rule', async () => {
    await act(async () => {
      root.render(<DepositSetup role="Manager" />)
    })

    const noDepositBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('No deposit set'),
    )
    expect(noDepositBtn).toBeDefined()

    await act(async () => {
      noDepositBtn?.click()
    })

    expect(container.textContent).toContain('50mm f/1.2 GM')
    expect(container.textContent).not.toContain('Sony FX3 Camera')
    expect(container.textContent).not.toContain('Aputure 600d Pro')
  })

  it('saves row-level inline edit and executes RPC', async () => {
    await act(async () => {
      root.render(<DepositSetup role="Owner" />)
    })

    const prod3Row = container.querySelector('[data-testid="deposit-row-prod-3"]')
    expect(prod3Row).toBeDefined()

    const select = prod3Row?.querySelector('select')
    expect(select).toBeDefined()

    await act(async () => {
      if (select) {
        select.value = 'fixed'
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    const fixedInput = prod3Row?.querySelector('input[type="number"]') as HTMLInputElement
    expect(fixedInput).toBeDefined()

    await act(async () => {
      if (fixedInput) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set
        nativeInputValueSetter?.call(fixedInput, '2000')
        fixedInput.dispatchEvent(new Event('input', { bubbles: true }))
        fixedInput.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    const saveBtn = Array.from(prod3Row?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.trim() === 'Save',
    )
    expect(saveBtn).toBeDefined()

    await act(async () => {
      saveBtn?.click()
    })

    expect(mockRpc).toHaveBeenCalledWith('bulk_update_products', expect.objectContaining({
      p_product_ids: ['prod-3'],
      p_field: 'deposit_fixed',
      p_value: { deposit_fixed: 2000 },
    }))
  })
})
