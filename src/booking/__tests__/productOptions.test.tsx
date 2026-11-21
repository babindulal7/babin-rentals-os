// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fetchPublicCatalogue } from '../lib/catalogueApi'
import { ProductCard } from '../components/ProductCard'
import { ProductDetailModal } from '../components/ProductDetailModal'
import type { CatalogueItem } from '../lib/catalogueApi'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('Products with options on one page (T7-13, B2)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    container?.remove()
  })

  it('exposes family_id, option_label, and option_dimension on catalogue items', async () => {
    const items = await fetchPublicCatalogue()
    const options = items.filter((i) => Boolean(i.family_id))

    expect(options.length).toBeGreaterThanOrEqual(2)
    for (const opt of options) {
      expect(opt.family_id).toBeTruthy()
      expect(opt.option_label).toBeTruthy()
      expect(opt.family_name).toBeTruthy()
      expect(opt.option_dimension).toBeTruthy()
    }
  })

  it('ProductCard displays option count badge when multiple options exist', async () => {
    const sampleItem: CatalogueItem = {
      id: 'prod-pl',
      kind: 'product',
      slug: 'dzofilm-vespid-35mm-pl',
      name: 'DZOFilm Vespid 35mm T2.1 Cine Lens (PL Mount)',
      category_name: 'Lens',
      description: 'Cinema prime lens with PL mount',
      photo_paths: [],
      daily_rate_paisa: 350000,
      weekly_rate_paisa: 1400000,
      monthly_rate_paisa: 4200000,
      bundle_contents: [],
      family_id: 'fam-dzofilm-35',
      option_label: 'PL Mount',
      family_name: 'DZOFilm Vespid 35mm T2.1 Prime Lens',
      option_dimension: 'Mount',
    }

    const onViewDetails = vi.fn()
    const onAddToCart = vi.fn()

    await act(async () => {
      root.render(
        <ProductCard
          item={sampleItem}
          hasDates={true}
          isAvailable={true}
          optionCount={2}
          onViewDetails={onViewDetails}
          onAddToCart={onAddToCart}
        />
      )
    })

    // Option badge should appear
    expect(container.textContent).toContain('2 Mount')

    // Primary action should say "Choose Option" instead of "Details"
    const chooseBtn = container.querySelector('button.btn-secondary') as HTMLButtonElement
    expect(chooseBtn).toBeTruthy()
    expect(chooseBtn.textContent).toContain('Choose Option')

    await act(async () => {
      chooseBtn.click()
    })
    expect(onViewDetails).toHaveBeenCalledWith(sampleItem)
  })

  it('ProductDetailModal renders option chips and allows picking between options (B2, B7)', async () => {
    const itemPL: CatalogueItem = {
      id: 'prod-pl',
      kind: 'product',
      slug: 'dzofilm-vespid-35mm-pl',
      name: 'DZOFilm Vespid 35mm T2.1 Cine Lens (PL Mount)',
      category_name: 'Lens',
      description: 'Cinema prime lens with PL mount',
      photo_paths: [],
      daily_rate_paisa: 350000,
      weekly_rate_paisa: 1400000,
      monthly_rate_paisa: 4200000,
      bundle_contents: [],
      family_id: 'fam-dzofilm-35',
      option_label: 'PL Mount',
      family_name: 'DZOFilm Vespid 35mm T2.1 Prime Lens',
      option_dimension: 'Mount',
    }

    const itemEF: CatalogueItem = {
      id: 'prod-ef',
      kind: 'product',
      slug: 'dzofilm-vespid-35mm-ef',
      name: 'DZOFilm Vespid 35mm T2.1 Cine Lens (EF Mount)',
      category_name: 'Lens',
      description: 'Cinema prime lens with EF mount',
      photo_paths: [],
      daily_rate_paisa: 320000,
      weekly_rate_paisa: 1280000,
      monthly_rate_paisa: 3840000,
      bundle_contents: [],
      family_id: 'fam-dzofilm-35',
      option_label: 'EF Mount',
      family_name: 'DZOFilm Vespid 35mm T2.1 Prime Lens',
      option_dimension: 'Mount',
    }

    const siblings = [itemPL, itemEF]
    const availabilityMap = new Map<string, boolean>([
      ['prod-pl', false],
      ['prod-ef', true],
    ])

    const onClose = vi.fn()
    const onAddToCart = vi.fn()

    await act(async () => {
      root.render(
        <ProductDetailModal
          item={itemPL}
          hasDates={true}
          isAvailable={false}
          siblingOptions={siblings}
          availabilityMap={availabilityMap}
          onClose={onClose}
          onAddToCart={onAddToCart}
        />
      )
    })

    // Modal title should use family_name
    expect(container.textContent).toContain('DZOFilm Vespid 35mm T2.1 Prime Lens')

    // Both option chips should be present
    expect(container.textContent).toContain('PL Mount')
    expect(container.textContent).toContain('EF Mount')

    // Availability per option should be indicated
    expect(container.textContent).toContain('Available')
    expect(container.textContent).toContain('Unavailable')

    // Initially active item is PL (which is unavailable) - add button is disabled
    const addBtn = container.querySelector('button.btn-primary') as HTMLButtonElement
    expect(addBtn.disabled).toBe(true)

    // Find and click the EF Mount option button (which is available)
    const buttons = Array.from(container.querySelectorAll('button.option-chip')) as HTMLButtonElement[]
    const efBtn = buttons.find((b) => b.textContent?.includes('EF Mount'))
    expect(efBtn).toBeTruthy()

    await act(async () => {
      efBtn!.click()
    })

    // Button should now be enabled
    expect(addBtn.disabled).toBe(false)

    // Adding to cart should add the EF Mount item, not the PL Mount item
    await act(async () => {
      addBtn.click()
    })
    expect(onAddToCart).toHaveBeenCalledWith(itemEF)
  })
})
