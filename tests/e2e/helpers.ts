import { expect, type Page } from '@playwright/test'

export type E2ERole = 'OWNER' | 'MANAGER' | 'STAFF'

/** Credentials for a role, or null when the variables are not set. Never logged. */
export function credentialsFor(role: E2ERole): { email: string; password: string } | null {
  const email = process.env[`E2E_${role}_EMAIL`]
  const password = process.env[`E2E_${role}_PASSWORD`]
  return email && password ? { email, password } : null
}

/** Signs in through the real login form and waits until the app leaves /login. */
export async function signIn(page: Page, role: E2ERole): Promise<void> {
  const creds = credentialsFor(role)
  if (!creds) throw new Error(`E2E_${role}_EMAIL / E2E_${role}_PASSWORD not set`)
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(creds.email)
  await page.locator('input[type="password"]').fill(creds.password)
  await page.locator('button[type="submit"]').first().click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
  await dismissOnboarding(page)
}

/**
 * The first-run "Welcome to Babin Rentals OS" dialog can cover the app. On a
 * phone its Skip button sits below the fold, so fall back to the close control.
 */
export async function dismissOnboarding(page: Page): Promise<void> {
  // Match only visible copies: the text can also occur in hidden DOM nodes.
  const welcome = page.getByText('Welcome to Babin Rentals OS').filter({ visible: true })
  // The dialog can arrive after the data loads; give it a moment to appear.
  await welcome.first().waitFor({ state: 'visible', timeout: 4_000 }).catch(() => {})
  for (let attempt = 0; attempt < 2; attempt++) {
    if ((await welcome.count()) === 0) return
    const skip = page.getByRole('button', { name: 'Skip', exact: true }).filter({ visible: true }).first()
    if ((await skip.count()) > 0) {
      await skip.click().catch(() => {})
    } else {
      await page.getByRole('button', { name: 'Close', exact: true }).filter({ visible: true }).first().click().catch(() => {})
    }
    await welcome.first().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
  }
}
