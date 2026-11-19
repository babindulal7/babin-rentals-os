// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  resolveLegacyBooqableUrl,
  DEFAULT_LEGACY_MAPPINGS,
  fetchLegacyMappings,
} from '../legacyUrlResolver'

describe('T7-17 Old Booqable Store Links Comprehensive Resolution', () => {
  describe('1. Product paths from Google, Instagram, WhatsApp', () => {
    const testCases = [
      {
        input: 'https://babinrentals.com/products/sony-fx3-cinema-line/',
        expectedTarget: '/catalogue/sony-fx3-cinema-line-camera',
        expectedSlug: 'sony-fx3-cinema-line-camera',
      },
      {
        input: '/products/sony-fe-24-70mm-f2-8-gm-ii',
        expectedTarget: '/catalogue/sony-fe-24-70mm-f2-8-gm-ii',
        expectedSlug: 'sony-fe-24-70mm-f2-8-gm-ii',
      },
      {
        input: '/PRODUCTS/APUTURE-LS-600D-PRO-DAYLIGHT-LED/',
        expectedTarget: '/catalogue/aputure-ls-600d-pro-daylight-led',
        expectedSlug: 'aputure-ls-600d-pro-daylight-led',
      },
      {
        input: '/items/dji-rs3-pro',
        expectedTarget: '/catalogue/dji-rs-3-pro-gimbal-stabilizer',
        expectedSlug: 'dji-rs-3-pro-gimbal-stabilizer',
      },
      {
        input: '/products/sennheiser-mkh416',
        expectedTarget: '/catalogue/sennheiser-mkh-416-shotgun-mic',
        expectedSlug: 'sennheiser-mkh-416-shotgun-mic',
      },
    ]

    it.each(testCases)('resolves $input to $expectedTarget', ({ input, expectedTarget, expectedSlug }) => {
      const res = resolveLegacyBooqableUrl(input)
      expect(res.matched).toBe(true)
      expect(res.isFallback).toBe(false)
      expect(res.entityType).toBe('product')
      expect(res.targetPath).toBe(expectedTarget)
      expect(res.resolvedSlug).toBe(expectedSlug)
    })
  })

  describe('2. Category and collection paths', () => {
    const categoryCases = [
      {
        input: 'https://babinrentals.com/categories/cameras',
        expectedCategory: 'Cameras',
      },
      {
        input: '/categories/lighting/',
        expectedCategory: 'Lighting',
      },
      {
        input: '/collections/audio',
        expectedCategory: 'Audio',
      },
      {
        input: '/collections/bundles',
        expectedCategory: 'Bundle Deals',
      },
      {
        input: '/categories/grip',
        expectedCategory: 'Grip',
      },
    ]

    it.each(categoryCases)('resolves $input to category $expectedCategory', ({ input, expectedCategory }) => {
      const res = resolveLegacyBooqableUrl(input)
      expect(res.matched).toBe(true)
      expect(res.isFallback).toBe(false)
      expect(res.entityType).toBe('category')
      expect(res.categoryName).toBe(expectedCategory)
      expect(res.targetPath).toContain(`/catalogue?category=${encodeURIComponent(expectedCategory)}`)
    })
  })

  describe('3. Campaign query tags and XSS sanitization', () => {
    it('preserves clean tracking parameters', () => {
      const res = resolveLegacyBooqableUrl('/products/sony-fx3-cinema-line?utm_source=instagram&utm_medium=bio')
      expect(res.matched).toBe(true)
      expect(res.targetPath).toBe('/catalogue/sony-fx3-cinema-line-camera')
      expect(res.sanitizedQuery).toContain('utm_source=instagram')
      expect(res.sanitizedQuery).toContain('utm_medium=bio')
    })

    it('strips dangerous javascript: schemes from queries', () => {
      const res = resolveLegacyBooqableUrl('/products/sony-fx3?next=javascript:alert(1)&ref=whatsapp')
      expect(res.sanitizedQuery).toBe('?ref=whatsapp')
      expect(res.sanitizedQuery).not.toContain('javascript')
    })
  })

  describe('4. Store root and fallback paths', () => {
    it('maps old store and cart roots to /catalogue', () => {
      expect(resolveLegacyBooqableUrl('/store').targetPath).toBe('/catalogue')
      expect(resolveLegacyBooqableUrl('/store/').targetPath).toBe('/catalogue')
      expect(resolveLegacyBooqableUrl('/cart').targetPath).toBe('/catalogue')
      expect(resolveLegacyBooqableUrl('/').targetPath).toBe('/catalogue')
    })

    it('gracefully falls back to /catalogue for unknown or made-up legacy paths', () => {
      const res1 = resolveLegacyBooqableUrl('/unknown-vintage-gear-from-2015')
      expect(res1.matched).toBe(false)
      expect(res1.isFallback).toBe(true)
      expect(res1.targetPath).toBe('/catalogue')

      const res2 = resolveLegacyBooqableUrl('/wp-content/uploads/2021/catalogue.pdf')
      expect(res2.matched).toBe(false)
      expect(res2.isFallback).toBe(true)
      expect(res2.targetPath).toBe('/catalogue')
    })
  })

  describe('5. Dynamic mapping store loader', () => {
    it('returns default legacy mappings in mock / offline environment', async () => {
      const maps = await fetchLegacyMappings()
      expect(maps.length).toBeGreaterThanOrEqual(DEFAULT_LEGACY_MAPPINGS.length)
      expect(maps.some((m) => m.booqableSlug === 'sony-fx3-cinema-line')).toBe(true)
    })
  })
})
