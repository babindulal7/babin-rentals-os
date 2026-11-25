import { defineConfig, devices } from '@playwright/test'
import { assertStagingEnvironment } from './tests/e2e/staging-guard.mjs'

/**
 * E2E runs against a LOCAL dev server whose Supabase backend is the STAGING
 * project. Production is never a valid target: the config refuses to start
 * unless the staging URL is supplied explicitly.
 *
 * Required env (names only; values live in your local .env.staging.local or CI secrets):
 *   BABIN_STAGING_SUPABASE_URL   e.g. https://<staging-ref>.supabase.co
 *   BABIN_STAGING_ANON_KEY       staging publishable/anon key
 * Required in CI; optional only for local unauthenticated smoke runs:
 *   E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD
 *   E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD
 *   E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD
 */

const stagingUrl = process.env.BABIN_STAGING_SUPABASE_URL
const stagingAnonKey = process.env.BABIN_STAGING_ANON_KEY

assertStagingEnvironment(stagingUrl, stagingAnonKey)
if (!stagingUrl || !stagingAnonKey) throw new Error('Missing staging configuration.')

const PORT = 4179
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    serviceWorkers: 'block',
    trace: 'off', // Auth requests and form values may contain credentials.
    screenshot: 'off', // Enable only for sanitized, non-auth scenarios.
    video: 'off',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: stagingUrl,
      VITE_SUPABASE_ANON_KEY: stagingAnonKey,
      VITE_DATA_SOURCE: 'live',
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
