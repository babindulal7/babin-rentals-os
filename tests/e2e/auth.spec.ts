import { test, expect } from './fixture'

// Dedicated staging account only. CI must fail, not silently skip auth coverage.
const email = process.env.E2E_OWNER_EMAIL
const password = process.env.E2E_OWNER_PASSWORD
if (process.env.CI && (!email || !password)) {
  throw new Error('E2E CI requires dedicated staging owner credentials.')
}

test.skip(!email || !password, 'Dedicated staging owner credentials not configured')

test('owner can sign in and open protected rentals route', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email!)
  await page.locator('input[type="password"]').fill(password!)
  await page.locator('button[type="submit"]').first().click()
  await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/, { timeout: 30_000 })
  await page.goto('/rentals')
  await expect(page).toHaveURL(/\/rentals(?:[/?#]|$)/)
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
})
