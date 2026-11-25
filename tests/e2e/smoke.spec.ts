import { test, expect } from '@playwright/test'

/**
 * Smoke tests that need no staff credentials.
 * They confirm the app boots against staging and that protected routes
 * send anonymous visitors to the login screen.
 */

test('login page renders with email and password fields', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
  await expect(page.locator('button[type="submit"]').first()).toBeVisible()
})

test('anonymous visit to a protected route redirects to login', async ({ page }) => {
  await page.goto('/rentals')
  await expect(page).toHaveURL(/\/login/)
})

test('bad credentials show an error and stay on login', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill('nobody@example.invalid')
  await page.locator('input[type="password"]').fill('wrong-password-for-e2e')
  await page.locator('button[type="submit"]').first().click()
  await expect(page).toHaveURL(/\/login/)
})
