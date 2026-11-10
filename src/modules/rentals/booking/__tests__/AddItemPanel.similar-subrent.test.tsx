// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Set mock environment before app modules load
process.env.VITE_DATA_SOURCE = 'mock'
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key'

// @ts-expect-error React 18 act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../../lib/device', () => ({ useViewport: () => 'desktop' }))

import { AddItemPanel } from '../AddItemPanel'
import { NO_WINDOW } from '../itemCatalogue'
import type { EquipmentResult } from '../itemCatalogue'
import { rupees } from '../../../../lib/money'
import * as bookingRules from '../../../../lib/bookingRules'

// Booked FX3 units (freeCount = 0)
const bookedFx3_1: EquipmentResult = {
  id: 'unit-fx3-1',
  productKey: 'prod-fx3',
  name: 'Sony FX3 Cinema Camera',
  category: 'Camera',
  brand: 'Sony',
  sku: 'CAM-SONY-FX3',
  serial: 'FX3-001',
  location: 'Shelf C-01',
  kind: 'equipment',
  ratePaisa: rupees(3500),
  status: 'On Rent',
  committedTo: 'BK-2026-1001',
  inBundles: [],
  haystack: ['sony', 'fx3', 'cinema', 'camera'],
  availability: {
    level: 'unavailable',
    label: 'Unavailable',
    detail: 'On Rent · BK-2026-1001',
    tone: 'danger',
    icon: 'error',
    shortLines: [],
    freedLines: [],
  },
}

const bookedFx3_2: EquipmentResult = {
  id: 'unit-fx3-2',
  productKey: 'prod-fx3',
  name: 'Sony FX3 Cinema Camera',
  category: 'Camera',
  brand: 'Sony',
  sku: 'CAM-SONY-FX3',
  serial: 'FX3-002',
  location: 'Shelf C-01',
  kind: 'equipment',
  ratePaisa: rupees(3500),
  status: 'Reserved',
  committedTo: 'BK-2026-1002',
  inBundles: [],
  haystack: ['sony', 'fx3', 'cinema', 'camera'],
  availability: {
    level: 'unavailable',
    label: 'Unavailable',
    detail: 'Reserved · BK-2026-1002',
    tone: 'danger',
    icon: 'error',
    shortLines: [],
    freedLines: [],
  },
}

// Free similar camera: Sony FX6 (freeCount = 1)
const freeFx6: EquipmentResult = {
  id: 'unit-fx6-1',
  productKey: 'prod-fx6',
  name: 'Sony FX6 Cinema Camera',
  category: 'Camera',
  brand: 'Sony',
  sku: 'CAM-SONY-FX6',
  serial: 'FX6-001',
  location: 'Shelf C-02',
  kind: 'equipment',
  ratePaisa: rupees(5500),
  status: 'In Stock',
  committedTo: '—',
  inBundles: [],
  haystack: ['sony', 'fx6', 'cinema', 'camera'],
  availability: {
    level: 'available',
    label: 'Available',
    detail: 'Free for these dates',
    tone: 'in',
    icon: 'check',
    shortLines: [],
    freedLines: [],
  },
}

// Free similar camera: Sony A7S III (freeCount = 1)
const freeA7s3: EquipmentResult = {
  id: 'unit-a7s3-1',
  productKey: 'prod-a7s3',
  name: 'Sony A7S III',
  category: 'Camera',
  brand: 'Sony',
  sku: 'CAM-SONY-A7S3',
  serial: 'A7S3-001',
  location: 'Shelf C-03',
  kind: 'equipment',
  ratePaisa: rupees(4000),
  status: 'In Stock',
  committedTo: '—',
  inBundles: [],
  haystack: ['sony', 'a7s', 'iii', 'camera'],
  availability: {
    level: 'available',
    label: 'Available',
    detail: 'Free for these dates',
    tone: 'in',
    icon: 'check',
    shortLines: [],
    freedLines: [],
  },
}

