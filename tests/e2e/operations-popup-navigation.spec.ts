import { createClient } from '@supabase/supabase-js'
import { test, expect } from './fixture'

const API = 'http://127.0.0.1:54321'
const disposable = process.env.BABIN_E2E_DISPOSABLE === '1'
  && process.env.GITHUB_ACTIONS === 'true'
  && process.env.RUNNER_ENVIRONMENT === 'github-hosted'
  && process.env.RUNNER_OS === 'Linux'
  && process.env.E2E_LOCAL_URL === API

test.describe('Operations popup persisted-stage navigation', () => {
  test.skip(!disposable, 'Synthetic local CI only')
  for (const initial of ['BOOKED', 'PACKED'] as const) {
    test(initial + ': open, respect locked stages, browse and close without custody writes', async ({ page }) => {
      const email = process.env.E2E_OWNER_EMAIL
      const password = process.env.E2E_OWNER_PASSWORD
      const key = process.env.E2E_LOCAL_ANON_KEY
      const id = process.env['E2E_OPS_' + initial + '_ID']
      const no = process.env['E2E_OPS_' + initial + '_NO']
      if (!disposable || !email?.startsWith('disposable-') || !email.endsWith('@example.test') || !password || !key || !id || !no) throw new Error('Synthetic Operations fixture required')
      const api = createClient(API, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      const auth = await api.auth.signInWithPassword({ email, password })
      expect(auth.error).toBeNull()
      expect(auth.data.session).not.toBeNull()
      const persistedStage = async () => {
        const result = await api.from('bookings').select('stage').eq('id', id).single()
        expect(result.error).toBeNull()
        return result.data?.stage
      }
      try {
        expect(await persistedStage()).toBe(initial === 'BOOKED' ? 'Booked' : 'Packed')
        await page.goto('/login')
        await page.locator('input[type="email"]').fill(email)
        await page.locator('input[type="password"]').fill(password)
        await page.locator('button[type="submit"]').first().click()
        await expect(page).toHaveURL(/\/today(?:[/?#]|$)/, { timeout: 30_000 })
        const welcome = page.getByRole('dialog', { name: 'Welcome to Babin Rentals OS', exact: true })
        await expect(welcome).toBeVisible()
        await welcome.getByRole('button', { name: 'Skip', exact: true }).click()
        await expect(welcome).toHaveCount(0)
        await page.goto('/rentals/' + encodeURIComponent(no))
        const opener = page.getByRole('button', { name: initial === 'BOOKED' ? 'Start Packing' : 'Handover', exact: true }).filter({ visible: true }).first()
        await expect(opener).toBeEnabled({ timeout: 30_000 })
        await opener.click()
        const popup = page.getByRole('dialog', { name: /^Operations ·/ })
        await expect(popup).toBeVisible({ timeout: 30_000 })
        const stages = popup.getByRole('navigation', { name: 'Operation stage' })
        const browse = popup.getByRole('group', { name: 'Browse operation stages' })
        const active = stages.locator('[aria-current="step"]')
        const next = (name: string) => browse.getByRole('button', { name: 'Next stage: ' + name, exact: true })
        if (initial === 'PACKED') {
          await expect(active).toHaveAccessibleName(/^Handover ·/)
          await expect(next('Return & Inspection')).toBeDisabled()
          await browse.getByRole('button', { name: /Packing/ }).click()
          await expect(active).toHaveAccessibleName(/^Packing ·/)
          await expect(next('Handover')).toBeEnabled()
          await next('Handover').click()
          await expect(active).toHaveAccessibleName(/^Handover ·/)
          await browse.getByRole('button', { name: /Packing/ }).click()
        } else {
          await expect(active).toHaveAccessibleName(/^Packing ·/)
          await expect(next('Handover')).toBeDisabled()
          await expect(popup.getByRole('button', { name: 'Confirm Packing & Next', exact: true })).toBeDisabled()
          await expect(stages.getByRole('button', { name: /^Handover ·/ })).toBeDisabled()
        }
        await expect(active).toHaveAccessibleName(/^Packing ·/)
        await browse.getByRole('button', { name: 'Close', exact: true }).click()
        await expect(popup).toHaveCount(0)
        await expect(opener).toBeVisible()
        expect(await persistedStage()).toBe(initial === 'BOOKED' ? 'Booked' : 'Packed')
        await page.reload()
        await expect(opener).toBeVisible({ timeout: 30_000 })
        expect(await persistedStage()).toBe(initial === 'BOOKED' ? 'Booked' : 'Packed')
      } finally {
        await api.auth.signOut({ scope: 'local' })
      }
    })
  }
})
