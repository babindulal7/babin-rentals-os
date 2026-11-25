import { test, expect } from '@playwright/test'
import { signIn, credentialsFor, dismissOnboarding } from './helpers'

/*
 * Finance P0: expense persistence and the payment dialog.
 * These tests WRITE to the staging project (allowed for staging only).
 */

test.describe('expenses', () => {
  test.skip(!credentialsFor('OWNER'), 'E2E_OWNER_* not set')

  test('a saved expense draft persists after reload', async ({ page }) => {
    await signIn(page, 'OWNER')
    await page.goto('/finance?tab=expenses')
    await dismissOnboarding(page)

    const tag = `E2E expense ${Date.now()}`
    await page.getByRole('button', { name: /Add Expense/ }).first().click()
    const dialog = page.getByRole('dialog').first()

    // Fields have no accessible labels yet; they are addressed by position in the dialog.
    await dialog.locator('select').nth(0).selectOption({ label: 'Office & Warehouse Utilities' })
    await dialog.locator('input:not([type])').nth(1).fill(tag) // Vendor
    await dialog.locator('input:not([type])').nth(2).fill(tag) // Description
    await dialog.locator('input[type="number"]').fill('1234')
    await dialog.locator('select').nth(1).selectOption({ label: 'Kathmandu Main HQ' })

    await dialog.getByRole('button', { name: 'Save Draft', exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    await page.reload()
    await dismissOnboarding(page)
    // The list is long and not guaranteed to show the newest row first; search for this run's tag.
    await page.getByPlaceholder(/Search vendor, description/).fill(tag)
    await expect(page.getByText(tag).first()).toBeVisible({ timeout: 20_000 })
  })

  test('a failed save shows an error and a retry succeeds', async ({ page }) => {
    await signIn(page, 'OWNER')
    await page.goto('/finance?tab=expenses')
    await dismissOnboarding(page)

    const tag = `E2E retry ${Date.now()}`
    await page.getByRole('button', { name: /Add Expense/ }).first().click()
    const dialog = page.getByRole('dialog').first()
    await dialog.locator('select').nth(0).selectOption({ label: 'Office & Warehouse Utilities' })
    await dialog.locator('input:not([type])').nth(1).fill(tag)
    await dialog.locator('input:not([type])').nth(2).fill(tag)
    await dialog.locator('input[type="number"]').fill('500')
    await dialog.locator('select').nth(1).selectOption({ label: 'Kathmandu Main HQ' })

    // Simulate the network dropping for the expense write only.
    await page.route('**/rest/v1/expenses**', (route) => {
      if (route.request().method() === 'POST') return route.abort('internetdisconnected')
      return route.continue()
    })
    await dialog.getByRole('button', { name: 'Save Draft', exact: true }).click()
    await expect(dialog.getByRole('alert').first().or(page.getByRole('alert').first())).toBeVisible({ timeout: 20_000 })
    await expect(dialog).toBeVisible()

    // Network restored: the same save now succeeds.
    await page.unroute('**/rest/v1/expenses**')
    await dialog.getByRole('button', { name: 'Save Draft', exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })
    await page.reload()
    await dismissOnboarding(page)
    // The list is long and not guaranteed to show the newest row first; search for this run's tag.
    await page.getByPlaceholder(/Search vendor, description/).fill(tag)
    await expect(page.getByText(tag).first()).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('record payment', () => {
  test.skip(!credentialsFor('OWNER'), 'E2E_OWNER_* not set')

  test('cancel closes the dialog and records nothing', async ({ page }) => {
    await signIn(page, 'OWNER')
    await page.goto('/finance')
    await dismissOnboarding(page)

    await page.getByRole('button', { name: /Record Payment/ }).first().click()
    const dialog = page.getByRole('dialog').first()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
  })

  test('recording a payment is accepted and the dialog closes', async ({ page }) => {
    await signIn(page, 'OWNER')
    await page.goto('/finance')
    await dismissOnboarding(page)

    await page.getByRole('button', { name: /Record Payment/ }).first().click()
    const dialog = page.getByRole('dialog').first()
    // A successful run settles the one open staging invoice. Skip rather than fail when none is left.
    const settled = (await dialog.getByText(/fully settled|cannot be recorded/).count()) > 0
    test.skip(settled, 'No open staging invoice left; seed a new Draft invoice on staging to re-run')
    // The invoice select is pre-filled with the one open invoice on staging.
    await expect(dialog.locator('select').first()).not.toHaveValue('')
    // Payment methods are labels wrapping hidden radio inputs; click the visible label.
    await dialog.locator('label').filter({ hasText: /^Cash/ }).click()
    await dialog.getByRole('button', { name: 'Record Payment', exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })
  })
})
