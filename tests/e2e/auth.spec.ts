import { test, expect } from './fixture'

const accounts = [
  { role: 'Owner', email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD },
  { role: 'Manager', email: process.env.E2E_MANAGER_EMAIL, password: process.env.E2E_MANAGER_PASSWORD },
  { role: 'Warehouse', email: process.env.E2E_STAFF_EMAIL, password: process.env.E2E_STAFF_PASSWORD },
] as const

// Local smoke runs may omit credentials; CI may never silently skip a role.
if (process.env.CI) {
  for (const account of accounts) {
    if (!account.email || !account.password) {
      throw new Error(`E2E CI requires dedicated staging credentials for ${account.role}.`)
    }
  }
  if (new Set(accounts.map(a => a.email?.trim().toLowerCase())).size !== accounts.length) {
    throw new Error('E2E CI requires separate accounts for each role.')
  }
}

for (const account of accounts) {
  test(`${account.role} can sign in and access Operations`, async ({ page }) => {
    test.skip(!account.email || !account.password, 'Dedicated staging credentials not configured')
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(account.email!)
    await page.locator('input[type="password"]').fill(account.password!)
    await page.locator('button[type="submit"]').first().click()
    // /dashboard is only a redirect to /today, so assert the final route.
    await expect(page).toHaveURL(/\/today(?:[/?#]|$)/, { timeout: 30_000 })
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
    await page.goto('/operations')
    await expect(page).toHaveURL(/\/operations(?:[/?#]|$)/)
    await expect(page.getByLabel('Operational queues', { exact: true })).toBeVisible({ timeout: 30_000 })
  })
}
