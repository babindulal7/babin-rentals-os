import { defineConfig, devices } from '@playwright/test'
import { requirePublicClientKey } from './scripts/local-api-guard.mjs'

const localUrl = 'http://127.0.0.1:54321'
if (process.env.BABIN_E2E_DISPOSABLE !== '1' || process.env.E2E_LOCAL_URL !== localUrl || process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Disposable E2E requires the isolated GitHub-hosted local Supabase stack.')
}
const key = requirePublicClientKey(process.env.E2E_LOCAL_ANON_KEY)
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:4179',
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://localhost:4179',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: localUrl,
      VITE_SUPABASE_ANON_KEY: key,
      VITE_DATA_SOURCE: 'live',
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