describe('T3-13 · Fully booked → similar item or sub-rent (W10, W69, 27 Jul ruling)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(bookingRules, 'getAllowOverbooking').mockReturnValue(false)
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

  it('offers free similar cameras and sub-rent path when FX3 is fully booked', async () => {
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        <AddItemPanel
          inline
          window={NO_WINDOW}
          days={2}
          existingLineIds={[]}
          equipment={[bookedFx3_1, bookedFx3_2, freeFx6, freeA7s3]}
          bundles={[]}
          showPrices={true}
          onAdd={onAdd}
        />,
      )
    })

    const browseBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Browse catalogue"]')!
    await act(async () => {
      browseBtn.click()
    })

    // Find the fully booked FX3 section
    const alternativesBox = container.querySelector('[aria-label="Alternatives for fully booked Sony FX3 Cinema Camera"]')
    expect(alternativesBox).toBeTruthy()

    // 1. Shows "Fully booked for these dates — hard blocked"
    expect(alternativesBox?.textContent).toContain('Fully booked for these dates — hard blocked')

    // 2. Shows "Similar we own — free" with free similar cameras
    expect(alternativesBox?.textContent).toContain('Similar we own — free:')
    const fx6Btn = container.querySelector('button[aria-label="Add similar free item Sony FX6 Cinema Camera"]')
    const a7s3Btn = container.querySelector('button[aria-label="Add similar free item Sony A7S III"]')
    expect(fx6Btn).toBeTruthy()
    expect(a7s3Btn).toBeTruthy()

    // 3. Shows "Sub-rent from a partner" options
    expect(alternativesBox?.textContent).toContain('Sub-rent from a partner:')
    const quickSubRentBtn = container.querySelector('button[aria-label="Sub-rent Sony FX3 Cinema Camera from partner in one tap"]')
    const choosePartnerBtn = container.querySelector('button[aria-label="Choose partner to sub-rent from"]')
    expect(quickSubRentBtn).toBeTruthy()
    expect(choosePartnerBtn).toBeTruthy()

    // 4. Booked FX3 serial chips are hard-blocked (cannot be added directly)
    const fx3Serial1 = container.querySelector('button[aria-label*="FX3-001"]') as HTMLButtonElement | null
    expect(fx3Serial1?.disabled).toBe(true)
  })

  it('adds similar free camera in ONE TAP when clicked', async () => {
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        <AddItemPanel
          inline
          window={NO_WINDOW}
          days={2}
          existingLineIds={[]}
          equipment={[bookedFx3_1, bookedFx3_2, freeFx6, freeA7s3]}
          bundles={[]}
          showPrices={true}
          onAdd={onAdd}
        />,
      )
    })

    const browseBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Browse catalogue"]')!
    await act(async () => {
      browseBtn.click()
    })

    const fx6Btn = container.querySelector<HTMLButtonElement>('button[aria-label="Add similar free item Sony FX6 Cinema Camera"]')!
    expect(fx6Btn).toBeTruthy()

    // 1-tap addition of similar camera
    await act(async () => {
      fx6Btn.click()
    })

    expect(onAdd).toHaveBeenCalledTimes(1)
    const addedLines = onAdd.mock.calls[0]![0]
    expect(addedLines[0]?.name).toBe('Sony FX6 Cinema Camera')
    expect(addedLines[0]?.lineType).toBe('Equipment')
    expect(addedLines[0]?.serial).toBe('FX6-001')
  })

  it('adds sub-rental in ONE TAP with supplier and supplier cost', async () => {
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        <AddItemPanel
          inline
          window={NO_WINDOW}
          days={3}
          existingLineIds={[]}
          equipment={[bookedFx3_1, bookedFx3_2, freeFx6]}
          bundles={[]}
          showPrices={true}
          onAdd={onAdd}
        />,
      )
    })

    const browseBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Browse catalogue"]')!
    await act(async () => {
      browseBtn.click()
    })

    const quickSubRentBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Sub-rent Sony FX3 Cinema Camera from partner in one tap"]',
    )!
    expect(quickSubRentBtn).toBeTruthy()

    // 1-tap addition of sub-rental line
    await act(async () => {
      quickSubRentBtn.click()
    })

    expect(onAdd).toHaveBeenCalledTimes(1)
    const addedLines = onAdd.mock.calls[0]![0]
    expect(addedLines[0]?.lineType).toBe('Sub-rental')
    expect(addedLines[0]?.name).toContain('GearHouse KTM')
    expect(addedLines[0]?.supplierName).toBe('GearHouse KTM')
    expect(addedLines[0]?.supplierCost).toBe(2800) // 80% of Rs 3500 rate
    expect(addedLines[0]?.days).toBe(3)
  })

  it('opens partner chooser flow and adds sub-rental with chosen partner', async () => {
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        <AddItemPanel
          inline
          window={NO_WINDOW}
          days={2}
          existingLineIds={[]}
          equipment={[bookedFx3_1, bookedFx3_2, freeFx6]}
          bundles={[]}
          showPrices={true}
          onAdd={onAdd}
        />,
      )
    })

    const browseBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Browse catalogue"]')!
    await act(async () => {
      browseBtn.click()
    })

    const choosePartnerBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Choose partner to sub-rent from"]',
    )!
    expect(choosePartnerBtn).toBeTruthy()

    await act(async () => {
      choosePartnerBtn.click()
    })

    // SubRentalPartnerModal opens
    const modalSelect = document.querySelector<HTMLSelectElement>('#subrental-partner-select')!
    expect(modalSelect).toBeTruthy()

    // Change partner to Kathmandu Cinema Works
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
      setter?.call(modalSelect, 'Kathmandu Cinema Works')
      modalSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const submitBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Sub-Rental Line'),
    )!
    expect(submitBtn).toBeTruthy()

    await act(async () => {
      submitBtn.click()
    })

    expect(onAdd).toHaveBeenCalledTimes(1)
    const addedLines = onAdd.mock.calls[0]![0]
    expect(addedLines[0]?.lineType).toBe('Sub-rental')
    expect(addedLines[0]?.name).toContain('Kathmandu Cinema Works')
    expect(addedLines[0]?.supplierName).toBe('Kathmandu Cinema Works')
  })

  it('hides prices and costs from money-blind roles (Law 6)', async () => {
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        <AddItemPanel
          inline
          window={NO_WINDOW}
          days={1}
          existingLineIds={[]}
          equipment={[bookedFx3_1, bookedFx3_2, freeFx6]}
          bundles={[]}
          showPrices={false} // Money-blind role (Warehouse, Technician, Driver)
          onAdd={onAdd}
        />,
      )
    })

    const browseBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Browse catalogue"]')!
    await act(async () => {
      browseBtn.click()
    })

    const alternativesBox = container.querySelector('[aria-label="Alternatives for fully booked Sony FX3 Cinema Camera"]')
    // Should NOT contain any Cost or Price text
    expect(alternativesBox?.textContent).not.toContain('Cost:')
    expect(alternativesBox?.textContent).not.toContain('/d')
  })
})
