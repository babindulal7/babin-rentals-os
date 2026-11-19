import { describe, it, expect } from 'vitest'
import { fetchPublicCatalogue, checkPublicAvailability, getPublicPhotoUrl } from '../lib/catalogueApi'
import { formatMoney, type Paisa } from '@/lib/money'

describe('Public Catalogue and Availability Engine (T7-02)', () => {
  it('loads public catalogue items with integer paisa rates', async () => {
    const items = await fetchPublicCatalogue()
    expect(items.length).toBeGreaterThan(0)

    for (const item of items) {
      expect(item.id).toBeDefined()
      expect(item.name).toBeTruthy()
      expect(item.daily_rate_paisa).toBeGreaterThan(0)
      expect(Number.isInteger(item.daily_rate_paisa)).toBe(true)

      // Formatting rates with formatMoney should produce valid Rupee string
      const formatted = formatMoney(item.daily_rate_paisa as Paisa)
      expect(formatted).toMatch(/^Rs\s?[0-9,]+/)
    }
  })

  it('guarantees that public catalogue never exposes internal/commercial figures (Law 6 & D-6.a)', async () => {
    const items = await fetchPublicCatalogue()

    const forbiddenFields = [
      'purchase_price',
      'book_value',
      'replacement_value',
      'serial_number',
      'serials',
      'sku',
      'stock_count',
      'total_quantity',
      'supplier_id',
      'notes_internal',
      'cost',
    ]

    for (const item of items) {
      const keys = Object.keys(item)
      for (const field of forbiddenFields) {
        expect(keys).not.toContain(field)
      }
    }
  })

  it('correctly handles bundle packages with bundle_contents only', async () => {
    const items = await fetchPublicCatalogue()
    const bundles = items.filter((i) => i.kind === 'bundle')

    for (const b of bundles) {
      expect(Array.isArray(b.bundle_contents)).toBe(true)
      for (const comp of b.bundle_contents) {
        expect(comp.name).toBeTruthy()
        expect(comp.qty).toBeGreaterThan(0)
        // Bundle contents must not expose serials or costs
        expect((comp as any).serial).toBeUndefined()
        expect((comp as any).cost).toBeUndefined()
      }
    }
  })

  it('checks public availability without leaking counts or booking details', async () => {
    const items = await fetchPublicCatalogue()
    const productIds = items.slice(0, 3).map((i) => i.id)

    const fromDate = '2026-12-01'
    const toDate = '2026-12-03'

    const availability = await checkPublicAvailability(productIds, fromDate, toDate)
    expect(availability instanceof Map).toBe(true)

    for (const id of productIds) {
      expect(typeof availability.get(id)).toBe('boolean')
    }
  })

  it('resolves public photo URLs from paths correctly', () => {
    expect(getPublicPhotoUrl(undefined)).toBeNull()
    expect(getPublicPhotoUrl('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg')
    expect(getPublicPhotoUrl('/icons/192.png')).toBe('/icons/192.png')
    const storageUrl = getPublicPhotoUrl('products/camera-01.jpg')
    expect(typeof storageUrl).toBe('string')
  })
})
