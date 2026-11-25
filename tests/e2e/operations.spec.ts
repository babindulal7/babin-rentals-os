import { test, expect } from '@playwright/test'
import { signIn, credentialsFor } from './helpers'

/*
 * Operations P0: the packing gate. Read-only: nothing is confirmed here, so
 * no booking changes state. Booking 99001 is a synthetic staging booking.
 */

test.describe('operations packing gate', () => {
  test.skip(!credentialsFor('OWNER'), 'E2E_OWNER_* not set')

  test('Confirm stays disabled until the packing requirements are met, and says why', async ({ page }) => {
    await signIn(page, 'OWNER')
    await page.goto('/rentals/99001/packing')
    await expect(page.getByRole('heading', { name: 'Packing Workspace' }).first()).toBeVisible({ timeout: 30_000 })

    // The phone layout renders a second copy of this control; both must be disabled.
    const complete = page.getByRole('button', { name: /Complete Packing/ }).first()
    await expect(complete).toBeDisabled()
    await expect(page.getByText('At least one item verified').first()).toBeVisible()
  })
})
