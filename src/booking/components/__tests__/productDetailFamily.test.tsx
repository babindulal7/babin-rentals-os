// @vitest-environment jsdom
/**
 * T7-13 · The option picker in the product detail modal. Choosing an option adds that
 * option's own product to the request, and an option unavailable for the chosen dates cannot be picked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act, type ComponentProps } from 'react'
import { ProductDetailModal } from '../ProductDetailModal'
import type { CatalogueItem } from '../../lib/catalogueApi'
import type { FamilyOptionChoice } from '../../lib/familyOptions'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const product = (id: string, name: string, rate: number): CatalogueItem => ({
  id,
  kind: 'product',
  slug: id,
  name,
  category_name: 'Lenses',
  description: 'Option test product',
  photo_paths: [],
  daily_rate_paisa: rate,
  weekly_rate_paisa: null,
  monthly_rate_paisa: null,
  bundle_contents: [],
})

const EF = product('p-ef', 'PF lens EF', 200000)
const PL = product('p-pl', 'PF lens PL', 250000)
const choices: FamilyOptionChoice[] = [
  { item: EF, optionLabel: 'EF' },
  { item: PL, optionLabel: 'PL' },
]

describe('ProductDetailModal · option picker (T7-13)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (props: Partial<ComponentProps<typeof ProductDetailModal>>) => {
    const onAddToCart = vi.fn()
    act(() => {
      root.render(
        <ProductDetailModal
          item={EF}
          hasDates={true}
          isAvailable={true}
          onClose={() => {}}
          onAddToCart={onAddToCart}
          {...props}
        />,
      )
    })
    return { onAddToCart }
  }

  const radios = () => Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
  const addButton = () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes('Add to Request'))!

  it('shows no picker for a standalone product', () => {
    render({ familyChoices: [] })
    expect(container.textContent).not.toContain('Choose an option')
    expect(radios()).toHaveLength(0)
  })

  it('offers every option, with the requested product selected by default', () => {
    render({ familyChoices: choices })
    expect(container.textContent).toContain('Choose an option')
    expect(radios()).toHaveLength(2)
    expect(radios()[0]!.checked).toBe(true)
    expect(radios()[1]!.checked).toBe(false)
  })

  it('adds the chosen option, not the requested product, to the request', () => {
    const { onAddToCart } = render({ familyChoices: choices })
    act(() => radios()[1]!.click())
    act(() => addButton().click())
    expect(onAddToCart).toHaveBeenCalledTimes(1)
    expect(onAddToCart.mock.calls[0]![0].id).toBe('p-pl')
  })

  it('cannot pick an option that is unavailable for the chosen dates', () => {
    const { onAddToCart } = render({
      familyChoices: choices,
      hasDates: true,
      isAvailable: true,
      availabilityById: new Map([['p-pl', false]]),
    })
    expect(radios()[1]!.disabled).toBe(true)
    expect(container.textContent).toContain('Not available on these dates')
    act(() => addButton().click())
    expect(onAddToCart.mock.calls[0]![0].id).toBe('p-ef')
  })

  it('disables Add when the requested product is unavailable for the chosen dates', () => {
    render({ item: PL, familyChoices: choices, hasDates: true, isAvailable: false })
    expect(addButton().disabled).toBe(true)
  })

  it('disables Add when dates have not yet been selected', () => {
    render({ item: EF, familyChoices: choices, hasDates: false })
    expect(addButton().disabled).toBe(true)
  })
})
