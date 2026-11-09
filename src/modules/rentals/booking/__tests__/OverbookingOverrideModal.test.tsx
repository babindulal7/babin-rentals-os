// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { OverbookingOverrideModal } from '../OverbookingOverrideModal'
import type { EquipmentResult } from '../itemCatalogue'
import { rupees } from '../../../../lib/money'

// @ts-expect-error React 18 act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockUnit: EquipmentResult = {
  id: 'unit-1',
  productKey: 'prod-sony-fx3',
  name: 'Sony FX3 Cinema Camera',
  category: 'Cameras',
  brand: 'Sony',
  sku: 'CAM-FX3',
  serial: 'FX3-001',
  location: 'Main Warehouse',
  kind: 'equipment',
  ratePaisa: rupees(5000),
  status: 'On Rent',
  committedTo: 'BK-2026-0042',
  inBundles: [],
  haystack: ['sony', 'fx3', 'cameras'],
  availability: {
    level: 'unavailable',
    label: 'Unavailable',
    detail: 'Booked on BK-2026-0042',
    tone: 'danger',
    icon: 'error',
    shortLines: [],
    freedLines: [],
  },
}

describe('OverbookingOverrideModal (#11 overbooking gate)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
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

  it('offers sub-rent and disables overbooking when allowOverbooking is false', async () => {
    const onOverbook = vi.fn()
    const onSubRent = vi.fn()
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        <OverbookingOverrideModal
          isOpen={true}
          unit={mockUnit}
          allowOverbooking={false}
          onOverbook={onOverbook}
          onSubRent={onSubRent}
          onClose={onClose}
        />,
      )
    })

    const subrentRadio = document.querySelector<HTMLInputElement>('#overbooking-subrent')!
    const overbookRadio = document.querySelector<HTMLInputElement>('#overbooking-overbook')!
    const buttons = Array.from(document.querySelectorAll('button'))
    const submitBtn = buttons.find((b) => b.textContent?.includes('Add as Sub-Rental'))!

    expect(subrentRadio.checked).toBe(true)
    expect(subrentRadio.disabled).toBe(false)
    expect(overbookRadio.disabled).toBe(true)
    expect(document.body.textContent).toContain('Disabled in Settings ▸ Financial ▸ Booking rules')
    expect(submitBtn).toBeDefined()
    expect(submitBtn.disabled).toBe(false)

    await act(async () => {
      submitBtn.click()
    })

    expect(onSubRent).toHaveBeenCalledWith(mockUnit)
    expect(onOverbook).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('never silently falls back to onOverbook when onSubRent is omitted', async () => {
    const onOverbook = vi.fn()
    const onClose = vi.fn()

    // allowOverbooking=false and onSubRent is omitted (undefined)
    await act(async () => {
      root.render(
        <OverbookingOverrideModal
          isOpen={true}
          unit={mockUnit}
          allowOverbooking={false}
          onOverbook={onOverbook}
          onClose={onClose}
        />,
      )
    })

    const subrentRadio = document.querySelector<HTMLInputElement>('#overbooking-subrent')!
    const overbookRadio = document.querySelector<HTMLInputElement>('#overbooking-overbook')!
    const buttons = Array.from(document.querySelectorAll('button'))
    const submitBtn = buttons.find((b) => b.textContent?.includes('Add as Sub-Rental') || b.textContent?.includes('Add it anyway'))!

    // Both options are unavailable
    expect(subrentRadio.disabled).toBe(true)
    expect(overbookRadio.disabled).toBe(true)
    expect(submitBtn.disabled).toBe(true)

    // Even if clicked directly, handler must not fire onOverbook under sub-rent
    await act(async () => {
      submitBtn.click()
    })

    expect(onOverbook).not.toHaveBeenCalled()
  })

  it('allows switching between sub-rent and overbook when allowOverbooking is true', async () => {
    const onOverbook = vi.fn()
    const onSubRent = vi.fn()
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        <OverbookingOverrideModal
          isOpen={true}
          unit={mockUnit}
          allowOverbooking={true}
          onOverbook={onOverbook}
          onSubRent={onSubRent}
          onClose={onClose}
        />,
      )
    })

    const subrentRadio = document.querySelector<HTMLInputElement>('#overbooking-subrent')!
    const overbookRadio = document.querySelector<HTMLInputElement>('#overbooking-overbook')!
    let buttons = Array.from(document.querySelectorAll('button'))
    let submitBtn = buttons.find((b) => b.textContent?.includes('Add as Sub-Rental'))!

    expect(subrentRadio.disabled).toBe(false)
    expect(overbookRadio.disabled).toBe(false)
    expect(subrentRadio.checked).toBe(true)
    expect(submitBtn).toBeDefined()

    // Switch to overbook
    await act(async () => {
      overbookRadio.click()
    })

    buttons = Array.from(document.querySelectorAll('button'))
    submitBtn = buttons.find((b) => b.textContent?.includes('Add it anyway'))!
    expect(overbookRadio.checked).toBe(true)
    expect(submitBtn).toBeDefined()
    expect(submitBtn.disabled).toBe(false)
    expect(document.body.textContent).toContain('Confirm remains blocked')

    // Confirm overbook
    await act(async () => {
      submitBtn.click()
    })

    expect(onOverbook).toHaveBeenCalledWith(mockUnit)
    expect(onSubRent).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('selects overbook by default when allowOverbooking is true but onSubRent is omitted', async () => {
    const onOverbook = vi.fn()
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        <OverbookingOverrideModal
          isOpen={true}
          unit={mockUnit}
          allowOverbooking={true}
          onOverbook={onOverbook}
          onClose={onClose}
        />,
      )
    })

    const subrentRadio = document.querySelector<HTMLInputElement>('#overbooking-subrent')!
    const overbookRadio = document.querySelector<HTMLInputElement>('#overbooking-overbook')!
    const buttons = Array.from(document.querySelectorAll('button'))
    const submitBtn = buttons.find((b) => b.textContent?.includes('Add it anyway'))!

    expect(subrentRadio.disabled).toBe(true)
    expect(overbookRadio.disabled).toBe(false)
    expect(overbookRadio.checked).toBe(true)
    expect(submitBtn).toBeDefined()
    expect(submitBtn.disabled).toBe(false)

    await act(async () => {
      submitBtn.click()
    })

    expect(onOverbook).toHaveBeenCalledWith(mockUnit)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes dialog on cancel button click', async () => {
    const onOverbook = vi.fn()
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        <OverbookingOverrideModal
          isOpen={true}
          unit={mockUnit}
          allowOverbooking={true}
          onOverbook={onOverbook}
          onClose={onClose}
        />,
      )
    })

    const buttons = Array.from(document.querySelectorAll('button'))
    const cancelBtn = buttons.find((b) => b.textContent === 'Cancel')!
    expect(cancelBtn).toBeDefined()

    await act(async () => {
      cancelBtn.click()
    })

    expect(onClose).toHaveBeenCalled()
    expect(onOverbook).not.toHaveBeenCalled()
  })
})
