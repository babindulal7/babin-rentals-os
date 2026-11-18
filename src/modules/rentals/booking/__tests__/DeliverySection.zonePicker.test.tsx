// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DeliverySection, type DeliverySectionProps } from '../DeliverySection'
import { listDeliveryZones } from '../../../../actions/deliveryZones/listDeliveryZones'
import { fetchGridFeeState } from '../../../../lib/queries/deliveryFeeGridRead'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'usr-owner-1', name: 'Owner', role: 'Owner' }, loading: false }),
}))

vi.mock('../../../../actions/deliveryZones/listDeliveryZones', () => ({
  listDeliveryZones: vi.fn(async () => ({
    zones: [{ id: 'z-in', name: 'Inside Ring Road', description: null, fee_paisa: 300000, is_active: true, created_at: '', updated_at: '' }],
  })),
}))

vi.mock('../../../../lib/queries/deliveryFeeGridRead', () => ({
  fetchGridFeeState: vi.fn(async () => ({ status: 'set', feePaisa: 150000 })),
}))

vi.mock('../../../../lib/queries/deliveryDistanceBands', () => ({
  fetchDistanceBands: vi.fn(async () => new Map([['z-in', { minKm: 3, maxKm: 7 }]])),
}))

/* O-28 and O-30: the New Rental zone picker. A zone shows its name only; the grid cell for
   the chosen zone and vehicle class fills the charge; a quoted or unset cell says so and leaves it. */

function props(overrides: Partial<DeliverySectionProps> = {}): DeliverySectionProps {
  const noop = () => {}
  return {
    open: true,
    onToggle: noop,
    isPhone: false,
    clientPickup: false,
    deliveryType: 'Babin Delivery',
    setDeliveryType: noop,
    deliveryZone: '',
    setDeliveryZone: vi.fn(),
    vehicle: '',
    setVehicle: noop,
    numberPlate: '',
    setNumberPlate: noop,
    driverContact: '',
    setDriverContact: noop,
    pickupLocation: '',
    setPickupLocation: noop,
    returnLocation: '',
    setReturnLocation: noop,
    specialInstructions: '',
    setSpecialInstructions: noop,
    returnPickupType: 'Babin Pickup',
    setReturnPickupType: noop,
    returnPickupAddress: '',
    setReturnPickupAddress: noop,
    returnPickupTime: '',
    setReturnPickupTime: noop,
    returnPickupChargePaisa: 0,
    setReturnPickupChargePaisa: noop,
    deliveryChargePaisa: 0 as DeliverySectionProps['deliveryChargePaisa'],
    setDeliveryChargePaisa: vi.fn(),
    fuelChargePaisa: 0 as DeliverySectionProps['fuelChargePaisa'],
    setFuelChargePaisa: noop,
    transportPaisa: 0 as DeliverySectionProps['transportPaisa'],
    canBookingMoney: true,
    ...overrides,
  }
}

function selectWithOption(container: HTMLElement, optionText: string): HTMLSelectElement | undefined {
  return Array.from(container.querySelectorAll('select')).find((s) =>
    Array.from(s.options).some((o) => o.textContent?.trim() === optionText),
  ) as HTMLSelectElement | undefined
}

function choose(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('DeliverySection zone picker (O-28, O-30)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('loads zones with the signed-in user context (the action refuses a call without one)', async () => {
    await act(async () => {
      root.render(<DeliverySection {...props()} />)
    })
    await settle()
    expect(listDeliveryZones).toHaveBeenCalledWith(
      expect.objectContaining({ activeOnly: true }),
      { userId: 'usr-owner-1', role: 'Owner' },
    )
  })

  it('shows each zone by name only, with no per-zone fee', async () => {
    await act(async () => {
      root.render(<DeliverySection {...props()} />)
    })
    await settle()
    const zoneSelect = selectWithOption(container, 'Inside Ring Road')
    expect(zoneSelect).toBeDefined()
    const zoneOption = Array.from(zoneSelect!.options).find((o) => o.textContent?.trim() === 'Inside Ring Road')
    expect(zoneOption?.value).toBe('z-in')
    expect(container.textContent).not.toContain('Rs 3,000')
  })

  it('fills the charge from the grid cell for the chosen zone and vehicle class', async () => {
    const setDeliveryChargePaisa = vi.fn()
    const setDeliveryZone = vi.fn()
    await act(async () => {
      root.render(<DeliverySection {...props({ setDeliveryChargePaisa, setDeliveryZone, deliveryZone: 'z-in' })} />)
    })
    await settle()
    await act(async () => {
      choose(selectWithOption(container, 'Motorbike')!, 'Motorbike')
    })
    await settle()
    expect(fetchGridFeeState).toHaveBeenCalledWith('z-in', 'Motorbike')
    expect(setDeliveryChargePaisa).toHaveBeenCalledWith(150000)
  })

  it('shows the chosen zone road-distance band as a hint, and none before a zone is chosen (O-28b)', async () => {
    await act(async () => {
      root.render(<DeliverySection {...props()} />)
    })
    await settle()
    expect(container.textContent).not.toContain('Road distance from Boudha')
    await act(async () => {
      root.render(<DeliverySection {...props({ deliveryZone: 'z-in' })} />)
    })
    await settle()
    expect(container.textContent).toContain('Road distance from Boudha: over 3–7 km')
  })

  it('says a quoted zone is quoted per trip and leaves the charge for typing', async () => {
    vi.mocked(fetchGridFeeState).mockResolvedValueOnce({ status: 'quoted-per-trip' })
    const setDeliveryChargePaisa = vi.fn()
    await act(async () => {
      root.render(<DeliverySection {...props({ setDeliveryChargePaisa, deliveryZone: 'z-in' })} />)
    })
    await settle()
    await act(async () => {
      choose(selectWithOption(container, 'Motorbike')!, 'Motorbike')
    })
    await settle()
    expect(container.textContent).toContain('Quoted per trip — type the charge')
    expect(setDeliveryChargePaisa).not.toHaveBeenCalled()
  })
})
