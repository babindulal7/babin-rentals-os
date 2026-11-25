import { defineConfig, devices } from '@playwright/test'

/**
 * E2E runs against a LOCAL dev server whose Supabase backend is the STAGING
 * project. Production is never a valid target: the config refuses to start
 * unless the staging URL is supplied explicitly.
 *
 * Required env (names only; values live in your local .env.staging.local or CI secrets):
 *   BABIN_STAGING_SUPABASE_URL   e.g. https://<staging-ref>.supabase.co
 *   BABIN_STAGING_ANON_KEY       staging publishable/anon key
 * Optional (authenticated suites are skipped when absent):
 *   E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD
 *   E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD
 *   E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD
 */

// Load the gitignored staging env file, without overriding variables already set.
// Values are never logged.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const envFile = resolve(dirname(fileURLToPath(import.meta.url)), '.env.staging.local')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) {
      const key = t.slice(0, i).trim()
      const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
      if (process.env[key] === undefined) process.env[key] = val
    }
  }
}
if (!process.env.BABIN_STAGING_SUPABASE_URL) {
  process.env.BABIN_STAGING_SUPABASE_URL = 'https://klhmsrunqrdxjudyhnkm.supabase.co'
}

const stagingUrl = process.env.BABIN_STAGING_SUPABASE_URL
const stagingAnonKey = process.env.BABIN_STAGING_ANON_KEY

if (!stagingUrl || !stagingAnonKey) {
  throw new Error(
    'E2E refused to start: set BABIN_STAGING_SUPABASE_URL and BABIN_STAGING_ANON_KEY (staging only).',
  )
}
if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(stagingUrl)) {
  throw new Error('E2E refused to start: BABIN_STAGING_SUPABASE_URL must be a *.supabase.co project URL.')
}

const PORT = 3000
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
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: stagingUrl,
      VITE_SUPABASE_ANON_KEY: stagingAnonKey,
      VITE_DATA_SOURCE: 'supabase',
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
