import { test, expect } from './fixture'

const disposable = process.env.BABIN_E2E_DISPOSABLE === '1'
  && process.env.GITHUB_ACTIONS === 'true'
  && process.env.RUNNER_ENVIRONMENT === 'github-hosted'
  && process.env.RUNNER_OS === 'Linux'
  && process.env.E2E_LOCAL_URL === 'http://127.0.0.1:54321'

const surfaces = [
  { path: '/today', marker: 'Dispatch queues and next action' },
  { path: '/operations', marker: 'Operational queues' },
  { path: '/calendar', marker: 'Calendar view' },
  { path: '/inventory', marker: 'Inventory sections' },
  { path: '/clients', marker: 'Client sections' },
  { path: '/finance', marker: 'Finance sections' },
] as const

test.describe('Whole-app core navigation and recovery', () => {
  test.skip(!disposable, 'Disposable CI only')

  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(30_000)
    const email = process.env.E2E_OWNER_EMAIL
    const password = process.env.E2E_OWNER_PASSWORD
    if (!disposable || !email?.startsWith('disposable-') || !email.endsWith('@example.test') || !password) {
      throw new Error('Dedicated synthetic Owner required')
    }
    await test.step('Authenticate synthetic Owner', async () => {
      await page.goto('/login')
      await page.locator('input[type="email"]').fill(email)
      await page.locator('input[type="password"]').fill(password)
      await page.locator('button[type="submit"]').first().click()
      await expect(page).toHaveURL(/\/today(?:[/?#]|$)/, { timeout: 30_000 })
      const welcome = page.getByRole('dialog', { name: 'Welcome to Babin Rentals OS', exact: true })
      await expect(welcome).toBeVisible({ timeout: 15_000 })
      await welcome.getByRole('button', { name: 'Skip', exact: true }).click()
      await expect(welcome).toHaveCount(0)
    })
  })

  for (const surface of surfaces) {
    test(surface.path + ' mounts and recovers on reload', async ({ page }) => {
      const marker = () => page.getByLabel(surface.marker, { exact: true }).filter({ visible: true }).first()
      await test.step('Open canonical route and verify its actual module marker', async () => {
        await page.goto(surface.path)
        await expect(marker()).toBeVisible({ timeout: 30_000 })
        expect(new URL(page.url()).pathname).toBe(surface.path)
      })
      await test.step('Reload and verify the same module is usable', async () => {
        await page.reload()
        await expect(marker()).toBeVisible({ timeout: 30_000 })
        expect(new URL(page.url()).pathname).toBe(surface.path)
        await expect(page.getByText('This screen hit a system problem', { exact: true })).toHaveCount(0)
      })
    })
  }

  test('Settings section navigation stays reachable across viewport sizes', async ({ page }, testInfo) => {
    await page.goto('/settings')
    const verifyChooser = async () => {
      const width = await page.evaluate(() => window.innerWidth)
      const chooser = page.locator(width < 768 ? '.app-settings-mobile-list' : width < 1280 ? '.app-settings-tablet-tabs' : 'nav[aria-label="Settings sections"]')
      await expect(chooser).toBeVisible({ timeout: 30_000 })
      const controls = chooser.locator(width < 768 ? 'button.app-settings-mobile-row' : 'button')
      await expect(controls).toHaveCount(5)
      for (const control of await controls.all()) {
        await expect(control).toBeVisible()
        await expect(control).toBeEnabled()
        const rect = await control.boundingBox()
        expect(rect, 'Section control has a rendered target').not.toBeNull()
        expect(rect!.x).toBeGreaterThanOrEqual(-1)
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1)
        expect(rect!.height).toBeGreaterThanOrEqual(44)
      }
      if (width >= 768 && width < 1280) {
        expect(await chooser.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
      }
      return controls.last()
    }
    await verifyChooser()
    if (testInfo.project.name === 'ipad') {
      await page.setViewportSize({ width: 1194, height: 834 })
      await verifyChooser()
    }
    await (await verifyChooser()).click()
    await expect(page).toHaveURL(/[?&]tab=texts(?:&|$)/)
    await expect(page.getByText('This screen hit a system problem', { exact: true })).toHaveCount(0)
  })

  test('Rental status filters support independent selections and survive reload', async ({ page }) => {
    await page.goto('/rentals')
    const toggle = page.locator('button[aria-controls="rentals-filters"]').filter({ visible: true }).first()
    const drawer = page.locator('#rentals-filters')
    const booked = drawer.getByRole('checkbox', { name: 'Filter by status: Booked', exact: true })
    const packed = drawer.getByRole('checkbox', { name: 'Filter by status: Packed', exact: true })
    const stages = () => new URL(page.url()).searchParams.getAll('stage').sort()
    await expect(toggle).toBeVisible({ timeout: 30_000 })
    await toggle.click()
    await expect(booked).toBeVisible()
    await expect(booked).not.toBeChecked()
    await expect(packed).not.toBeChecked()
    await booked.check()
    await packed.check()
    await expect(booked).toBeChecked()
    await expect(packed).toBeChecked()
    await expect.poll(stages).toEqual(['Booked', 'Packed'])
    await page.reload()
    await expect(toggle).toBeVisible({ timeout: 30_000 })
    await toggle.click()
    await expect(booked).toBeChecked()
    await expect(packed).toBeChecked()
    await booked.uncheck()
    await expect(booked).not.toBeChecked()
    await expect(packed).toBeChecked()
    await expect.poll(stages).toEqual(['Packed'])
    await drawer.getByRole('button', { name: /^Clear all/i }).click()
    await expect.poll(stages).toEqual([])
    await expect(packed).not.toBeChecked()
    await expect(page.getByText('This screen hit a system problem', { exact: true })).toHaveCount(0)
  })

  test('Rentals opens the canonical New Rental form', async ({ page }) => {
    await test.step('Open Rentals list', async () => {
      await page.goto('/rentals')
    })
    await test.step('Click visible enabled New Rental control', async () => {
      const create = page.getByRole('button', { name: 'New Rental', exact: true }).filter({ visible: true }).first()
      await expect(create).toBeVisible({ timeout: 30_000 })
      await expect(create).toBeEnabled()
      await create.click({ timeout: 15_000 })
    })
    await test.step('Verify canonical creation route and form', async () => {
      await expect(page).toHaveURL(/\/rentals\?(?:[^#]*&)?action=new(?:&|$)/, { timeout: 30_000 })
      await expect(page.getByRole('textbox', { name: 'Project / production name', exact: true })).toBeVisible({ timeout: 30_000 })
    })
    // No mutation; draft persistence is covered independently.
  })
})
