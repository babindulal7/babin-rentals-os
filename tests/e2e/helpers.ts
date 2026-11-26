import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, type Locator, type Page } from '@playwright/test'
import { STAGING_URL } from './staging-guard.mjs'

export type E2ERole = 'OWNER' | 'MANAGER' | 'STAFF'

const DISPOSABLE_API = 'http://127.0.0.1:54321'

export function isDisposableCi(): boolean {
  return process.env.BABIN_E2E_DISPOSABLE === '1'
    && process.env.GITHUB_ACTIONS === 'true'
    && process.env.RUNNER_ENVIRONMENT === 'github-hosted'
    && process.env.RUNNER_OS === 'Linux'
    && process.env.E2E_LOCAL_URL === DISPOSABLE_API
}

export function e2eApiTarget(): { url: string; anonKey: string } {
  if (isDisposableCi()) {
    const anonKey = process.env.E2E_LOCAL_ANON_KEY
    if (!anonKey) throw new Error('E2E_LOCAL_ANON_KEY is required in disposable CI')
    return { url: DISPOSABLE_API, anonKey }
  }
  const url = process.env.BABIN_STAGING_SUPABASE_URL
  const anonKey = process.env.BABIN_STAGING_ANON_KEY
  if (!url || !anonKey || (url !== STAGING_URL && url !== STAGING_URL + '/')) {
    throw new Error('Explicit staging URL and public key are required')
  }
  return { url: STAGING_URL, anonKey }
}

/** Credentials for a role, or null when not configured. Never logged. */
export function e2eCredentialsFor(role: E2ERole): { email: string; password: string } | null {
  const email = process.env[`E2E_${role}_EMAIL`]
  const password = process.env[`E2E_${role}_PASSWORD`]
  if (!email || !password) return null
  if (isDisposableCi() && (!email.startsWith('disposable-') || !email.endsWith('@example.test'))) {
    throw new Error(`Disposable CI requires synthetic ${role} credentials`)
  }
  return { email, password }
}

export async function createAuthenticatedApiClient(role: E2ERole): Promise<SupabaseClient> {
  const creds = e2eCredentialsFor(role)
  if (!creds) throw new Error(`E2E_${role}_EMAIL / E2E_${role}_PASSWORD not set`)
  const { url, anonKey } = e2eApiTarget()
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        const timeout = AbortSignal.timeout(15_000)
        return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout })
      },
    },
  })
  const auth = await client.auth.signInWithPassword(creds)
  expect(auth.error).toBeNull()
  expect(auth.data.session).not.toBeNull()
  return client
}

export async function signInAs(page: Page, role: E2ERole): Promise<void> {
  const creds = e2eCredentialsFor(role)
  if (!creds) throw new Error(`E2E_${role}_EMAIL / E2E_${role}_PASSWORD not set`)
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(creds.email)
  await page.locator('input[type="password"]').fill(creds.password)
  await page.locator('button[type="submit"]').first().click()
  await expect(page).toHaveURL(/\/today(?:[/?#]|$)/, { timeout: 30_000 })
  await dismissOnboarding(page)
}

export async function dismissOnboarding(page: Page): Promise<void> {
  const welcome = page.getByRole('dialog', { name: 'Welcome to Babin Rentals OS', exact: true })
  await welcome.waitFor({ state: 'visible', timeout: 4_000 }).catch(() => {})
  if ((await welcome.count()) === 0) return
  const skip = welcome.getByRole('button', { name: 'Skip', exact: true }).filter({ visible: true }).first()
  if ((await skip.count()) > 0) {
    await skip.click()
  } else {
    await welcome.getByRole('button', { name: 'Close', exact: true }).filter({ visible: true }).first().click()
  }
  await expect(welcome).toHaveCount(0)
}

export async function syntheticJpegBuffer(page: Page): Promise<Buffer> {
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 96
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#777'
    ctx.fillRect(0, 0, 96, 96)
    return canvas.toDataURL('image/jpeg').split(',')[1]!
  })
  return Buffer.from(jpeg, 'base64')
}

export async function signOnGlassTyped(
  popup: Locator,
  page: Page,
  signatureRoleLabel: 'Receiver' | 'Warehouse Staff',
  signerName: string,
): Promise<void> {
  const row = popup.locator(`[data-operation-signature="${signatureRoleLabel}"]`)
  await row.getByRole('button', { name: 'Sign on Glass', exact: true }).click()
  const signDialog = page.getByRole('dialog', { name: /Digital Sign-on-Glass/ }).last()
  await expect(signDialog).toBeVisible({ timeout: 15_000 })
  await signDialog.getByRole('tab', { name: /Type Legal Signature/ }).click()
  const nameInput = signDialog.getByLabel('Signer Legal Full Name', { exact: true })
  await nameInput.fill(signerName)
  await signDialog.getByRole('button', { name: /Accept & Sign/ }).click()
  await expect(signDialog).toBeHidden({ timeout: 30_000 })
}
