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

const freeUnit: EquipmentResult = {
  id: 'unit-free',
  productKey: 'prod-a7s3',
  name: 'Sony A7S III',
  category: 'Cameras',
  brand: 'Sony',
  sku: 'CAM-A7S3',
  serial: 'A7S3-001',
  location: 'Main Warehouse',
  kind: 'equipment',
  ratePaisa: rupees(4000),
  status: 'In Stock',
  committedTo: '—',
  inBundles: [],
  haystack: ['sony', 'a7s', 'iii', 'cameras'],
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

const bookedUnit: EquipmentResult = {
  id: 'unit-booked',
  productKey: 'prod-a7s3',
  name: 'Sony A7S III',
  category: 'Cameras',
  brand: 'Sony',
  sku: 'CAM-A7S3',
  serial: 'A7S3-002',
  location: 'Main Warehouse',
  kind: 'equipment',
  ratePaisa: rupees(4000),
  status: 'On Rent',
  committedTo: 'BK-2026-9999',
  inBundles: [],
  haystack: ['sony', 'a7s', 'iii', 'cameras'],
  availability: {
    level: 'unavailable',
    label: 'Unavailable',
    detail: 'On Rent · BK-2026-9999',
    tone: 'danger',
    icon: 'error',
    shortLines: [],
    freedLines: [],
  },
}

describe('AddItemPanel overbooking gate integration (#11)', () => {
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

  it('picks free unit directly without opening override dialog', async () => {
    vi.spyOn(bookingRules, 'getAllowOverbooking').mockReturnValue(false)
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        <AddItemPanel
          inline
          window={NO_WINDOW}
          days={1}
          existingLineIds={[]}
          equipment={[freeUnit]}
          bundles={[]}
          onAdd={onAdd}
        />,
      )
    })

    const browseBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Browse catalogue"]')!
    await act(async () => {
      browseBtn.click()
    })

    // Click the equipment row
    const row = container.querySelector<HTMLElement>('li[role="option"]')!
    expect(row).toBeTruthy()
    expect(row.getAttribute('aria-label')).toContain('Press Enter to add the least-used free unit')

    await act(async () => {
      row.click()
    })

    // Direct addition happened
    expect(onAdd).toHaveBeenCalled()
    // Modal should not be open
    expect(document.querySelector('#overbooking-overbook')).toBeNull()
  })

  it('renders booked unit with sub-rent fallback when allowOverbooking is false', async () => {
    vi.spyOn(bookingRules, 'getAllowOverbooking').mockReturnValue(false)
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        <AddItemPanel
          inline
          window={NO_WINDOW}
          days={1}
          existingLineIds={[]}
          equipment={[bookedUnit]}
          bundles={[]}
          onAdd={onAdd}
        />,
      )
    })

    const browseBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Browse catalogue"]')!
    await act(async () => {
      browseBtn.click()
    })

    const row = container.querySelector<HTMLElement>('li[role="option"]')!
    expect(row).toBeTruthy()
    // Announce sub-rent options only since overbooking is disabled
    expect(row.getAttribute('aria-label')).toContain('Opens the sub-rent options')

    // Clicking row opens override dialog
    await act(async () => {
      row.click()
    })

    // Modal is open in document.body
    const overbookRadio = document.querySelector<HTMLInputElement>('#overbooking-overbook')!
    const subrentRadio = document.querySelector<HTMLInputElement>('#overbooking-subrent')!
    expect(overbookRadio).toBeTruthy()
    expect(overbookRadio.disabled).toBe(true)
    expect(subrentRadio.disabled).toBe(false)
    expect(subrentRadio.checked).toBe(true)

    const buttons = Array.from(document.querySelectorAll('button'))
    const submitBtn = buttons.find((b) => b.textContent?.includes('Add as Sub-Rental'))!
    expect(submitBtn).toBeDefined()

    // Submitting adds the line as a sub-rental
    await act(async () => {
      submitBtn.click()
    })

    expect(onAdd).toHaveBeenCalled()
    const addedLines = onAdd.mock.calls[0]![0]
    expect(addedLines[0]?.lineType).toBe('Sub-rental')
  })

  it('allows overbooking override when allowOverbooking is true', async () => {
    vi.spyOn(bookingRules, 'getAllowOverbooking').mockReturnValue(true)
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        <AddItemPanel
          inline
          window={NO_WINDOW}
          days={1}
          existingLineIds={[]}
          equipment={[bookedUnit]}
          bundles={[]}
          onAdd={onAdd}
        />,
      )
    })

    const browseBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Browse catalogue"]')!
    await act(async () => {
      browseBtn.click()
    })

    const row = container.querySelector<HTMLElement>('li[role="option"]')!
    expect(row.getAttribute('aria-label')).toContain('Opens the sub-rent and overbooking options')

    await act(async () => {
      row.click()
    })

    const overbookRadio = document.querySelector<HTMLInputElement>('#overbooking-overbook')!
    expect(overbookRadio.disabled).toBe(false)

    // Select overbooking
    await act(async () => {
      overbookRadio.click()
    })

    const buttons = Array.from(document.querySelectorAll('button'))
    const submitBtn = buttons.find((b) => b.textContent?.includes('Add it anyway'))!
    expect(submitBtn).toBeDefined()

    await act(async () => {
      submitBtn.click()
    })

    expect(onAdd).toHaveBeenCalled()
    const addedLines = onAdd.mock.calls[0]![0]
    // Internal pick added (not sub-rental) with conflict listed
    expect(addedLines[0]?.lineType).toBe('Equipment')
    expect(addedLines[0]?.id).toBe('unit-booked')
  })
})
