// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CheckAvailabilityModal } from '../CheckAvailabilityModal'
import * as productAvailModule from '../../../lib/queries/productAvailability'
import * as authModule from '../../../lib/auth'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('CheckAvailabilityModal — Availability in two taps (T3-22, W91)', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
    root = null
    host = null
    vi.restoreAllMocks()
  })

  it('renders type or scan input and who has it now section', async () => {
    vi.spyOn(authModule, 'useAuth').mockReturnValue({
      user: { id: 'u-owner', name: 'Owner User', role: 'Owner' } as any,
      loading: false,
      signIn: vi.fn(),
      requestPasswordReset: vi.fn(),
      updatePassword: vi.fn(),
      isPasswordRecovery: false,
    } as any)

    vi.spyOn(productAvailModule, 'fetchProductAvailabilityDetail').mockResolvedValue({
      productId: 'p-fx3',
      productName: 'Sony FX3 Cinema Camera',
      productDescription: 'Full frame cinema camera',
      dailyRate: 350000,
      mode: 'unit',
      unitsOwned: 4,
      unitsFree: 2,
      unitsHeld: 2,
      heldBy: ['880'],
      dailyAvailability: { '2026-11-10': 2 },
      nextFreeDate: { date: '2026-11-10', isAvailableNow: true, relativeDays: 0 },
      whoHasItNow: [
        {
          bookingId: 'bk-1',
          bookingNo: '880',
          clientId: 'c-1',
          clientName: 'Kathmandu Films',
          clientPhone: '9800000001',
          stage: 'On Rent',
          pickupAt: '2026-11-09T00:15:00Z',
          returnAt: '2026-11-10T12:00:00Z',
          isOverdue: false,
          countdownText: 'Due in 3h 15m',
          unitSerial: 'FX3-0012',
          unitAssetTag: 'CAM-01-U01',
        },
      ],
    })

    await act(async () => {
      root!.render(
        <CheckAvailabilityModal
          open={true}
          onClose={vi.fn()}
          selectedProductId="p-fx3"
          products={[{ id: 'p-fx3', name: 'Sony FX3 Cinema Camera', totalQuantity: 4, dailyRate: 350000 }]}
        />
      )
    })

    // Assert "Type or scan an item" input is rendered
    const searchInput = document.body.querySelector('#check-avail-search-input')
    expect(searchInput).not.toBeNull()

    // Assert "Who has it now" section is rendered
    expect(document.body.textContent).toContain('Who has it now')
    expect(document.body.textContent).toContain('Kathmandu Films')
    expect(document.body.textContent).toContain('#880')
    expect(document.body.textContent).toContain('On Rent')
    expect(document.body.textContent).toContain('Due in 3h 15m')
    expect(document.body.textContent).toContain('CAM-01-U01')

    // Assert Next free date is rendered
    expect(document.body.textContent).toContain('Next free: Today (Available now)')
  })

  it('enforces Law 6 money blindness: daily rate is hidden for Warehouse role', async () => {
    vi.spyOn(authModule, 'useAuth').mockReturnValue({
      user: { id: 'u-wh', name: 'Warehouse Operator', role: 'Warehouse' } as any,
      loading: false,
      signIn: vi.fn(),
      requestPasswordReset: vi.fn(),
      updatePassword: vi.fn(),
      isPasswordRecovery: false,
    } as any)

    vi.spyOn(productAvailModule, 'fetchProductAvailabilityDetail').mockResolvedValue({
      productId: 'p-fx3',
      productName: 'Sony FX3 Cinema Camera',
      productDescription: 'Full frame cinema camera',
      dailyRate: null, // Masked under Law 6
      mode: 'unit',
      unitsOwned: 4,
      unitsFree: 4,
      unitsHeld: 0,
      heldBy: [],
      dailyAvailability: { '2026-11-10': 4 },
      nextFreeDate: { date: '2026-11-10', isAvailableNow: true, relativeDays: 0 },
      whoHasItNow: [],
    })

    await act(async () => {
      root!.render(
        <CheckAvailabilityModal
          open={true}
          onClose={vi.fn()}
          selectedProductId="p-fx3"
          products={[{ id: 'p-fx3', name: 'Sony FX3 Cinema Camera', totalQuantity: 4 }]}
        />
      )
    })

    // Assert rupees or currency format is NOT rendered
    expect(document.body.textContent).not.toContain('Rs.')
    expect(document.body.textContent).not.toContain('NPR')
    expect(document.body.textContent).not.toContain('/ day')
    // All units in stock is rendered
    expect(document.body.textContent).toContain('All units currently In Stock in warehouse')
  })
})
