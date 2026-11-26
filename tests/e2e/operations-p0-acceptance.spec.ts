import { randomUUID } from 'node:crypto'
import { test, expect } from './fixture'
import {
  createAuthenticatedApiClient,
  e2eCredentialsFor,
  isDisposableCi,
  signInAs,
  signOnGlassTyped,
  syntheticJpegBuffer,
} from './helpers'

const disposable = isDisposableCi()
const stagingFixturesEnabled = process.env.E2E_STAGING_FIXTURE_ALLOW === '1'
const runMutatingOps = disposable || stagingFixturesEnabled

function deviceFixture(prefix: 'RETRY' | 'HELD' | 'RETURN', projectName: string): { id: string; no: string } | null {
  const key = `E2E_OPS_${prefix}_${projectName.toUpperCase()}`
  const id = process.env[`${key}_ID`]
  const no = process.env[`${key}_NO`]
  if (!id || !no) return null
  return { id, no }
}

test.describe('Operations P0 acceptance: cancel/close, failure recovery, held stage and partial return', () => {
  test.skip(!runMutatingOps, 'Isolated synthetic operations fixtures required (disposable CI or explicit E2E_STAGING_FIXTURE_ALLOW=1)')

  test('Cancel/close discards dirty work without writes, and read/write failure recovery unlocks cleanly', async ({ page }, testInfo) => {
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(30_000)
    const fixture = deviceFixture('RETRY', testInfo.project.name)
    if (!fixture) throw new Error(`Missing RETRY fixture for project ${testInfo.project.name}`)

    const api = await createAuthenticatedApiClient('OWNER')
    const stage = async () => {
      const res = await api.from('bookings').select('stage').eq('id', fixture.id).single()
      expect(res.error).toBeNull()
      return res.data?.stage
    }
    const packSessions = async () => {
      const res = await api.from('operation_sessions').select('id,state').eq('booking_id', fixture.id).eq('operation', 'Packing')
      expect(res.error).toBeNull()
      return res.data ?? []
    }
    const packTransitions = async () => {
      const res = await api.from('booking_stage_transitions').select('id').eq('booking_id', fixture.id).eq('from_stage', 'Booked').eq('to_stage', 'Packed')
      expect(res.error).toBeNull()
      return res.data ?? []
    }
    const packLines = async (sessionIds: string[]) => {
      if (sessionIds.length === 0) return []
      const res = await api.from('packing_lines').select('id,state').in('session_id', sessionIds)
      expect(res.error).toBeNull()
      return res.data ?? []
    }

    try {
      expect(await stage()).toBe('Booked')
      expect(await packSessions()).toHaveLength(0)

      await signInAs(page, 'OWNER')
      await page.goto('/rentals/' + encodeURIComponent(fixture.no))

      // 1. Dirty Cancel / Close: Discard Changes clears marks and writes nothing.
      const opener = page.getByRole('button', { name: 'Start Packing', exact: true }).filter({ visible: true }).first()
      await expect(opener).toBeEnabled({ timeout: 30_000 })
      await opener.click()
      const popup = page.getByRole('dialog', { name: /^Operations ·/ })
      await expect(popup).toBeVisible({ timeout: 30_000 })

      const notes = popup.getByRole('textbox', { name: 'Packing session notes', exact: true })
      await notes.fill('Discard verification note')
      await popup.getByRole('button', { name: 'Mark Pending Packed', exact: true }).click()
      await popup.getByRole('group', { name: 'Browse operation stages' }).getByRole('button', { name: 'Close', exact: true }).click()

      const discardDialog = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: 'Discard unsaved operations work?', exact: true })).filter({ visible: true }).last()
      await expect(discardDialog.getByRole('button', { name: 'Discard Changes', exact: true })).toBeVisible()
      await discardDialog.getByRole('button', { name: 'Discard Changes', exact: true }).click()
      await expect(popup).toHaveCount(0)
      expect(await stage()).toBe('Booked')
      expect(await packSessions()).toHaveLength(0)

      // 2. Network failure on initial floor read shows Retry booking status and recovers.
      let failBookingsRead = true
      await page.route('**/rest/v1/bookings**', async (route) => {
        if (failBookingsRead && route.request().method() === 'GET') {
          await route.abort('failed')
          return
        }
        await route.continue()
      })
      await opener.click()
      await expect(popup).toBeVisible({ timeout: 30_000 })
      const retryReadBtn = popup.getByRole('button', { name: 'Retry booking status', exact: true })
      await expect(retryReadBtn).toBeVisible({ timeout: 20_000 })
      failBookingsRead = false
      await page.unroute('**/rest/v1/bookings**')
      await retryReadBtn.click()
      const workspaceRetryBtn = popup.getByRole('button', { name: 'Retry', exact: true })
      if ((await workspaceRetryBtn.count()) > 0) {
        await workspaceRetryBtn.first().click()
      }
      await expect(popup.getByRole('button', { name: 'Mark Pending Packed', exact: true })).toBeEnabled({ timeout: 30_000 })

      // 3. Repeat identical failure on Confirm does not get stuck in Saving… or duplicate rows.
      await popup.getByRole('button', { name: 'Mark Pending Packed', exact: true }).click()
      await popup.locator('#pack-evidence input[type="file"]').setInputFiles({
        name: 'retry-packing.jpg',
        mimeType: 'image/jpeg',
        buffer: await syntheticJpegBuffer(page),
      })
      const confirm = popup.getByRole('button', { name: 'Confirm Packing & Next', exact: true })
      await expect(confirm).toBeEnabled({ timeout: 30_000 })

      // Uploading evidence initialized the single In Progress Packing session;
      // fail the packing_lines write twice on Confirm to verify lock release and zero duplicates.
      const preConfirmSessions = await packSessions()
      expect(preConfirmSessions).toHaveLength(1)
      expect(preConfirmSessions[0]?.state).toBe('In Progress')

      let remainingFailures = 2
      await page.route('**/rest/v1/packing_lines**', async (route) => {
        if (route.request().method() === 'POST' && remainingFailures > 0) {
          remainingFailures -= 1
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Simulated transient packing line write failure' }),
          })
          return
        }
        await route.continue()
      })

      for (const attempt of [1, 2]) {
        await confirm.click()
        await expect(popup.getByText('Packing was not recorded', { exact: false })).toBeVisible({ timeout: 20_000 })
        // Lock must clear back to Confirm Packing & Next after each failure.
        await expect(confirm).toBeEnabled({ timeout: 20_000 })
        expect(await stage(), `Stage unchanged after failure #${attempt}`).toBe('Booked')
        const sessionsAfterFail = await packSessions()
        expect(sessionsAfterFail, `No duplicate sessions after failure #${attempt}`).toHaveLength(1)
        expect(sessionsAfterFail[0]?.state).toBe('In Progress')
        expect(await packLines(sessionsAfterFail.map((s) => s.id)), `Zero packing lines after failure #${attempt}`).toHaveLength(0)
        expect(await packTransitions(), `Zero transitions after failure #${attempt}`).toHaveLength(0)
      }

      await page.unroute('**/rest/v1/packing_lines**')
      await confirm.click()
      await expect.poll(stage, { timeout: 30_000 }).toBe('Packed')
      await expect(popup.getByRole('navigation', { name: 'Operation stage' }).locator('[aria-current="step"]')).toHaveAccessibleName(/^Handover ·/, { timeout: 30_000 })
      const finalSessions = await packSessions()
      expect(finalSessions).toHaveLength(1)
      expect(finalSessions[0]?.state).toBe('Completed')
      expect(await packTransitions()).toHaveLength(1)
    } finally {
      await api.auth.signOut({ scope: 'local' })
    }
  })

  test('Confirm held: partial Handover records session without false advance and stays recoverable', async ({ page }, testInfo) => {
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(30_000)
    const fixture = deviceFixture('HELD', testInfo.project.name)
    if (!fixture) throw new Error(`Missing HELD fixture for project ${testInfo.project.name}`)

    const api = await createAuthenticatedApiClient('OWNER')
    const stage = async () => {
      const res = await api.from('bookings').select('stage').eq('id', fixture.id).single()
      expect(res.error).toBeNull()
      return res.data?.stage
    }
    const handoverSessions = async () => {
      const res = await api.from('operation_sessions').select('id,state').eq('booking_id', fixture.id).eq('operation', 'Handover')
      expect(res.error).toBeNull()
      return res.data ?? []
    }

    try {
      expect(await stage()).toBe('Packed')

      await signInAs(page, 'OWNER')
      await page.goto('/rentals/' + encodeURIComponent(fixture.no))
      const opener = page.getByRole('button', { name: 'Handover', exact: true }).filter({ visible: true }).first()
      await expect(opener).toBeEnabled({ timeout: 30_000 })
      await opener.click()

      const popup = page.getByRole('dialog', { name: /^Operations ·/ })
      await expect(popup).toBeVisible({ timeout: 30_000 })
      await expect(popup.getByRole('checkbox', { name: 'Booking Authorization Verified', exact: true })).toBeChecked({ timeout: 20_000 })
      await popup.getByRole('checkbox', { name: 'Government ID Verified', exact: true }).check()

      // Mark only the first of two lines Picked Up so the second line holds the stage at Packed.
      await popup.getByRole('checkbox', { name: 'Mark Disposable Operations Cable picked up', exact: true }).check()

      // Clear Payment Verified and Deposit Received gates (Owner is money-sighted).
      const markCleared = popup.getByRole('button', { name: 'Mark Cleared →', exact: true })
      while ((await markCleared.count()) > 0) {
        await markCleared.first().click()
      }

      await signOnGlassTyped(popup, page, 'Receiver', 'Disposable Client Rep')
      await signOnGlassTyped(popup, page, 'Warehouse Staff', 'Disposable Owner')

      await popup.locator('#handover-evidence input[type="file"]').setInputFiles({
        name: 'handover-held.jpg',
        mimeType: 'image/jpeg',
        buffer: await syntheticJpegBuffer(page),
      })

      const confirm = popup.getByRole('button', { name: 'Confirm Handover & Next', exact: true })
      await expect(confirm).toBeEnabled({ timeout: 30_000 })
      await confirm.click()

      // Stage must stay Packed, showing the held notice and keeping Return & Inspection locked.
      await expect(popup.getByText(`Session recorded — ${fixture.no} stays Packed`, { exact: true })).toBeVisible({ timeout: 30_000 })
      await expect(popup.getByRole('navigation', { name: 'Operation stage' }).locator('[aria-current="step"]')).toHaveAccessibleName(/^Handover ·/)
      await expect(popup.getByRole('group', { name: 'Browse operation stages' }).getByRole('button', { name: 'Next stage: Return & Inspection', exact: true })).toBeDisabled()
      expect(await stage()).toBe('Packed')
      expect(await handoverSessions()).toHaveLength(1)

      // Navigation and reload recover cleanly on the still-Packed booking.
      await popup.getByRole('group', { name: 'Browse operation stages' }).getByRole('button', { name: /Packing/ }).click()
      await expect(popup.getByRole('navigation', { name: 'Operation stage' }).locator('[aria-current="step"]')).toHaveAccessibleName(/^Packing ·/)
      await popup.getByRole('group', { name: 'Browse operation stages' }).getByRole('button', { name: 'Close', exact: true }).click()
      await expect(popup).toHaveCount(0)

      await page.reload()
      await expect(opener).toBeVisible({ timeout: 30_000 })
      expect(await stage()).toBe('Packed')
    } finally {
      await api.auth.signOut({ scope: 'local' })
    }
  })

  test('Partial return persists returned quantity, stays On Rent, and second session completes Return', async ({ page }, testInfo) => {
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(30_000)
    const fixture = deviceFixture('RETURN', testInfo.project.name)
    if (!fixture) throw new Error(`Missing RETURN fixture for project ${testInfo.project.name}`)

    const api = await createAuthenticatedApiClient('OWNER')
    const stage = async () => {
      const res = await api.from('bookings').select('stage').eq('id', fixture.id).single()
      expect(res.error).toBeNull()
      return res.data?.stage
    }
    const returnSessions = async () => {
      const res = await api.from('operation_sessions').select('id,state').eq('booking_id', fixture.id).eq('operation', 'Return')
      expect(res.error).toBeNull()
      return res.data ?? []
    }

    try {
      expect(await stage()).toBe('On Rent')

      await signInAs(page, 'OWNER')
      await page.goto('/rentals/' + encodeURIComponent(fixture.no))
      const opener = page.getByRole('button', { name: 'Return & Inspect', exact: true }).filter({ visible: true }).first()
      await expect(opener).toBeEnabled({ timeout: 30_000 })
      await opener.click()

      const popup = page.getByRole('dialog', { name: /^Operations ·/ })
      await expect(popup).toBeVisible({ timeout: 30_000 })
      await expect(popup.getByText('Previously received: 0 · Remaining: 2 of 2', { exact: false })).toBeVisible({ timeout: 30_000 })

      // Session 1: receive 1 of 2 units.
      await popup.getByRole('button', { name: 'Mark Returned', exact: true }).filter({ visible: true }).first().click()
      const qtyInput = popup.getByRole('spinbutton', { name: /Received quantity for/ }).filter({ visible: true }).first()
      await qtyInput.fill('1')
      await popup.getByRole('radio', { name: 'Good', exact: true }).filter({ visible: true }).first().click()

      const confirmReturn = popup.getByRole('button', { name: 'Confirm Return session', exact: true })
      await expect(confirmReturn).toBeEnabled({ timeout: 20_000 })
      await confirmReturn.click()

      // Must stay On Rent and remain on Return & Inspection with updated verified quantity.
      await expect.poll(async () => (await returnSessions()).length, { timeout: 30_000 }).toBe(1)
      expect(await stage()).toBe('On Rent')
      await expect(popup.getByRole('navigation', { name: 'Operation stage' }).locator('[aria-current="step"]')).toHaveAccessibleName(/^Return & Inspection ·/, { timeout: 30_000 })
      await expect(popup.getByText('Previously received: 1 · Remaining: 1 of 2', { exact: false })).toBeVisible({ timeout: 30_000 })

      // Reload verifies authoritative persistence of partial return.
      await page.reload()
      await expect(opener).toBeVisible({ timeout: 30_000 })
      await opener.click()
      await expect(popup.getByText('Previously received: 1 · Remaining: 1 of 2', { exact: false })).toBeVisible({ timeout: 30_000 })

      // Session 2: receive remaining 1 unit -> booking transitions to Returned and advances to Reset.
      await popup.getByRole('button', { name: 'Mark Returned', exact: true }).filter({ visible: true }).first().click()
      const qtyInput2 = popup.getByRole('spinbutton', { name: /Received quantity for/ }).filter({ visible: true }).first()
      await expect(qtyInput2).toHaveValue('1')
      await popup.getByRole('radio', { name: 'Good', exact: true }).filter({ visible: true }).first().click()
      await expect(confirmReturn).toBeEnabled({ timeout: 20_000 })
      await confirmReturn.click()

      await expect.poll(stage, { timeout: 30_000 }).toBe('Returned')
      await expect(popup.getByRole('navigation', { name: 'Operation stage' }).locator('[aria-current="step"]')).toHaveAccessibleName(/^Cleaning & Reset ·/, { timeout: 30_000 })
      expect(await returnSessions()).toHaveLength(2)
    } finally {
      await api.auth.signOut({ scope: 'local' })
    }
  })
})

