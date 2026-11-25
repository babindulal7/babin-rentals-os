import { createClient } from '@supabase/supabase-js'
import { test, expect } from './fixture'

const API = 'http://127.0.0.1:54321'
const disposable = process.env.BABIN_E2E_DISPOSABLE === '1'
  && process.env.GITHUB_ACTIONS === 'true'
  && process.env.RUNNER_ENVIRONMENT === 'github-hosted'
  && process.env.RUNNER_OS === 'Linux'
  && process.env.E2E_LOCAL_URL === API

test.describe('Operations custody stage gates — disposable only (#443)', () => {
  test.skip(!disposable, 'Dedicated disposable CI database required')

  test('Quote cannot open any custody operation or advance on reload', async ({ page }) => {
    const email = process.env.E2E_OWNER_EMAIL
    const password = process.env.E2E_OWNER_PASSWORD
    const key = process.env.E2E_LOCAL_ANON_KEY
    if (!disposable || !email?.startsWith('disposable-') || !email.endsWith('@example.test') || !password || !key) {
      throw new Error('Synthetic Owner and disposable public key required')
    }
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(30_000)
    const owner = createClient(API, key, { auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
    }, global: { fetch: (input, init) => {
      const timeout = AbortSignal.timeout(15_000)
      return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout })
    } } })
    const auth = await owner.auth.signInWithPassword({ email, password })
    if (auth.error || !auth.data.session) throw new Error('Synthetic Owner sign-in failed')

    try {
      // Reuse the existing isolated runner's actual Quote fixture. Never
      // create a booking via a privileged browser-side shortcut.
      const client = await owner.from('clients').select('id').eq('name', 'Disposable Payment Client A').single()
      expect(client.error?.code ?? null).toBeNull()
      expect(client.data?.id).toBeTruthy()
      const booking = await owner.from('bookings').select('id,booking_no,stage,updated_at').eq('client_id', client.data!.id).single()
      expect(booking.error?.code ?? null).toBeNull()
      expect(booking.data?.stage).toBe('Quote')
      expect(booking.data?.booking_no).toBeTruthy()
      const before = booking.data!
      const read = async () => {
        const result = await owner.from('bookings').select('id,booking_no,stage,updated_at').eq('id', before.id).single()
        expect(result.error?.code ?? null).toBeNull()
        return result.data
      }

      await test.step('Sign in through UI and open actual Quote', async () => {
        await page.goto('/login')
        await page.locator('input[type="email"]').fill(email)
        await page.locator('input[type="password"]').fill(password)
        await page.locator('button[type="submit"]').first().click()
        await expect(page).toHaveURL(/\/today(?:[/?#]|$)/, { timeout: 30_000 })
        const welcome = page.getByRole('dialog', { name: 'Welcome to Babin Rentals OS', exact: true })
        await expect(welcome).toBeVisible({ timeout: 15_000 })
        await welcome.getByRole('button', { name: 'Skip', exact: true }).click()
        await expect(welcome).toHaveCount(0)
        await page.goto('/rentals/' + encodeURIComponent(before.booking_no))
      })

      const assertHeldMenu = async () => {
        const trigger = page.locator('button.booking-operations__trigger[aria-label="Operations"]').filter({ visible: true })
        await expect(trigger).toHaveCount(1, { timeout: 30_000 })
        await expect(trigger).toBeEnabled()
        await trigger.click()
        // Phone drawer and desktop/tablet menu use the same item class.
        // Assert all four real controls and their displayed gate reason.
        const choices = page.locator('.booking-operations__item').filter({ visible: true })
        await expect(choices).toHaveCount(4)
        for (const label of ['Packing', 'Handover', 'Return & Inspection', 'Cleaning & Reset']) {
          const choice = choices.filter({ hasText: label })
          await expect(choice).toHaveCount(1)
          await expect(choice).toBeDisabled()
          await expect(choice).toContainText('Operations open once this booking is Booked')
        }
        await expect(page.getByRole('dialog', { name: /^Operations ·/ })).toHaveCount(0)
        expect(await read()).toEqual(before)
      }
      await test.step('All four operation choices are held and Quote is unchanged', assertHeldMenu)
      await test.step('Reload and confirm the same real stage gate and database row', async () => {
        await page.reload()
        await assertHeldMenu()
      })
    } finally {
      await owner.auth.signOut({ scope: 'local' })
    }
  })
})
