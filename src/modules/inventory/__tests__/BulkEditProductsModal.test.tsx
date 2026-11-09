// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BulkEditProductsModal } from '../modals/BulkEditProductsModal'
import type { InventoryListRow } from '../../../lib/queries/inventory'
import type { Paisa } from '../../../lib/money'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

// Mock dependencies
const mockBulkUpdateProducts = vi.fn()
vi.mock('../../../actions/inventory/bulkUpdateProducts', () => ({
  bulkUpdateProducts: (...args: unknown[]) => mockBulkUpdateProducts(...args),
}))

vi.mock('../../../lib/supabase', () => ({
  newClientUuid: () => 'batch-uuid-001',
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'products_v') {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'prod-1',
                  asset_code: 'EQ000001',
                  name: 'Sony FX3',
                  category_id: 'cat-1',
                  brand: 'Sony',
                  daily_rate: 3500,
                  weekly_rate: 17500,
                  monthly_rate: 52500,
                  deposit_percent: 10,
                  deposit_fixed: 0,
                  prep_time_minutes: 15,
                  cleaning_time_minutes: 15,
                  inspection_required: true,
                  packing_required: true,
                  rental_enabled: true,
                  is_active: true,
                  reorder_level: 1,
                },
              ],
              error: null,
            }),
          })),
        }
      }
      if (table === 'inventory_categories') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'cat-1', name: 'Cameras', code: 'camera' }],
                error: null,
              }),
            })),
          })),
        }
      }
      return { select: vi.fn() }
    }),
  },
}))

let currentRole = 'Owner'
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Babin Dulal', role: currentRole },
  }),
}))

vi.mock('../../../lib/network', () => ({
  useNetwork: () => true,
}))

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({
    showSuccessToast: vi.fn(),
    showErrorToast: vi.fn(),
  }),
}))

const sampleProducts: InventoryListRow[] = [
  {
    id: 'prod-1',
    assetCode: 'EQ000001',
    name: 'Sony FX3',
    shortName: 'FX3',
    brand: 'Sony',
    model: 'ILME-FX3',
    categoryId: 'cat-1',
    category: 'Camera' as never,
    categoryCode: 'camera',
    trackingMode: 'Serialised',
    recordState: 'Active',
    isActive: true,
    totalQuantity: 2,
    quantityUnit: 'Unit' as never,
    createdAtAd: '2026-01-01T00:00:00Z',
    unitCount: 2,
    unitCountExcludingRetired: 2,
    unitsByState: {} as never,
    unitConditions: [],
    dailyRate: 3500 as unknown as Paisa,
    replacementValue: 450000 as unknown as Paisa,
  },
]

describe('BulkEditProductsModal (T4-12, B32, B33)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    currentRole = 'Owner'
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders product count and modal header', async () => {
    await act(async () => {
      root.render(
        <BulkEditProductsModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          selectedProducts={sampleProducts}
          canViewMoney={true}
        />
      )
    })

    expect(container.textContent).toContain('Bulk Edit Products')
    expect(container.textContent).toContain('1 product selected')
  })

  it('omits all money fields for money-blind roles under Law 6', async () => {
    currentRole = 'Warehouse'
    await act(async () => {
      root.render(
        <BulkEditProductsModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          selectedProducts={sampleProducts}
          canViewMoney={false}
        />
      )
    })

    expect(container.textContent).not.toContain('Rates & Pricing')
    expect(container.textContent).not.toContain('Rental Rates (% adjustment)')
    expect(container.textContent).not.toContain('Daily Rate (Rs.)')
  })

  it('allows Owner to adjust rates by percentage with rounded rupee preview', async () => {
    currentRole = 'Owner'
    await act(async () => {
      root.render(
        <BulkEditProductsModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          selectedProducts={sampleProducts}
          canViewMoney={true}
        />
      )
    })

    // Rate is 3500, default +5% -> 3500 * 1.05 = 3675
    expect(container.textContent).toContain('Rental Rates (% adjustment)')
    expect(container.textContent).toContain('Rs. 3,675')
  })

  it('submits bulk update and renders outcome receipt', async () => {
    currentRole = 'Owner'
    mockBulkUpdateProducts.mockResolvedValueOnce({
      batch_id: 'batch-uuid-001',
      field: 'rates_percentage',
      total_requested: 1,
      updated_count: 1,
      results: [
        {
          id: 'prod-1',
          success: true,
          old_value: { daily_rate: 3500 },
          new_value: { daily_rate: 3675 },
        },
      ],
    })

    const handleSuccess = vi.fn()
    await act(async () => {
      root.render(
        <BulkEditProductsModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={handleSuccess}
          selectedProducts={sampleProducts}
          canViewMoney={true}
        />
      )
    })

    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Changes to 1 Products')
    )
    expect(saveBtn).toBeDefined()

    await act(async () => {
      saveBtn?.click()
    })

    expect(mockBulkUpdateProducts).toHaveBeenCalled()
    expect(container.textContent).toContain('Bulk Update Finished:')
    expect(container.textContent).toContain('✓ Saved')
    expect(handleSuccess).toHaveBeenCalled()
  })
})
