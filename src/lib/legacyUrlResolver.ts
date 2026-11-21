/**
 * Legacy Booqable URL Resolver (T7-17)
 *
 * Resolves legacy Booqable product, category, and store URLs to Babin Rentals OS canonical paths:
 * - /products/:slug -> /catalogue/:newSlug (or /catalogue/products/:productId)
 * - /categories/:slug -> /catalogue?category=:categorySlug
 * - /collections/:slug -> /catalogue?category=:categorySlug
 * - Trailing slashes, uppercase characters, and URI encoding handled safely.
 * - Unsafe query parameters/fragments sanitized to prevent open redirects or XSS.
 * - Unknown or invalid paths fallback safely to the catalogue home (/catalogue).
 */

import { supabase } from './supabase'

export interface LegacyMappingEntry {
  booqableSlug: string
  canonicalSlug: string
  entityType: 'product' | 'category'
}

export interface ResolveUrlResult {
  matched: boolean
  targetPath: string
  isFallback: boolean
  entityType?: 'product' | 'category' | 'home'
  resolvedSlug?: string
  categoryName?: string
  sanitizedQuery?: string
}

export const DEFAULT_LEGACY_MAPPINGS: readonly LegacyMappingEntry[] = [
  // Cameras
  { booqableSlug: 'sony-fx3-cinema-line', canonicalSlug: 'sony-fx3-cinema-line-camera', entityType: 'product' },
  { booqableSlug: 'sony-fx3', canonicalSlug: 'sony-fx3-cinema-line-camera', entityType: 'product' },
  { booqableSlug: 'sony-a7s-iii', canonicalSlug: 'sony-a7s-iii', entityType: 'product' },
  { booqableSlug: 'canon-c70-4k', canonicalSlug: 'canon-eos-c70', entityType: 'product' },
  { booqableSlug: 'canon-eos-c70', canonicalSlug: 'canon-eos-c70', entityType: 'product' },
  { booqableSlug: 'blackmagic-pocket-6k-pro', canonicalSlug: 'bmpcc-6k-pro', entityType: 'product' },
  { booqableSlug: 'red-komodo-6k', canonicalSlug: 'red-komodo-6k', entityType: 'product' },

  // Lenses
  { booqableSlug: 'sony-fe-24-70mm-f2-8-gm-ii', canonicalSlug: 'sony-fe-24-70mm-f2-8-gm-ii', entityType: 'product' },
  { booqableSlug: 'sony-24-70-gm2', canonicalSlug: 'sony-fe-24-70mm-f2-8-gm-ii', entityType: 'product' },
  { booqableSlug: 'sony-fe-70-200mm-f2-8-gm-oss-ii', canonicalSlug: 'sony-fe-70-200mm-f2-8-gm-oss-ii', entityType: 'product' },
  { booqableSlug: 'sigma-24-70mm-f2-8-dg-dn-art', canonicalSlug: 'sigma-24-70mm-f2-8-art-e-mount', entityType: 'product' },
  { booqableSlug: 'lenses-primes', canonicalSlug: 'cinema-primes', entityType: 'category' },

  // Lighting
  { booqableSlug: 'aputure-ls-600d-pro-daylight-led', canonicalSlug: 'aputure-ls-600d-pro-daylight-led', entityType: 'product' },
  { booqableSlug: 'aputure-600d-pro', canonicalSlug: 'aputure-ls-600d-pro-daylight-led', entityType: 'product' },
  { booqableSlug: 'aputure-300d-mark-ii', canonicalSlug: 'aputure-ls-c300d-ii', entityType: 'product' },
  { booqableSlug: 'nanlite-forza-500b-ii', canonicalSlug: 'nanlite-forza-500b-ii', entityType: 'product' },
  { booqableSlug: 'amaran-200x-bi-color', canonicalSlug: 'amaran-200x-led', entityType: 'product' },

  // Grip
  { booqableSlug: 'dji-rs-3-pro-gimbal-stabilizer', canonicalSlug: 'dji-rs-3-pro-gimbal-stabilizer', entityType: 'product' },
  { booqableSlug: 'dji-rs3-pro', canonicalSlug: 'dji-rs-3-pro-gimbal-stabilizer', entityType: 'product' },
  { booqableSlug: 'dji-ronin-sc', canonicalSlug: 'dji-ronin-sc', entityType: 'product' },
  { booqableSlug: 'c-stand-20-turtle-base', canonicalSlug: 'matthews-40-c-stand', entityType: 'product' },

  // Audio
  { booqableSlug: 'sennheiser-mkh-416-shotgun-mic', canonicalSlug: 'sennheiser-mkh-416-shotgun-mic', entityType: 'product' },
  { booqableSlug: 'sennheiser-mkh416', canonicalSlug: 'sennheiser-mkh-416-shotgun-mic', entityType: 'product' },
  { booqableSlug: 'rode-wireless-go-ii-dual', canonicalSlug: 'rode-wireless-pro', entityType: 'product' },
  { booqableSlug: 'zoom-f6-field-recorder', canonicalSlug: 'zoom-f6-audio-recorder', entityType: 'product' },

  // Categories
  { booqableSlug: 'cameras', canonicalSlug: 'Cameras', entityType: 'category' },
  { booqableSlug: 'video-cameras', canonicalSlug: 'Cameras', entityType: 'category' },
  { booqableSlug: 'cinema-cameras', canonicalSlug: 'Cameras', entityType: 'category' },
  { booqableSlug: 'lenses', canonicalSlug: 'Lenses', entityType: 'category' },
  { booqableSlug: 'lighting', canonicalSlug: 'Lighting', entityType: 'category' },
  { booqableSlug: 'lights', canonicalSlug: 'Lighting', entityType: 'category' },
  { booqableSlug: 'audio', canonicalSlug: 'Audio', entityType: 'category' },
  { booqableSlug: 'sound', canonicalSlug: 'Audio', entityType: 'category' },
  { booqableSlug: 'grip', canonicalSlug: 'Grip', entityType: 'category' },
  { booqableSlug: 'support', canonicalSlug: 'Grip', entityType: 'category' },
  { booqableSlug: 'bundles', canonicalSlug: 'Bundle Deals', entityType: 'category' },
  { booqableSlug: 'packages', canonicalSlug: 'Bundle Deals', entityType: 'category' },
]

