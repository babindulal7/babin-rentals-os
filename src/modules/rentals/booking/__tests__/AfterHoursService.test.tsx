// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AddItemPanel } from '../AddItemPanel'
import { SERVICE_PRODUCTS, runQuery, serviceLineDraft, NO_WINDOW } from '../itemCatalogue'
import { rupees } from '../../../../lib/money'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

function setNativeValue(input: HTMLInputElement, value: string) {
  const proto = HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('T3-10 · After-hours handover service line (D7, Law 6)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('includes After-hours handover in SERVICE_PRODUCTS with no fixed price (ratePaisa: null)', () => {
    const afterHours = SERVICE_PRODUCTS.find((s) => s.id === 'svc-after-hours-handover')
    expect(afterHours).toBeDefined()
    expect(afterHours?.name).toBe('After-hours handover')
    expect(afterHours?.ratePaisa).toBeNull()

    const outcome = runQuery(NO_WINDOW, {
      query: 'after-hours',
      kinds: new Set(['service']),
      category: null,
      availability: null,
      sort: 'recommended',
      minQueryChars: 1,
      existingLineIds: new Set(),
    })
    const serviceGroup = outcome.groups.find((g) => g.kind === 'service')
    expect(serviceGroup?.results.some((r) => r.name === 'After-hours handover')).toBe(true)
  })

  it('builds a Service line draft with typed amount and 1 day duration', () => {
    const draft = serviceLineDraft({ name: 'After-hours handover', rateRupees: 1500 })
    expect(draft.lineType).toBe('Service')
    expect(draft.name).toBe('After-hours handover')
    expect(draft.ratePaisa).toBe(rupees(1500))
    expect(draft.days).toBe(1)
    expect(draft.qty).toBe(1)
    expect(draft.category).toBe('Service')
  })

  it('allows money roles to type amount and add After-hours handover in AddItemPanel', async () => {
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(AddItemPanel, {
            inline: true,
            window: NO_WINDOW,
            days: 3,
            existingLineIds: [],
            onAdd,
            showPrices: true,
          })
        )
      )
    })

    // Open the inline panel by clicking Browse
    const browseBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Browse')
    )
    expect(browseBtn).toBeDefined()
    await act(async () => {
      browseBtn?.click()
    })

    // Tap 1: open Services tab
    const servicesTab = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Services')
    )
    expect(servicesTab).toBeDefined()
    await act(async () => {
      servicesTab?.click()
    })

    expect(container.textContent).toContain('After-hours handover')

    // Validation when empty
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add After-hours handover')
    )
    expect(addBtn).toBeDefined()
    await act(async () => {
      addBtn?.click()
    })
    expect(container.textContent).toContain('Enter an amount')
    expect(onAdd).not.toHaveBeenCalled()

    // Enter amount and tap Add
    const amountInput = container.querySelector('input[aria-label="After-hours handover amount (Rs)"]') as HTMLInputElement
    expect(amountInput).not.toBeNull()
    await act(async () => {
      setNativeValue(amountInput, '1500')
    })
    await act(async () => {
      addBtn?.click()
    })

    expect(onAdd).toHaveBeenCalledTimes(1)
    const [lines, source] = onAdd.mock.calls[0]!
    expect(source.kind).toBe('service')
    expect(source.name).toBe('After-hours handover')
    expect(lines[0]).toMatchObject({
      lineType: 'Service',
      name: 'After-hours handover',
      ratePaisa: rupees(1500),
      days: 1,
      qty: 1,
    })
  })

  it('hides amount input and Rs prices from money-blind roles (Law 6)', async () => {
    const onAdd = vi.fn()

    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(AddItemPanel, {
            inline: true,
            window: NO_WINDOW,
            days: 2,
            existingLineIds: [],
            onAdd,
            showPrices: false,
          })
        )
      )
    })

    const browseBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Browse')
    )
    await act(async () => {
      browseBtn?.click()
    })

    const servicesTab = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Services')
    )
    await act(async () => {
      servicesTab?.click()
    })

    expect(container.textContent).toContain('After-hours handover')
    expect(container.querySelector('input[aria-label="After-hours handover amount (Rs)"]')).toBeNull()
    expect(container.textContent).not.toContain('Amount (Rs)')
  })
})
