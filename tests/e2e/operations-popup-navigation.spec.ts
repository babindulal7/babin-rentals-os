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
          // Wait for real client facts to hydrate before browsing. A clean
          // session must stay clean even after its default collector loads.
          await expect(popup.getByRole('checkbox', { name: 'Booking Authorization Verified', exact: true })).toBeChecked()
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

test.describe('Operations packing confirmation and duplicate-submit protection', () => {
  test.skip(!disposable, 'Synthetic local CI only')
  for (const partial of [false, true]) test(partial ? 'partial pickup finishes in two sessions without dispatching a quantity line twice' : 'packing and handover persist once, with evidence, signatures and discard protection', async ({ page }, testInfo) => {
    test.setTimeout(partial ? 300_000 : 180_000)
    const email = process.env.E2E_OWNER_EMAIL
    const password = process.env.E2E_OWNER_PASSWORD
    const key = process.env.E2E_LOCAL_ANON_KEY
    const prefix = 'E2E_OPS_' + (partial ? 'PARTIAL_' : 'CONFIRM_') + testInfo.project.name.toUpperCase()
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

      // Start Handover from the real persisted Packed record, never from a
      // fabricated On Rent snapshot or a privileged browser session.
      const handoverSessions = async () => {
        const result = await api.from('operation_sessions').select('id,state,government_id_verified,booking_authorization_verified').eq('booking_id', id).eq('operation', 'Handover')
        expect(result.error).toBeNull()
        return result.data ?? []
      }
      const reservations = async () => {
        const result = await api.from('inventory_reservations').select('id,booking_line_id,qty,released_at').eq('booking_id', id).order('id')
        expect(result.error).toBeNull()
        return result.data ?? []
      }
      const before = partial ? await reservations() : []
      if (partial) {
        expect(before).toHaveLength(2)
        expect(before.every(row => row.released_at === null && Number(row.qty) === 1)).toBe(true)
      }
      expect(await handoverSessions()).toHaveLength(0)
      await page.getByRole('button', { name: 'Handover', exact: true }).filter({ visible: true }).first().click()
      const handover = popup.getByRole('button', { name: 'Confirm Handover & Next', exact: true })
      await expect(handover).toBeDisabled()
      await expect(popup.getByRole('checkbox', { name: 'Booking Authorization Verified', exact: true })).toBeChecked()
      await popup.getByRole('checkbox', { name: 'Government ID Verified', exact: true }).check()
      if (partial) {
        const cable = popup.getByRole('checkbox', { name: 'Mark Disposable Operations Cable picked up', exact: true })
        const stand = popup.getByRole('checkbox', { name: 'Mark Disposable Operations Stand picked up', exact: true })
        console.log('[partial:' + testInfo.project.name + '] Verify individual pickup controls')
        await expect(cable).toBeEnabled()
        await expect(cable).not.toBeChecked()
        await expect(stand).not.toBeChecked()
        // Use a bounded real pointer action and assert the controlled state
        // separately, rather than allowing locator.check to consume the entire
        // test budget after the click. Do not force, retry, or bypass selection.
        await cable.click({ timeout: 10_000 })
        console.log('[partial:' + testInfo.project.name + '] Individual pickup click returned')
        await expect(cable).toBeChecked({ timeout: 10_000 })
        await expect(stand).not.toBeChecked()
        console.log('[partial:' + testInfo.project.name + '] Individual selection verified')
      } else {
        await popup.getByRole('button', { name: 'Mark Ready Picked Up', exact: true }).click()
      }
      for (const gate of [3, 4]) {
        const row = popup.locator('[data-operation-gate="' + gate + '"]')
        await row.getByRole('button', { name: 'Mark Cleared →', exact: true }).click()
        await expect(row).toHaveClass(/is-pass/)
      }
      await expect(handover).toBeDisabled()
      expect(await stage()).toBe('Packed')
      expect(await handoverSessions()).toHaveLength(0)

      // Use the existing digital attestation flow, including real evidence
      // upload, for two synthetic signers. No actual client identity is used.
      for (const [role, signer] of [['Receiver', 'Disposable Test Receiver'], ['Warehouse Staff', 'Disposable Test Dispatcher']]) {
        await popup.locator('[data-operation-signature="' + role + '"]').getByRole('button', { name: 'Sign on Glass', exact: true }).click()
        const signature = page.getByRole('dialog', { name: /^Digital Sign-on-Glass/ })
        await expect(signature).toBeVisible()
        await signature.getByRole('tab', { name: /Type Legal Signature/ }).click()
        await signature.getByRole('textbox', { name: 'Signer Legal Full Name' }).fill(signer)
        if (role === 'Receiver') await signature.getByRole('checkbox', { name: /Verify Government Photo ID/ }).check()
        await signature.getByRole('checkbox', { name: /I acknowledge and accept this digital signature/ }).check()
        await signature.getByRole('button', { name: 'Accept & Sign Handover', exact: true }).click()
        await expect(signature).toHaveCount(0, { timeout: 30_000 })
      }
      await expect(handover).toBeEnabled({ timeout: 30_000 })
      await handover.click({ clickCount: 2 })
      if (partial) {
        await expect(popup.getByText(/Session recorded — .* stays Packed/)).toBeVisible({ timeout: 30_000 })
        expect(await stage()).toBe('Packed')
      } else {
        await expect.poll(stage, { timeout: 30_000 }).toBe('On Rent')
      }
      await expect.poll(async () => (await handoverSessions()).map(s => s.state), { timeout: 30_000 }).toEqual(['Completed'])
      const receipt = (await handoverSessions())[0]!
      expect(receipt.government_id_verified).toBe(true)
      expect(receipt.booking_authorization_verified).toBe(true)
      const signatures = await api.from('signatures').select('signature_role,signature_evidence_file_id').eq('session_id', receipt.id)
      expect(signatures.error).toBeNull()
      expect(signatures.data?.map(s => s.signature_role).sort()).toEqual(['Receiver', 'Warehouse staff'])
      expect(signatures.data?.every(s => Boolean(s.signature_evidence_file_id))).toBe(true)
      const movements = await api.from('session_line_movements').select('qty,resulting_item_state').eq('session_id', receipt.id)
      expect(movements.error).toBeNull()
      expect(movements.data?.length).toBeGreaterThan(0)
      expect(movements.data?.every(m => m.resulting_item_state === 'Picked Up')).toBe(true)
      expect(movements.data?.reduce((sum, m) => sum + Number(m.qty), 0)).toBe(partial ? 1 : 2)
      if (partial) {
        const lines = await api.from('booking_lines').select('id,description').eq('booking_id', id)
        expect(lines.error).toBeNull()
        const picked = lines.data?.find(l => l.description === 'Disposable Operations Cable')
        expect(picked).toBeDefined()
        const moved = await api.from('session_line_movements').select('booking_line_id').eq('session_id', receipt.id)
        expect(moved.error).toBeNull()
        expect(moved.data?.every(m => m.booking_line_id === picked?.id)).toBe(true)
        expect(await reservations()).toEqual(before)
      }
      const handoverTransitions = await api.from('booking_stage_transitions').select('id').eq('booking_id', id).eq('from_stage', 'Packed').eq('to_stage', 'On Rent')
      expect(handoverTransitions.error).toBeNull()
      expect(handoverTransitions.data).toHaveLength(partial ? 0 : 1)
      await page.reload()
      expect(await stage()).toBe(partial ? 'Packed' : 'On Rent')
      if (partial) expect(await reservations()).toEqual(before)
      expect(await handoverSessions()).toHaveLength(1)
      expect(await sessions()).toHaveLength(1)
      // Reloaded, persisted partial pickup must not offer an already dispatched
      // quantity line again. Finish only the remaining item and reconcile both receipts.
      if (partial) {
        await page.getByRole('button', { name: 'Handover', exact: true }).filter({ visible: true }).first().click()
        await expect(popup.getByRole('checkbox', { name: 'Booking Authorization Verified', exact: true })).toBeChecked()
        const pickedBefore = popup.getByRole('checkbox', { name: 'Mark Disposable Operations Cable picked up', exact: true })
        const remaining = popup.getByRole('checkbox', { name: 'Mark Disposable Operations Stand picked up', exact: true })
        await expect(remaining).toBeEnabled({ timeout: 30_000 })
        await expect(remaining).not.toBeChecked()
        await expect(pickedBefore).toBeDisabled()
        await expect(pickedBefore).toBeChecked()
        await popup.getByRole('checkbox', { name: 'Government ID Verified', exact: true }).check()
        await popup.getByRole('button', { name: 'Mark Ready Picked Up', exact: true }).click()
        await expect(remaining).toBeChecked()
        await expect(pickedBefore).toBeDisabled()
        for (const gate of [3, 4]) {
          const row = popup.locator('[data-operation-gate="' + gate + '"]')
          await row.getByRole('button', { name: 'Mark Cleared →', exact: true }).click()
          await expect(row).toHaveClass(/is-pass/)
        }
        for (const [role, signer] of [['Receiver', 'Disposable Test Receiver'], ['Warehouse Staff', 'Disposable Test Dispatcher']]) {
          await popup.locator('[data-operation-signature="' + role + '"]').getByRole('button', { name: 'Sign on Glass', exact: true }).click()
          const signature = page.getByRole('dialog', { name: /^Digital Sign-on-Glass/ })
          await expect(signature).toBeVisible()
          await signature.getByRole('tab', { name: /Type Legal Signature/ }).click()
          await signature.getByRole('textbox', { name: 'Signer Legal Full Name' }).fill(signer)
          if (role === 'Receiver') await signature.getByRole('checkbox', { name: /Verify Government Photo ID/ }).check()
          await signature.getByRole('checkbox', { name: /I acknowledge and accept this digital signature/ }).check()
          await signature.getByRole('button', { name: 'Accept & Sign Handover', exact: true }).click()
          await expect(signature).toHaveCount(0, { timeout: 30_000 })
        }
        await expect(handover).toBeEnabled({ timeout: 30_000 })
        await handover.click({ clickCount: 2 })
        await expect.poll(stage, { timeout: 30_000 }).toBe('On Rent')
        await expect.poll(async () => (await handoverSessions()).map(s => s.state).sort(), { timeout: 30_000 }).toEqual(['Completed', 'Completed'])
        const completed = await handoverSessions()
        expect(new Set(completed.map(s => s.id)).size).toBe(2)
        expect(completed.some(s => s.id === receipt.id)).toBe(true)
        for (const session of completed) {
          const sigs = await api.from('signatures').select('signature_role,signature_evidence_file_id').eq('session_id', session.id)
          expect(sigs.error).toBeNull()
          expect(sigs.data?.map(s => s.signature_role).sort()).toEqual(['Receiver', 'Warehouse staff'])
          expect(sigs.data?.every(s => Boolean(s.signature_evidence_file_id))).toBe(true)
        }
        const lines = await api.from('booking_lines').select('id,description,qty').eq('booking_id', id)
        expect(lines.error).toBeNull()
        expect(lines.data).toHaveLength(2)
        const allMoves = await api.from('session_line_movements').select('session_id,booking_line_id,qty,resulting_item_state').in('session_id', completed.map(s => s.id))
        expect(allMoves.error).toBeNull()
        expect(allMoves.data).toHaveLength(2)
        for (const line of lines.data ?? []) {
          const matches = allMoves.data?.filter(m => m.booking_line_id === line.id) ?? []
          expect(matches).toHaveLength(1)
          expect(matches[0]?.resulting_item_state).toBe('Picked Up')
          expect(Number(matches[0]?.qty)).toBe(Number(line.qty))
          expect(matches[0]?.session_id === receipt.id).toBe(line.description === 'Disposable Operations Cable')
        }
        const finalTransitions = await api.from('booking_stage_transitions').select('id').eq('booking_id', id).eq('from_stage', 'Packed').eq('to_stage', 'On Rent')
        expect(finalTransitions.error).toBeNull()
        expect(finalTransitions.data).toHaveLength(1)
        await page.reload()
        expect(await stage()).toBe('On Rent')
        expect(await handoverSessions()).toHaveLength(2)
        expect(await reservations()).toEqual(before)
        expect(await sessions()).toHaveLength(1)
      }
    } finally {
      await api.auth.signOut({ scope: 'local' })
    }
  })
})
