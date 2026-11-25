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

  test('Rentals opens the canonical New Rental form', async ({ page }) => {
    await test.step('Open Rentals and navigate to real creation form', async () => {
      await page.goto('/rentals')
      const create = page.getByRole('button', { name: 'New Rental', exact: true }).filter({ visible: true }).first()
      await expect(create).toBeVisible({ timeout: 30_000 })
      await create.click()
      await expect(page.getByRole('textbox', { name: 'Project / production name', exact: true })).toBeVisible({ timeout: 30_000 })
      await expect(page).toHaveURL(/\/rentals\?(?:[^#]*&)?action=new(?:&|$)/)
    })
    // No mutation; draft persistence is covered independently.
  })
})
