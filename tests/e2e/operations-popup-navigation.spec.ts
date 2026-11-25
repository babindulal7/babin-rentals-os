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
          // Wait for the real asynchronous receiver defaults. Hydration is not
          // an edit and must not trigger the unsaved-work dialog on Back.
          await expect(popup.getByRole('checkbox', { name: 'Booking Authorization Verified', exact: true })).toBeChecked()
          await expect(next('Return & Inspection')).toBeDisabled()
          await browse.getByRole('button', { name: /Packing/ }).click()
          await expect(active).toHaveAccessibleName(/^Packing ·/)
          await expect(next('Handover')).toBeEnabled()
          await next('Handover').click()
          await expect(active).toHaveAccessibleName(/^Handover ·/)
          const authorization = popup.getByRole('checkbox', { name: 'Booking Authorization Verified', exact: true })
          await expect(authorization).toBeChecked()
          // Explicitly changing a check (including turning it OFF) is unsaved
          // work. The original discard protection must still operate.
          await authorization.click()
          await expect(authorization).not.toBeChecked()
          await browse.getByRole('button', { name: /Packing/ }).click()
          const discard = page.getByRole('dialog', { name: 'You have unsaved changes.', exact: true }).or(page.getByRole('alertdialog')).filter({ visible: true }).last()
          await expect(discard.getByRole('button', { name: 'Stay Here', exact: true })).toBeVisible()
          await discard.getByRole('button', { name: 'Stay Here', exact: true }).click()
          await expect(active).toHaveAccessibleName(/^Handover ·/)
          await expect(authorization).not.toBeChecked()
          await browse.getByRole('button', { name: /Packing/ }).click()
          await discard.getByRole('button', { name: 'Discard & Go Back', exact: true }).click()
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

test.describe('Operations packing confirmation and duplicate-submit protection', () => {
  test.skip(!disposable, 'Synthetic local CI only')
  test('evidence gate, discard protection and successful packing persist exactly once', async ({ page }, testInfo) => {
    const email = process.env.E2E_OWNER_EMAIL
    const password = process.env.E2E_OWNER_PASSWORD
    const key = process.env.E2E_LOCAL_ANON_KEY
    const prefix = 'E2E_OPS_CONFIRM_' + testInfo.project.name.toUpperCase()
    const id = process.env[prefix + '_ID']
    const no = process.env[prefix + '_NO']
    if (!disposable || !email?.startsWith('disposable-') || !email.endsWith('@example.test') || !password || !key || !id || !no) throw new Error('Dedicated local packing fixture required')
    const api = createClient(API, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const auth = await api.auth.signInWithPassword({ email, password })
    expect(auth.error).toBeNull()
    expect(auth.data.session).not.toBeNull()
    const stage = async () => {
      const result = await api.from('bookings').select('stage').eq('id', id).single()
      expect(result.error).toBeNull()
      return result.data?.stage
    }
    const sessions = async () => {
      const result = await api.from('operation_sessions').select('id,state').eq('booking_id', id).eq('operation', 'Packing')
      expect(result.error).toBeNull()
      return result.data ?? []
    }
    try {
      expect(await stage()).toBe('Booked')
      expect(await sessions()).toHaveLength(0)
      await page.goto('/login')
      await page.locator('input[type="email"]').fill(email)
      await page.locator('input[type="password"]').fill(password)
      await page.locator('button[type="submit"]').first().click()
      await expect(page).toHaveURL(/\/today(?:[/?#]|$)/, { timeout: 30_000 })
      const welcome = page.getByRole('dialog', { name: 'Welcome to Babin Rentals OS', exact: true })
      await expect(welcome).toBeVisible()
      await welcome.getByRole('button', { name: 'Skip', exact: true }).click()
      await page.goto('/rentals/' + encodeURIComponent(no))
      await page.getByRole('button', { name: 'Start Packing', exact: true }).filter({ visible: true }).first().click()
      const popup = page.getByRole('dialog', { name: /^Operations ·/ })
      const confirm = popup.getByRole('button', { name: 'Confirm Packing & Next', exact: true })
      const notes = popup.getByRole('textbox', { name: 'Packing session notes', exact: true })
      await expect(confirm).toBeDisabled()
      await notes.fill('Synthetic packing acceptance')
      await popup.getByRole('group', { name: 'Browse operation stages' }).getByRole('button', { name: 'Close', exact: true }).click()
      const discard = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: 'Discard unsaved operations work?', exact: true })).filter({ visible: true }).last()
      await expect(discard.getByRole('button', { name: 'Keep Editing', exact: true })).toBeVisible()
      await discard.getByRole('button', { name: 'Keep Editing', exact: true }).click()
      await expect(notes).toHaveValue('Synthetic packing acceptance')
      await popup.getByRole('button', { name: 'Mark Pending Packed', exact: true }).click()
      await expect(confirm).toBeDisabled()
      expect(await stage()).toBe('Booked')
      expect(await sessions()).toHaveLength(0)
      // Real upload of a tiny synthetic JPEG via the existing file-input handler.
      const jpeg = await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 96
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#777'
        ctx.fillRect(0, 0, 96, 96)
        return canvas.toDataURL('image/jpeg').split(',')[1]!
      })
      await popup.locator('#pack-evidence input[type="file"]').setInputFiles({
        name: 'synthetic-packing.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64'),
      })
      await expect(confirm).toBeEnabled({ timeout: 30_000 })
      await confirm.click({ clickCount: 2 })
      await expect.poll(stage, { timeout: 30_000 }).toBe('Packed')
      await expect(popup.getByRole('navigation', { name: 'Operation stage' }).locator('[aria-current="step"]')).toHaveAccessibleName(/^Handover ·/, { timeout: 30_000 })
      const recorded = await sessions()
      expect(recorded).toHaveLength(1)
      expect(recorded[0]?.state).toBe('Completed')
      const transitions = await api.from('booking_stage_transitions').select('id').eq('booking_id', id).eq('from_stage', 'Booked').eq('to_stage', 'Packed')
      expect(transitions.error).toBeNull()
      expect(transitions.data).toHaveLength(1)
      await page.reload()
      expect(await stage()).toBe('Packed')
      expect(await sessions()).toHaveLength(1)
    } finally {
      await api.auth.signOut({ scope: 'local' })
    }
  })
})
