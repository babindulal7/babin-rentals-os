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

export interface LegacyMappingEntry {
  booqableSlug: string
  canonicalSlug: string
  entityType: 'product' | 'category'
}

export interface ResolveUrlResult {
  matched: boolean
  targetPath: string
  isFallback: boolean
  sanitizedQuery?: string
}

export function resolveLegacyBooqableUrl(
  inputUrlOrPath: string,
  mappings: LegacyMappingEntry[] = [],
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
      ...(queryString ? { sanitizedQuery: sanitizeQuery(queryString) } : {}),
    }
  }

  // 3. Store Home / Cart: / or /store or /cart
  if (normalizedPath === '/' || normalizedPath === '/store') {
    return {
      matched: true,
      targetPath: '/catalogue',
      isFallback: false,
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
