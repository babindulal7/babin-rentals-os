import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from './fixture'

const API = 'http://127.0.0.1:54321'
const disposable = process.env.BABIN_E2E_DISPOSABLE === '1'
  && process.env.GITHUB_ACTIONS === 'true'
  && process.env.RUNNER_ENVIRONMENT === 'github-hosted'
  && process.env.RUNNER_OS === 'Linux'
  && process.env.E2E_LOCAL_URL === API

test.describe('Durable rental draft — disposable database only', () => {
  test.skip(!disposable, 'No write test may run against a hosted project')

  test('saves, reloads and edits the same draft without confirming a booking', async ({ page }, testInfo) => {
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(30_000)
    // Log fixed phase names only, never form values, IDs, tokens or URLs.
    const checkpoint = (phase: string) => console.log('[draft:' + testInfo.project.name + '] ' + phase)
    checkpoint('API authentication')
    const email = process.env.E2E_OWNER_EMAIL
    const password = process.env.E2E_OWNER_PASSWORD
    const key = process.env.E2E_LOCAL_ANON_KEY
    if (!disposable || !email?.startsWith('disposable-') || !email.endsWith('@example.test') || !password || !key) {
      throw new Error('Disposable synthetic credentials required')
    }

    const owner = createClient(API, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: {
      fetch: (input, init) => {
        const timeout = AbortSignal.timeout(15_000)
        return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout })
      },
    } })
    const auth = await owner.auth.signInWithPassword({ email, password })
    if (auth.error || !auth.data.session) throw new Error('Synthetic Owner API sign-in failed')
    const project = 'E2E Draft ' + testInfo.project.name + ' ' + randomUUID().slice(0, 12)
    const revised = project + ' revised'

    try {
      checkpoint('Browser authentication')
      await page.goto('/login')
      await page.locator('input[type="email"]').fill(email)
      await page.locator('input[type="password"]').fill(password)
      await page.locator('button[type="submit"]').first().click()
      await expect(page).toHaveURL(/\/today(?:[/?#]|$)/, { timeout: 30_000 })
      checkpoint('Open rental form')
      await page.goto('/rentals?action=new')
      const field = page.getByRole('textbox', { name: 'Project / production name', exact: true })
      await expect(field).toBeVisible({ timeout: 30_000 })
      await field.fill(project)

      const saveDraft = async () => {
        const save = page.getByRole('button', { name: 'Save draft', exact: true }).filter({ visible: true }).first()
        if (await save.isVisible()) await save.click()
        else {
          await page.getByRole('button', { name: 'More rental actions', exact: true }).click()
          await page.getByRole('menuitem', { name: 'Save draft', exact: true }).click()
        }
      }
      checkpoint('Save initial draft')
      await saveDraft()
      await expect(page).toHaveURL(/[?&]draft=[0-9a-f-]{36}(?:&|$)/i, { timeout: 30_000 })
      const draftId = new URL(page.url()).searchParams.get('draft')!
      const read = () => owner.from('rental_drafts').select('id,client_uuid,booking_client_uuid,status,data,converted_booking_id').eq('id', draftId).single()
      checkpoint('Read initial persisted draft')
      const first = await read()
      expect(first.error?.code ?? null).toBeNull()
      expect(first.data?.status).toBe('Active')
      expect(first.data?.converted_booking_id).toBeNull()
      expect(first.data?.data?.projectName).toBe(project)
      expect(first.data?.data?.bookingNo).toBeTruthy()
      expect(first.data?.booking_client_uuid).toMatch(/^[0-9a-f-]{36}$/i)

      checkpoint('Reload initial draft')
      await page.reload()
      await expect(field).toHaveValue(project, { timeout: 30_000 })
      checkpoint('Edit and save same draft')
      await field.fill(revised)
      await saveDraft()
      await expect.poll(async () => {
        const current = await read()
        if (current.error) throw new Error('Persisted draft read failed: ' + current.error.code)
        return current.data?.data?.projectName
      }, { timeout: 30_000 }).toBe(revised)
      expect(new URL(page.url()).searchParams.get('draft')).toBe(draftId)
      const updated = await read()
      expect(updated.error?.code ?? null).toBeNull()
      expect(updated.data?.id).toBe(draftId)
      expect(updated.data?.client_uuid).toBe(first.data?.client_uuid)
      expect(updated.data?.booking_client_uuid).toBe(first.data?.booking_client_uuid)
      expect(updated.data?.data?.bookingNo).toBe(first.data?.data?.bookingNo)
      expect(updated.data?.converted_booking_id).toBeNull()
      expect(updated.data?.status).toBe('Active')

      // Saving a provisional draft must not silently create a confirmed booking.
      checkpoint('Verify no confirmed booking')
      const bookings = await owner.from('bookings').select('id,stage').eq('client_uuid', first.data!.booking_client_uuid)
      expect(bookings.error?.code ?? null).toBeNull()
      expect(bookings.data).toEqual([])
      checkpoint('Reload revised draft')
      await page.reload()
      await expect(field).toHaveValue(revised, { timeout: 30_000 })
    } finally {
      checkpoint('Release API session only')
      await owner.auth.signOut({ scope: 'local' })
    }
  })
})
