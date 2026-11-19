import { describe, it, expect } from 'vitest'
import {
  resolveLegacyBooqableUrl,
  type LegacyMappingEntry,
} from '../legacyUrlResolver'

describe('T7-17 Legacy Booqable URL Resolver', () => {
  const mappings: LegacyMappingEntry[] = [
    { booqableSlug: 'sony-fx3-cinema-line', canonicalSlug: 'sony-fx3', entityType: 'product' },
    { booqableSlug: 'canon-c70-4k', canonicalSlug: 'canon-eos-c70', entityType: 'product' },
    { booqableSlug: 'lenses-primes', canonicalSlug: 'cinema-primes', entityType: 'category' },
  ]

  it('resolves product URLs with exact mapping, case-insensitivity, and trailing slash handling', () => {
    const res1 = resolveLegacyBooqableUrl('https://babinrentals.com/products/sony-fx3-cinema-line/', mappings)
    expect(res1.matched).toBe(true)
    expect(res1.targetPath).toBe('/catalogue/sony-fx3')
    expect(res1.isFallback).toBe(false)

    const res2 = resolveLegacyBooqableUrl('/PRODUCTS/Canon-C70-4k', mappings)
    expect(res2.matched).toBe(true)
    expect(res2.targetPath).toBe('/catalogue/canon-eos-c70')
  })

  it('resolves category URLs to catalogue category search queries', () => {
    const res = resolveLegacyBooqableUrl('/categories/lenses-primes?sort=price', mappings)
    expect(res.matched).toBe(true)
    expect(res.targetPath).toBe('/catalogue?category=cinema-primes')
    expect(res.sanitizedQuery).toBe('?sort=price')
  })

  it('safely passes unmapped slugs through encoded canonical path', () => {
    const res = resolveLegacyBooqableUrl('/products/unmapped-mic-kit')
    expect(res.matched).toBe(true)
    expect(res.targetPath).toBe('/catalogue/unmapped-mic-kit')
  })

  it('falls back to catalogue home for unknown / malformed paths without blank screen', () => {
    const res1 = resolveLegacyBooqableUrl('/unknown/deep/legacy/page')
    expect(res1.matched).toBe(false)
    expect(res1.targetPath).toBe('/catalogue')
    expect(res1.isFallback).toBe(true)

    const res2 = resolveLegacyBooqableUrl('')
    expect(res2.targetPath).toBe('/catalogue')
    expect(res2.isFallback).toBe(true)
  })

  it('strips dangerous javascript: or malformed query fragments', () => {
    const res = resolveLegacyBooqableUrl('/products/sony-fx3-cinema-line?redirect=javascript:alert(1)&ref=google', mappings)
    expect(res.sanitizedQuery).toBe('?ref=google')
  })
})
