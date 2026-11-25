import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from './fixture'

const API = 'http://127.0.0.1:54321'
const disposable = process.env.BABIN_E2E_DISPOSABLE === '1'
  && process.env.GITHUB_ACTIONS === 'true'
  && process.env.RUNNER_ENVIRONMENT === 'github-hosted'
  && process.env.RUNNER_OS === 'Linux'
  && process.env.E2E_LOCAL_URL === API

test.describe('Disposable expense persistence and access control', () => {
  test.skip(!disposable, 'Writes are allowed only in the isolated CI database')

  const creds = (role: 'OWNER' | 'STAFF') => {
    const email = process.env['E2E_' + role + '_EMAIL']
    const password = process.env['E2E_' + role + '_PASSWORD']
    if (!disposable || !email || !password || !email.endsWith('@example.test') || !email.startsWith('disposable-')) {
      throw new Error('Disposable synthetic credentials required')
    }
    return { email, password }
  }

  async function apiSession(role: 'OWNER' | 'STAFF') {
    const key = process.env.E2E_LOCAL_ANON_KEY
    if (!disposable || !key) throw new Error('Disposable public API key required')
    const client = createClient(API, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: {
      fetch: (input, init) => {
        const timeout = AbortSignal.timeout(15_000)
        return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout })
      },
    } })
    const { error, data } = await client.auth.signInWithPassword(creds(role))
    if (error || !data.session) throw new Error('Synthetic API sign-in failed: ' + role)
    return client
  }

  test('Owner saves one real expense draft, reads it after reload, and Warehouse cannot read it', async ({ page }, testInfo) => {
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(30_000)
    // Log fixed phase names only, never form values, IDs, tokens or URLs.
    const checkpoint = (phase: string) => console.log('[expense:' + testInfo.project.name + '] ' + phase)
    checkpoint('API authentication')
    const marker = 'E2E Expense ' + testInfo.project.name + ' ' + randomUUID().slice(0, 12)
    const owner = await apiSession('OWNER')
    const staff = await apiSession('STAFF')
    // Do not disable MFA or fabricate JWT claims if the money gate is armed.
    const money = await owner.rpc('auth_can_view_money')
    expect(money.error?.message ?? null).toBeNull()
    expect(money.data, 'Owner session must satisfy the actual money gate; if armed, enroll real synthetic MFA').toBe(true)
    const staffGate = await staff.rpc('auth_can_view_money')
    expect(staffGate.error?.message ?? null).toBeNull()
    expect(staffGate.data).toBe(false)

    checkpoint('Browser authentication')
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(creds('OWNER').email)
    await page.locator('input[type="password"]').fill(creds('OWNER').password)
    await page.locator('button[type="submit"]').first().click()
    await expect(page).toHaveURL(/\/today(?:[/?#]|$)/, { timeout: 30_000 })
    checkpoint('Complete first-run onboarding through the UI')
    const welcome = page.getByRole('dialog', { name: 'Welcome to Babin Rentals OS', exact: true })
    await expect(welcome).toBeVisible({ timeout: 15_000 })
    await welcome.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(welcome).toHaveCount(0)
    checkpoint('Open expense form')
    await page.goto('/finance?tab=expenses&create=expense')
    const dialog = page.getByRole('dialog', { name: 'Add Expense' })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(/\/finance\?tab=expenses$/)
    await expect(dialog).toHaveCount(1)
    const save = dialog.getByRole('button', { name: 'Save Draft', exact: true })
    await expect(save).toBeEnabled({ timeout: 30_000 })
    await save.click()
    await expect(dialog.getByText('This expense was not recorded')).toBeVisible()
    // The native selects are wrapped in labels containing option text.
    // Locate the actual visible controls by their unique placeholder options,
    // rather than requiring the implicit label's entire text to equal a word.
    checkpoint('Choose category and branch')
    for (const placeholder of ['Choose a category…', 'Choose a branch…']) {
      const control = dialog.locator('select').filter({
        has: page.locator('option[value=""]').filter({ hasText: placeholder }),
      })
      await expect(control).toHaveCount(1)
      await expect(control).toBeVisible()
      await expect(control).toBeEnabled()
      const options = control.locator('option:not([value=""]):not(:disabled)')
      await expect.poll(() => options.count()).toBeGreaterThan(0)
      const value = await options.first().getAttribute('value')
      if (!value) throw new Error('No usable expense lookup option: ' + placeholder)
      await control.selectOption(value)
      await expect(control).toHaveValue(value)
    }
    checkpoint('Fill expense fields')
    await dialog.getByLabel('Vendor', { exact: true }).fill(marker)
    await dialog.getByLabel('Description', { exact: true }).fill('Synthetic disposable CI expense')
    await dialog.locator('input[type="number"]').fill('1234')
    checkpoint('Save draft and close form')
    await save.click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })

    checkpoint('Read persisted expense')
    const read = () => owner.from('expenses').select('id,expense_no,status,amount,vendor_name').eq('vendor_name', marker)
    await expect.poll(async () => {
      const { data, error } = await read()
      if (error) throw new Error('Owner expense read failed: ' + error.code)
      return data?.length
    }).toBe(1)
    const { data: rows, error } = await read()
    expect(error?.message ?? null).toBeNull()
    expect(rows).toHaveLength(1)
    const row = rows![0]!
    expect(row.status).toBe('Draft')
    expect(Number(row.amount)).toBe(1234)
    expect(row.expense_no).toBeTruthy()

    checkpoint('Reload expense list')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Add Expense', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Add Expense' })).toHaveCount(0)
    checkpoint('Search persisted expense')
    const search = page.getByRole('group', { name: 'Filter by status', exact: true }).getByRole('searchbox', { name: 'Search expenses', exact: true })
    await expect(search).toBeVisible()
    await search.fill(marker)
    // Compact cards append the category to the vendor label.
    await expect(page.getByText(marker, { exact: false }).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(row.expense_no, { exact: true }).filter({ visible: true }).first()).toBeVisible()

    checkpoint('Verify Warehouse denial')
    const denied = await staff.from('expenses').select('id').eq('id', row.id)
    expect(denied.data ?? []).toHaveLength(0)
    if (denied.error) expect(denied.error.code).toBe('42501')
    checkpoint('Release API sessions only')
    await owner.auth.signOut({ scope: 'local' })
    await staff.auth.signOut({ scope: 'local' })
  })

  test('Warehouse cannot open finance through a direct URL', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(creds('STAFF').email)
    await page.locator('input[type="password"]').fill(creds('STAFF').password)
    await page.locator('button[type="submit"]').first().click()
    await expect(page).toHaveURL(/\/today(?:[/?#]|$)/, { timeout: 30_000 })
    await page.goto('/finance?tab=expenses&create=expense')
    await expect(page.getByText(/access restricted/i).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Add Expense', exact: true })).toHaveCount(0)
    await expect(page.getByRole('dialog', { name: 'Add Expense' })).toHaveCount(0)
  })
})
