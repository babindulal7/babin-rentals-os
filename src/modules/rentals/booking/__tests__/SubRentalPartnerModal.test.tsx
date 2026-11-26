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

import { SubRentalPartnerModal } from '../SubRentalPartnerModal'
import type { EquipmentResult } from '../itemCatalogue'
import { rupees } from '../../../../lib/money'

const sampleUnit: EquipmentResult = {
  id: 'unit-sample',
  productKey: 'prod-sample',
  name: 'Sony FX3 Cinema Camera',
  category: 'Cameras',
  brand: 'Sony',
  sku: 'CAM-FX3',
  serial: 'FX3-001',
  location: 'Main Warehouse',
  kind: 'equipment',
  ratePaisa: rupees(5000),
  status: 'On Rent',
  committedTo: 'BK-2026-1000',
  inBundles: [],
  haystack: ['sony', 'fx3'],
  availability: {
    level: 'unavailable',
    label: 'Unavailable',
    detail: 'Booked',
    tone: 'danger',
    icon: 'error',
    shortLines: [],
    freedLines: [],
  },
}

async function typeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('SubRentalPartnerModal (T3-13)', () => {
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

  it('renders partner options and hides prices for money-blind roles (Law 6)', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        <SubRentalPartnerModal
          isOpen={true}
          unit={sampleUnit}
          days={3}
          showPrices={false}
          onClose={onClose}
          onConfirm={onConfirm}
        />,
      )
    })

    const partnerInput = document.querySelector<HTMLInputElement>('#subrent-partner-select')!
    expect(partnerInput.value).toBe('')
    await typeInput(partnerInput, 'Real supplier')

    // Prices must not exist in DOM for non-money roles
    expect(document.querySelector('#subrent-client-rate')).toBeNull()
    expect(document.querySelector('#subrent-supplier-cost')).toBeNull()

    // Confirm button
    const confirmBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Sub-Rental Line'),
    )!
    expect(confirmBtn).toBeTruthy()

    await act(async () => {
      confirmBtn.click()
    })

    expect(onConfirm).toHaveBeenCalledWith(sampleUnit, 'Real supplier', undefined, undefined)
  })

  it('shows prices and cost inputs for money-authorized roles and permits custom partners', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        <SubRentalPartnerModal
          isOpen={true}
          unit={sampleUnit}
          days={2}
          showPrices={true}
          onClose={onClose}
          onConfirm={onConfirm}
        />,
      )
    })

    const rateInput = document.querySelector<HTMLInputElement>('#subrent-client-rate')!
    const costInput = document.querySelector<HTMLInputElement>('#subrent-supplier-cost')!
    expect(rateInput).toBeTruthy()
    expect(rateInput.value).toBe('5000')
    expect(costInput).toBeTruthy()

    const partnerInput = document.querySelector<HTMLInputElement>('#subrent-partner-select')!
    await typeInput(partnerInput, 'CineLab Kathmandu')
    await typeInput(rateInput, '6000')
    await typeInput(costInput, '4500')

    const confirmBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Sub-Rental Line'),
    )!
    await act(async () => {
      confirmBtn.click()
    })

    expect(onConfirm).toHaveBeenCalledWith(sampleUnit, 'CineLab Kathmandu', rupees(6000), 4500)
  })
})
