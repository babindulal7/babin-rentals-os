import { test as base, expect } from '@playwright/test'
import { STAGING_URL } from './staging-guard.mjs'

// Only local application traffic and exact staging API traffic are allowed.
// Abort other destinations, including any production API or payment endpoint.
export const test = base.extend({
  page: async ({ context, page }, use) => {
    const unexpected: string[] = []
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://localhost:4179' || url.origin === STAGING_URL || url.protocol === 'data:' || url.protocol === 'blob:') {
        await route.continue()
      } else {
        if (url.hostname.endsWith('.supabase.co') || !['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
          unexpected.push(url.origin)
        }
        await route.abort()
      }
    })
    await use(page)
    expect(unexpected, 'Unexpected backend or non-read external requests').toEqual([])
  },
})
export { expect }
