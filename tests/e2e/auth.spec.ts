import { test, expect } from '@playwright/test'

/**
 * Real sign-in against the staging backend. Skipped unless the owner
 * test login is supplied via environment variables (never committed).
 */

const email = process.env.E2E_OWNER_EMAIL
const password = process.env.E2E_OWNER_PASSWORD

test.skip(!email || !password, 'E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD not set')

test('owner can sign in and leave the login screen', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email!)
  await page.locator('input[type="password"]').fill(password!)
  await page.locator('button[type="submit"]').first().click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
})
