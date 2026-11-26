// @vitest-environment jsdom
/**
 * T2-20: Floor adds consumables at Pack and Handover (B35, B14).
 *
 * Requirements:
 * 1. On Pack and Handover, "Add Consumables" button opens modal with consumable products.
 * 2. Warehouse/Technician see no prices in the DOM (Law 6 money blindness).
 * 3. Adding calls addConsumableLine with bookingId, productId, qty, and floor note.
 * 4. Desk role sees pricing information.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import PackingWorkspace from '../PackingWorkspace'
import HandoverWorkspace from '../HandoverWorkspace'
import { AddConsumableModal } from '../booking/AddConsumableModal'
import * as addConsumableLineModule from '../../../actions/rentals/addConsumableLine'
import { loadMockClient, getSupabaseClientAsync } from '../../../lib/supabase'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

beforeAll(async () => {
  await loadMockClient()
})

const B_TEST_ID = '22222222-2222-4222-8222-222222222222'
vi.mock('../../../lib/queries/handoverPickupTotals', () => ({
  fetchHandoverPickupTotals: async () => new Map(),
  fetchResumableHandoverSession: async () => null,
}))

let mockUser = {
  id: 'u-warehouse-1',
  name: 'Warehouse User',
  email: 'wh@babinrentals.com',
  role: 'Warehouse',
  isSharedDevice: false,
}

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/queries/bookings', () => ({
  fetchFloorBooking: async (ref: string) => ({
    id: B_TEST_ID,
    bookingNo: ref,
    stage: ref.includes('handover') ? 'Packed' : 'Booked',
    clientName: 'Production House Nepal',
    project: 'Music Video',
    pickupAtAd: '2026-07-16T00:15:00.000Z',
    returnAtAd: '2026-07-19T00:15:00.000Z',
    actualReturnAtAd: null,
    deliveryType: 'Client Pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines: [
      {
        id: 'l-cam-1',
        qty: 1,
        lineType: 'Equipment',
        description: 'Sony FX3 Camera',
        productId: 'prod-cam-1',
        productName: 'Sony FX3 Camera',
        trackingMode: 'Serialised',
        parentLineId: null,
        sortOrder: 1,
        unitsPresence: 'present',
        units: [
          {
            id: 'bu-1',
            assetId: 'unit-1',
            serial: 'FX3-001',
            assetTag: 'TAG-FX3-1',
            unitState: 'Ready',
            isRequired: true,
            packed: false,
            damaged: false,
            location: 'Rack 1 · Shelf A',
          },
        ],
      },
    ],
  }),
}))

vi.mock('../../../lib/queries/collateral', () => ({
  hasHeldCollateral: async () => false,
}))

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('T2-20 Floor adds consumables at Pack and Handover', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockUser = {
      id: 'u-warehouse-1',
      name: 'Warehouse User',
      email: 'wh@babinrentals.com',
      role: 'Warehouse',
      isSharedDevice: false,
    }
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('PackingWorkspace offers "Add Consumables" button to floor staff', async () => {
    await act(async () => {
      root.render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/rentals/BK-9001/pack']}>
            <Routes>
              <Route path="/rentals/:bookingNo/pack" element={<PackingWorkspace />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>,
      )
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const addConsumableBtn = buttons.find((b) => b.textContent?.includes('Add Consumables'))
    expect(addConsumableBtn).toBeTruthy()
  })

  it('HandoverWorkspace offers "Add Consumables" button to floor staff', async () => {
    await act(async () => {
      root.render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/rentals/BK-9001-handover/handover']}>
            <Routes>
              <Route path="/rentals/:bookingNo/handover" element={<HandoverWorkspace />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>,
      )
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const addConsumableBtn = buttons.find((b) => b.textContent?.includes('Add Consumables'))
    expect(addConsumableBtn).toBeTruthy()
  })

  it('AddConsumableModal hides all pricing from Warehouse role (Law 6 money-blindness)', async () => {
    const client = await getSupabaseClientAsync()
    vi.spyOn(client, 'from').mockImplementation(((table: string) => {
      if (table === 'products_v') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'p-gaffer-1',
                        name: 'Gaffer Tape 2in Black',
                        asset_code: 'GAFF-BLK',
                        unit_sale_price: 15.0,
                        total_quantity: 45,
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        } as any
      }
      return (client as any).from(table)
    }) as any)

    await act(async () => {
      root.render(
        <ToastProvider>
          <AddConsumableModal
            isOpen={true}
            onClose={() => {}}
            bookingId={B_TEST_ID}
            userId={mockUser.id}
            userRole="Warehouse"
            defaultNote="Added by Warehouse User at Pack"
          />
        </ToastProvider>,
      )
    })

    const text = document.body.textContent ?? ''
    // Must contain product name and stock quantity
    expect(text).toContain('Gaffer Tape 2in Black')
    expect(text).toContain('Available in stock: 45')

    // Must NOT contain rupees, paisa or currency labels
    expect(text).not.toContain('Rs.')
    expect(text).not.toContain('NPR')
    expect(text).not.toContain('Pricing (1-time unit sale)')
    expect(text).not.toContain('Line Total')
  })

  it('AddConsumableModal reveals pricing to Owner / desk role', async () => {
    const client = await getSupabaseClientAsync()
    vi.spyOn(client, 'from').mockImplementation(((table: string) => {
      if (table === 'products_v') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'p-gaffer-1',
                        name: 'Gaffer Tape 2in Black',
                        asset_code: 'GAFF-BLK',
                        unit_sale_price: 15.0,
                        total_quantity: 45,
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        } as any
      }
      return (client as any).from(table)
    }) as any)

    await act(async () => {
      root.render(
        <ToastProvider>
          <AddConsumableModal
            isOpen={true}
            onClose={() => {}}
            bookingId={B_TEST_ID}
            userId="u-owner-1"
            userRole="Owner"
            defaultNote="Added by Owner"
          />
        </ToastProvider>,
      )
    })

    const text = document.body.textContent ?? ''
    expect(text).toContain('Gaffer Tape 2in Black')
    expect(text).toContain('Pricing (1-time unit sale)')
    expect(text).toContain('Line Total')
  })

  it('Submitting AddConsumableModal calls addConsumableLine action with floor note', async () => {
    const client = await getSupabaseClientAsync()
    vi.spyOn(client, 'from').mockImplementation(((table: string) => {
      if (table === 'products_v') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'p-gaffer-1',
                        name: 'Gaffer Tape 2in Black',
                        asset_code: 'GAFF-BLK',
                        unit_sale_price: 15.0,
                        total_quantity: 45,
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        } as any
      }
      return (client as any).from(table)
    }) as any)

    const addActionSpy = vi.spyOn(addConsumableLineModule, 'addConsumableLine').mockResolvedValue({
      success: true,
      lineId: 'line-new-1',
      bookingId: B_TEST_ID,
      productId: 'p-gaffer-1',
      productName: 'Gaffer Tape 2in Black',
      qty: 2,
      unitPrice: null, // masked for floor role
      lineTotal: null,
    })

    const onAdded = vi.fn()
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        <ToastProvider>
          <AddConsumableModal
            isOpen={true}
            onClose={onClose}
            bookingId={B_TEST_ID}
            userId={mockUser.id}
            userRole="Warehouse"
            onAdded={onAdded}
            defaultNote="Added by Warehouse User at Pack"
          />
        </ToastProvider>,
      )
    })

    // Increase quantity to 2
    const incBtn = Array.from(document.body.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Increase quantity')
    expect(incBtn).toBeTruthy()
    await act(async () => {
      incBtn!.click()
    })

    // Submit
    const submitBtn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes('Add Consumable'))
    expect(submitBtn).toBeTruthy()
    await act(async () => {
      submitBtn!.click()
    })

    expect(addActionSpy).toHaveBeenCalledTimes(1)
    const callArg = addActionSpy.mock.calls[0]![0]
    expect(callArg.bookingId).toBe(B_TEST_ID)
    expect(callArg.productId).toBe('p-gaffer-1')
    expect(callArg.qty).toBe(2)
    expect(callArg.lineNote).toBe('Added by Warehouse User at Pack')
    expect(onAdded).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('AddConsumableModal supports searching consumables by keyword', async () => {
    const client = await getSupabaseClientAsync()
    vi.spyOn(client, 'from').mockImplementation(((table: string) => {
      if (table === 'products_v') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'p-gaffer-1',
                        name: 'Gaffer Tape 2in Black',
                        asset_code: 'GAFF-BLK',
                        unit_sale_price: 15.0,
                        total_quantity: 45,
                      },
                      {
                        id: 'p-battery-1',
                        name: 'AA Lithium Battery 4-Pack',
                        asset_code: 'BATT-AA-4',
                        unit_sale_price: 8.0,
                        total_quantity: 20,
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        } as any
      }
      return (client as any).from(table)
    }) as any)

    await act(async () => {
      root.render(
        <ToastProvider>
          <AddConsumableModal
            isOpen={true}
            onClose={() => {}}
            bookingId={B_TEST_ID}
            userId={mockUser.id}
            userRole="Warehouse"
          />
        </ToastProvider>,
      )
    })

    const searchInput = document.body.querySelector('#consumable-search-input') as HTMLInputElement
    expect(searchInput).toBeTruthy()

    // Initially both items in select
    const select = document.body.querySelector('#consumable-product-select') as HTMLSelectElement
    expect(select.options.length).toBe(2)

    // Filter by 'battery'
    await act(async () => {
      setInputValue(searchInput, 'battery')
    })

    expect(select.options.length).toBe(1)
    expect(select.options[0]?.text).toContain('AA Lithium Battery')

    // Searching for a nonexistent item must clear the previous selected ID.
    // A stale hidden product must never be billed after a no-match search.
    await act(async () => {
      setInputValue(searchInput, 'not-a-real-consumable')
    })
    expect(select.value).toBe('')
    expect(select.options[0]?.text).toContain('No matching consumables found')
    const submit = Array.from(document.body.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Add Consumable') as HTMLButtonElement
    expect(submit).toBeTruthy()
    expect(submit.disabled).toBe(true)

    // Re-entering a matching search picks only a visible product.
    await act(async () => {
      setInputValue(searchInput, 'gaffer')
    })
    expect(select.value).toBe('p-gaffer-1')
    expect(submit.disabled).toBe(false)
  })
})