test.describe('Role restrictions: UI and API/database denial for Warehouse', () => {
  const hasStaff = Boolean(e2eCredentialsFor('STAFF'))
  const bookedNo = process.env.E2E_OPS_BOOKED_NO
  const packedNo = process.env.E2E_OPS_PACKED_NO

  test.skip(!hasStaff || !bookedNo || !packedNo, 'Dedicated Warehouse credentials and read-only Ops bookings required')

  test('Warehouse is money-blind on floor workspaces and denied financial/privilege writes in UI and database', async ({ page }) => {
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(30_000)

    const staff = await createAuthenticatedApiClient('STAFF')
    try {
      // 1. Database/API boundary denials for Warehouse.
      const canMoney = await staff.rpc('auth_can_view_money')
      expect(canMoney.error).toBeNull()
      expect(canMoney.data).toBe(false)

      for (const table of ['payments', 'invoices', 'expenses', 'security_deposits'] as const) {
        const res = await staff.from(table).select('id').limit(5)
        expect(res.data ?? [], `Warehouse must see zero rows in ${table}`).toHaveLength(0)
        if (res.error) expect(res.error.code).toBe('42501')
      }

      const roleMutation = await staff.rpc('set_staff_role', { p_user_id: randomUUID(), p_role: 'Owner' })
      expect(roleMutation.data).toBeNull()
      expect(roleMutation.error).not.toBeNull()

      // 2. UI restrictions & Law 6 floor money blindness.
      await signInAs(page, 'STAFF')
      await page.goto('/rentals/' + encodeURIComponent(packedNo!))
      const opener = page.getByRole('button', { name: 'Handover', exact: true }).filter({ visible: true }).first()
      await expect(opener).toBeEnabled({ timeout: 30_000 })
      await opener.click()

      const popup = page.getByRole('dialog', { name: /^Operations ·/ })
      await expect(popup).toBeVisible({ timeout: 30_000 })
      const text = await popup.innerText()
      expect(text, 'Floor workspace must expose zero rupee symbols or NPR amounts').not.toMatch(/रू|NPR|\bRs\.?\s*\d/i)

      // Money gates must remain disabled for Warehouse.
      const clearMoneyBtn = popup.getByRole('button', { name: 'Mark Cleared →', exact: true })
      const count = await clearMoneyBtn.count()
      expect(count).toBeGreaterThan(0)
      for (let i = 0; i < count; i++) {
        await expect(clearMoneyBtn.nth(i)).toBeDisabled()
      }

      await popup.getByRole('group', { name: 'Browse operation stages' }).getByRole('button', { name: 'Close', exact: true }).click()

      // Restricted financial routes show honest denial in UI.
      await page.goto('/finance')
      await expect(page.getByText(/access restricted/i).first()).toBeVisible({ timeout: 30_000 })
      await page.goto('/settings')
      await expect(page.getByText(/access restricted/i).first()).toBeVisible({ timeout: 30_000 })
    } finally {
      await staff.auth.signOut({ scope: 'local' })
    }
  })
})
