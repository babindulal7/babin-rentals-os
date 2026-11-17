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

const bookedCamera: EquipmentResult = {
  id: 'unit-booked-fx3',
  productKey: 'prod-fx3',
  name: 'Sony FX3 Cinema Camera',
  category: 'Cameras',
  brand: 'Sony',
  sku: 'CAM-FX3',
  serial: 'FX3-001',
  location: 'Main Warehouse',
  kind: 'equipment',
  ratePaisa: rupees(6000),
  status: 'On Rent',
  committedTo: 'BK-2026-9000',
  inBundles: [],
  haystack: ['sony', 'fx3', 'cameras'],
  availability: {
    level: 'unavailable',
    label: 'Unavailable',
    detail: 'On Rent · BK-2026-9000',
    tone: 'danger',
    icon: 'error',
    shortLines: [],
    freedLines: [],
  },
}

const freeSimilarCamera: EquipmentResult = {
  id: 'unit-free-a7s3',
  productKey: 'prod-a7s3',
  name: 'Sony A7S III',
  category: 'Cameras', // Same category!
  brand: 'Sony',
  sku: 'CAM-A7S3',
  serial: 'A7S3-001',
  location: 'Main Warehouse',
  kind: 'equipment',
  ratePaisa: rupees(5000),
  status: 'In Stock',
  committedTo: '—',
  inBundles: [],
  haystack: ['sony', 'a7s', 'cameras'],
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

describe('AddItemPanel fully booked alternatives: similar item or sub-rent (T3-13)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.restoreAllMocks()
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

  it('renders both Similar we own (free) and Sub-rent from partner when equipment is fully booked', async () => {
    vi.spyOn(bookingRules, 'getAllowOverbooking').mockReturnValue(false)
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        <AddItemPanel
          inline
          window={NO_WINDOW}
          days={2}
          existingLineIds={[]}
          equipment={[bookedCamera, freeSimilarCamera]}
          bundles={[]}
          showPrices={true}
          onAdd={onAdd}
        />,
      )
    })

    // Browse catalogue to see options
    const browseBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Browse catalogue"]')!
    await act(async () => {
      browseBtn.click()
    })

    // Alternatives region for fully booked FX3
    const altRegion = container.querySelector<HTMLElement>(
      'div[aria-label="Alternatives for fully booked Sony FX3 Cinema Camera"]',
    )
    expect(altRegion).toBeTruthy()
    expect(altRegion?.textContent).toContain('Fully booked for these dates (27 Jul hard block)')
    expect(altRegion?.textContent).toContain('1. Similar we own — free:')
    expect(altRegion?.textContent).toContain('2. Sub-rent from a partner:')

    // 1-tap free similar item button is rendered with its free count and price
    const similarBtn = altRegion?.querySelector<HTMLButtonElement>(
      'button[aria-label="Add free similar item: Sony A7S III"]',
    )
    expect(similarBtn).toBeTruthy()
    expect(similarBtn?.textContent).toContain('Sony A7S III')
    expect(similarBtn?.textContent).toContain('(1 free)')

    // 1-tap sub-rent button is rendered
    const subRentBtn = altRegion?.querySelector<HTMLButtonElement>(
      'button[aria-label="Sub-rent Sony FX3 Cinema Camera from GearHouse KTM"]',
    )
    expect(subRentBtn).toBeTruthy()
    expect(subRentBtn?.textContent).toContain('+ Sub-rent (GearHouse KTM)')

    // Choose partner / rate button is rendered
    const customSubRentBtn = altRegion?.querySelector<HTMLButtonElement>(
      'button[aria-label="Choose partner or supplier rate to sub-rent Sony FX3 Cinema Camera"]',
    )
    expect(customSubRentBtn).toBeTruthy()
  })

  it('adds the free similar unit in one tap', async () => {
    vi.spyOn(bookingRules, 'getAllowOverbooking').mockReturnValue(false)
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        <AddItemPanel
          inline
          window={NO_WINDOW}
          days={3}
          existingLineIds={[]}
          equipment={[bookedCamera, freeSimilarCamera]}
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

    const similarBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Add free similar item: Sony A7S III"]',
    )!
    expect(similarBtn).toBeTruthy()

    await act(async () => {
      similarBtn.click()
    })

    // Immediately adds the free similar equipment
    expect(onAdd).toHaveBeenCalled()
    const addedLines = onAdd.mock.calls[0]![0]
    expect(addedLines[0]?.name).toBe('Sony A7S III')
    expect(addedLines[0]?.serial).toBe('A7S3-001')
    expect(addedLines[0]?.lineType).toBe('Equipment')
  })

  it('adds sub-rental line carrying supplier and rate in one tap', async () => {
    vi.spyOn(bookingRules, 'getAllowOverbooking').mockReturnValue(false)
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        <AddItemPanel
          inline
          window={NO_WINDOW}
          days={2}
          existingLineIds={[]}
          equipment={[bookedCamera, freeSimilarCamera]}
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

    const subRentBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Sub-rent Sony FX3 Cinema Camera from GearHouse KTM"]',
    )!
    expect(subRentBtn).toBeTruthy()

    await act(async () => {
      subRentBtn.click()
    })

    // Immediately adds sub-rental line with supplier recorded
    expect(onAdd).toHaveBeenCalled()
    const addedLines = onAdd.mock.calls[0]![0]
    expect(addedLines[0]?.lineType).toBe('Sub-rental')
    expect(addedLines[0]?.supplier).toBe('GearHouse KTM')
    expect(addedLines[0]?.name).toContain('GearHouse KTM')
    expect(addedLines[0]?.location).toBe('Vendor: GearHouse KTM')
  })

  it('opens sub-rental partner modal on Choose partner / rate… button', async () => {
    vi.spyOn(bookingRules, 'getAllowOverbooking').mockReturnValue(false)
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        <AddItemPanel
          inline
          window={NO_WINDOW}
          days={1}
          existingLineIds={[]}
          equipment={[bookedCamera, freeSimilarCamera]}
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

    const customSubRentBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Choose partner or supplier rate to sub-rent Sony FX3 Cinema Camera"]',
    )!
    await act(async () => {
      customSubRentBtn.click()
    })

    // SubRentalPartnerModal opened
    const partnerSelect = document.querySelector<HTMLSelectElement>('#subrent-partner-select')!
    expect(partnerSelect).toBeTruthy()

    const confirmBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Sub-Rental Line'),
    )!
    await act(async () => {
      confirmBtn.click()
    })

    expect(onAdd).toHaveBeenCalled()
    const addedLines = onAdd.mock.calls[0]![0]
    expect(addedLines[0]?.lineType).toBe('Sub-rental')
    expect(addedLines[0]?.supplier).toBe('GearHouse KTM')
  })

  it('keeps booked unit blocked from direct addition', async () => {
    vi.spyOn(bookingRules, 'getAllowOverbooking').mockReturnValue(false)
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        <AddItemPanel
          inline
          window={NO_WINDOW}
          days={1}
          existingLineIds={[]}
          equipment={[bookedCamera]} // Only booked item, no similar free items
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

    // Should state no similar free gear in stock
    const altRegion = container.querySelector<HTMLElement>(
      'div[aria-label="Alternatives for fully booked Sony FX3 Cinema Camera"]',
    )
    expect(altRegion?.textContent).toContain('No similar free gear in stock for these dates')

    // Booked serial chip is marked as booked and cannot be directly added without override
    const serialBtn = container.querySelector<HTMLButtonElement>('button[aria-label*="FX3-001"]')!
    expect(serialBtn).toBeTruthy()
  })
})
