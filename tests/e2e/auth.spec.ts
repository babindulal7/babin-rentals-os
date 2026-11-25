import { test, expect } from '@playwright/test'

/**
 * Real sign-in against the staging backend, for each E2E test account.
 * Each role is skipped unless its login is supplied via environment
 * variables (never committed).
 */

const roles = [
  { key: 'OWNER', label: 'owner' },
  { key: 'MANAGER', label: 'manager' },
  { key: 'STAFF', label: 'staff' },
] as const

for (const role of roles) {
  const email = process.env[`E2E_${role.key}_EMAIL`]
  const password = process.env[`E2E_${role.key}_PASSWORD`]

  test(`${role.label} can sign in and leave the login screen`, async ({ page }) => {
    test.skip(!email || !password, `E2E_${role.key}_EMAIL / E2E_${role.key}_PASSWORD not set`)

    await page.goto('/login')
    await page.locator('input[type="email"]').fill(email!)
    await page.locator('input[type="password"]').fill(password!)
    await page.locator('button[type="submit"]').first().click()
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
  })
}