/**
 * Fetch dynamic legacy mappings from database (external_refs table),
 * falling back to or merging with DEFAULT_LEGACY_MAPPINGS.
 */
export async function fetchLegacyMappings(): Promise<LegacyMappingEntry[]> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase

  if (isMock) {
    return [...DEFAULT_LEGACY_MAPPINGS]
  }

  try {
    const { data, error } = await supabase
      .from('external_refs')
      .select('external_id, local_id')
      .eq('provider', 'booqable')
      .eq('entity', 'products')

    if (error || !data) {
      return [...DEFAULT_LEGACY_MAPPINGS]
    }

    const dynamicMappings: LegacyMappingEntry[] = data.map((row) => ({
      booqableSlug: row.external_id,
      canonicalSlug: row.local_id,
      entityType: 'product' as const,
    }))

    return [...DEFAULT_LEGACY_MAPPINGS, ...dynamicMappings]
  } catch {
    return [...DEFAULT_LEGACY_MAPPINGS]
  }
}

export function resolveLegacyBooqableUrl(
  inputUrlOrPath: string,
  mappings: readonly LegacyMappingEntry[] = DEFAULT_LEGACY_MAPPINGS,
): ResolveUrlResult {
  const fallbackResult: ResolveUrlResult = {
    matched: false,
    targetPath: '/catalogue',
    isFallback: true,
  }

  if (!inputUrlOrPath || typeof inputUrlOrPath !== 'string') {
    return fallbackResult
  }

  // Parse path and query
  let pathname = ''
  let queryString = ''

  try {
    // If given a full URL or relative path
    const dummyBase = 'https://book.babinrentals.com'
    const parsed = new URL(inputUrlOrPath, dummyBase)
    pathname = parsed.pathname
    queryString = parsed.search
  } catch {
    return fallbackResult
  }

  // Normalize path: lowercase, strip trailing slash (except root)
  const normalizedPath = pathname.toLowerCase().replace(/\/+$/, '') || '/'

  // 1. Check Product Patterns: /products/:slug or /items/:slug
  const productMatch = normalizedPath.match(/^\/(?:products|items)\/([^/]+)$/)
  if (productMatch) {
    const rawSlug = decodeURIComponent(productMatch[1]!).trim()
    const mapping = mappings.find(
      (m) => m.entityType === 'product' && m.booqableSlug.toLowerCase() === rawSlug.toLowerCase()
    )

    const targetSlug = mapping ? mapping.canonicalSlug : rawSlug
    return {
      matched: true,
      targetPath: `/catalogue/${encodeURIComponent(targetSlug)}`,
      isFallback: false,
      entityType: 'product',
      resolvedSlug: targetSlug,
      ...(queryString ? { sanitizedQuery: sanitizeQuery(queryString) } : {}),
    }
  }

  // 2. Check Category Patterns: /categories/:slug or /collections/:slug
  const categoryMatch = normalizedPath.match(/^\/(?:categories|collections)\/([^/]+)$/)
  if (categoryMatch) {
    const rawSlug = decodeURIComponent(categoryMatch[1]!).trim()
    const mapping = mappings.find(
      (m) => m.entityType === 'category' && m.booqableSlug.toLowerCase() === rawSlug.toLowerCase()
    )

    const targetCat = mapping ? mapping.canonicalSlug : rawSlug
    return {
      matched: true,
      targetPath: `/catalogue?category=${encodeURIComponent(targetCat)}`,
      isFallback: false,
      entityType: 'category',
      categoryName: targetCat,
      ...(queryString ? { sanitizedQuery: sanitizeQuery(queryString) } : {}),
    }
  }

  // 3. Store Home / Cart: / or /store or /cart or /catalogue
  if (normalizedPath === '/' || normalizedPath === '/store' || normalizedPath === '/cart' || normalizedPath === '/catalogue') {
    return {
      matched: true,
      targetPath: '/catalogue',
      isFallback: false,
      entityType: 'home',
    }
  }

  // Default fallback for unknown legacy paths
  return fallbackResult
}

/** Sanitize query params: strip javascript:, dangerous schemes, or protocol injection */
function sanitizeQuery(query: string): string {
  if (!query) return ''
  const params = new URLSearchParams(query)
  const safeParams = new URLSearchParams()

  for (const [key, val] of params.entries()) {
    // Drop dangerous keys or javascript/data URIs
    if (
      /^[a-zA-Z0-9_-]+$/.test(key) &&
      !/^javascript:/i.test(val) &&
      !/^data:/i.test(val)
    ) {
      safeParams.append(key, val)
    }
  }

  const res = safeParams.toString()
  return res ? `?${res}` : ''
}
