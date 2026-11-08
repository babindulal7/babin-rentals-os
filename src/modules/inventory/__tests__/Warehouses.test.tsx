// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Warehouses from '../Warehouses'
import * as warehousesQuery from '../../../lib/queries/warehouses'
import type { StockTransfer } from '../../../lib/queries/warehouses'

// @ts-expect-error React 18 act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-warehouse-1', role: 'Warehouse', email: 'warehouse@babinrentals.com' },
  }),
}))

vi.mock('../../../lib/device', () => ({
  useViewport: () => 'desktop',
  useCapability: () => ({ hasHover: true }),
}))

vi.mock('../../../lib/network', () => ({
  useNetwork: () => true,
}))

const mockTransition = vi.fn().mockResolvedValue({
  success: true,
  data: { id: 'st-1', status: 'Approved' },
})

vi.mock('../../../actions/inventory/transitionStockTransfer', () => ({
  transitionStockTransfer: (...args: unknown[]) => mockTransition(...args),
}))

const mockTransfers: StockTransfer[] = [
  {
    id: 'st-1',
    transferNo: 'ST-2026-0001',
    type: 'Branch Transfer',
    sourceWarehouse: 'Kathmandu Main Hub (HQ)',
    sourceZone: 'Zone A',
    destinationWarehouse: 'Pokhara Regional Hub',
    destinationZone: 'Zone B',
    assetCount: 1,
    items: [
      {
        assetCode: 'CAM-001',
        name: 'Sony FX6 Cinema Camera',
        serial: 'SN-001',
        category: 'Camera',
        condition: 'Good',
      },
    ],
    status: 'Pending',
    requestedBy: 'Ram Thapa',
    dateAD: '2026-11-06',
  },
]

describe('Warehouses Component - Transfer Lifecycle (#12, #15)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockTransition.mockClear()

    vi.spyOn(warehousesQuery, 'useStockTransfers').mockReturnValue({
      rows: mockTransfers,
      source: 'live',
      loading: false,
      error: null,
      refetch: vi.fn(),
      count: mockTransfers.length,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      setPage: vi.fn(),
      isFiltered: false,
    } as unknown as ReturnType<typeof warehousesQuery.useStockTransfers>)

    vi.spyOn(warehousesQuery, 'useWarehouses').mockReturnValue({
      rows: [
        {
          id: 'wh-ktm',
          name: 'Kathmandu Main Hub (HQ)',
          code: 'KTM-01',
          city: 'Kathmandu',
          capacity: null,
          current_occupancy: null,
          zone_count: 3,
          is_active: true,
        },
      ],
      source: 'live',
      loading: false,
      error: null,
      refetch: vi.fn(),
      count: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      setPage: vi.fn(),
      isFiltered: false,
    } as unknown as ReturnType<typeof warehousesQuery.useWarehouses>)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('renders sample preview warning banner for unconfigured capacity/racks', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Warehouses />
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('Sample Facility Layout')
    expect(container.textContent).toContain('Transfer Center (1)')
  })

  it('renders stock transfer and allows advancing Pending transfer to Approved', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Warehouses />
        </MemoryRouter>,
      )
    })

    // Switch to Transfer Center tab
    const transferTabBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Transfer Center'),
    )
    expect(transferTabBtn).toBeDefined()
    await act(async () => {
      transferTabBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('ST-2026-0001')

    // Find the advance button for "Approve" (from TRANSFER_FLOW.Pending.next -> Approved)
    const approveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Approve',
    )
    expect(approveBtn).toBeDefined()
    expect(approveBtn?.disabled).toBe(false)

    await act(async () => {
      approveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mockTransition).toHaveBeenCalledWith(
      { transferId: 'st-1', targetStatus: 'Approved' },
      expect.objectContaining({
        role: 'Warehouse',
        userId: 'usr-warehouse-1',
      }),
    )
  })

  it('opens cancellation dialog and requires reason of at least 10 chars', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Warehouses />
        </MemoryRouter>,
      )
    })

    // Switch to Transfer Center tab
    const transferTabBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Transfer Center'),
    )
    expect(transferTabBtn).toBeDefined()
    await act(async () => {
      transferTabBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    )
    expect(cancelBtn).toBeDefined()

    await act(async () => {
      cancelBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Cancellation modal is open
    expect(container.textContent).toContain('Cancel Stock Transfer')
    expect(container.textContent).toContain('ST-2026-0001')

    const getConfirmBtn = () =>
      Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Confirm Cancellation',
      ) as HTMLButtonElement | undefined

    expect(getConfirmBtn()).toBeDefined()
    // Should be disabled because reason is empty
    expect(getConfirmBtn()?.disabled).toBe(true)

    const textarea = container.querySelector('textarea')
    expect(textarea).toBeDefined()

    // Enter valid reason >= 10 chars using native setter for React onChange
    await act(async () => {
      if (textarea) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value',
        )?.set
        nativeSetter?.call(textarea, 'Equipment no longer needed in Pokhara for this shoot')
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
        textarea.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    expect(getConfirmBtn()?.disabled).toBe(false)

    await act(async () => {
      getConfirmBtn()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mockTransition).toHaveBeenCalledWith(
      {
        transferId: 'st-1',
        targetStatus: 'Cancelled',
        cancellationReason: 'Equipment no longer needed in Pokhara for this shoot',
      },
      expect.objectContaining({
        role: 'Warehouse',
        userId: 'usr-warehouse-1',
      }),
    )
  })
})
