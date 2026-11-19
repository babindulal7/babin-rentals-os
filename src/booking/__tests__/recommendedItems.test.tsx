// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProductDetailModal } from '../components/ProductDetailModal'
import { fetchProductRecommendations, type CatalogueItem } from '../lib/catalogueApi'
import { fetchProductRecommendationsAdmin, saveStaffRecommendations } from '@/lib/queries/recommendations'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const MOCK_CAM: CatalogueItem = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'product',
  slug: 'sony-fx3-cinema-line-camera',
  name: 'Sony FX3 Cinema Line Camera',
  category_name: 'Cameras',
  description: 'Full-frame cinema camera.',
  photo_paths: [],
  daily_rate_paisa: 450000,
  weekly_rate_paisa: 2700000,
  monthly_rate_paisa: 9000000,
  bundle_contents: [],
}

describe('T7-12 · Recommended items ("Often rented with", up to 6)', () => {
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

  it('fetchProductRecommendations returns up to 6 co-rented items for a product', async () => {
    const recs = await fetchProductRecommendations(MOCK_CAM.id)
    expect(recs.length).toBeGreaterThan(0)
    expect(recs.length).toBeLessThanOrEqual(6)
    // Does not recommend itself
    expect(recs.every((r) => r.id !== MOCK_CAM.id)).toBe(true)
    expect(recs[0]).toHaveProperty('daily_rate_paisa')
    expect(recs[0]).toHaveProperty('position')
  })

  it('ProductDetailModal renders "Often Rented With" section with 1-tap add button', async () => {
    const onAddToCart = vi.fn()
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        <ProductDetailModal
          item={MOCK_CAM}
          hasDates={false}
          onClose={onClose}
          onAddToCart={onAddToCart}
        />,
      )
    })

    // Allow promise in useEffect to resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(container.textContent).toContain('Often Rented With')
    expect(container.textContent).toContain('(up to 6 items)')

    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('+ Add to Request'),
    )
    expect(addBtn).toBeTruthy()

    await act(async () => {
      addBtn?.click()
    })

    expect(onAddToCart).toHaveBeenCalledTimes(1)
  })

  it('fetchProductRecommendationsAdmin and saveStaffRecommendations query and persist staff pins', async () => {
    const adminRecs = await fetchProductRecommendationsAdmin(MOCK_CAM.id)
    expect(adminRecs.length).toBeGreaterThan(0)
    expect(adminRecs[0]).toHaveProperty('source')

    const saveResult = await saveStaffRecommendations(MOCK_CAM.id, [
      { recommended_product_id: 'mock-rec-prod-1', position: 1 },
    ])
    expect(saveResult).toBe(true)
  })
})
