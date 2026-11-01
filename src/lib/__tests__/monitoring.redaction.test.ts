// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const RAW_TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

describe('redactSensitivePath (SEC-3)', () => {
  it('redacts the token segment of a rider link', async () => {
    const { redactSensitivePath } = await import('../monitoring')
    expect(redactSensitivePath(`/rider/${RAW_TOKEN}`)).toBe('/rider/[redacted]')
  })

  it('matches the prefix case-insensitively, as the router does', async () => {
    const { redactSensitivePath } = await import('../monitoring')
    expect(redactSensitivePath(`/RIDER/${RAW_TOKEN}`)).toBe('/RIDER/[redacted]')
    expect(redactSensitivePath('/Rider/not-hex-but-still-a-token')).toBe('/Rider/[redacted]')
  })

  it('keeps anything after the token', async () => {
    const { redactSensitivePath } = await import('../monitoring')
    expect(redactSensitivePath(`/rider/${RAW_TOKEN}/extra`)).toBe('/rider/[redacted]/extra')
  })

  it('redacts any other long hex segment, so a future bearer route is safe by default', async () => {
    const { redactSensitivePath } = await import('../monitoring')
    expect(redactSensitivePath(`/share/${RAW_TOKEN}`)).toBe('/share/[redacted]')
    expect(redactSensitivePath(`/x/${SHA256}`)).toBe('/x/[redacted]')
  })

  it('leaves ordinary routes and record ids readable', async () => {
    const { redactSensitivePath } = await import('../monitoring')
    expect(redactSensitivePath('/operations/delivery')).toBe('/operations/delivery')
    expect(redactSensitivePath('/rentals/3f2b1c9e-7a44-4d0e-9b1a-0c1d2e3f4a5b')).toBe(
      '/rentals/3f2b1c9e-7a44-4d0e-9b1a-0c1d2e3f4a5b',
    )
    expect(redactSensitivePath('/')).toBe('/')
    expect(redactSensitivePath('/rider')).toBe('/rider')
    expect(redactSensitivePath('/rider/')).toBe('/rider/')
  })
})

describe('captureError sends a redacted page path (SEC-3)', () => {
  let sent: string[]

  beforeEach(() => {
    vi.resetModules()
    sent = []
    vi.stubEnv('VITE_SENTRY_DSN', 'https://publickey@errors.example.test/42')
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body?: string }) => {
      sent.push(String(init?.body ?? ''))
      return new Response('ok')
    }))
    // Force the fetch path so the body is plain text the test can read.
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: () => false })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    window.history.pushState({}, '', '/')
  })

  it('never puts the rider token, in the path or anywhere else, in the report', async () => {
    window.history.pushState({}, '', `/rider/${RAW_TOKEN}?utm=1#frag`)
    const { captureError, isMonitoringEnabled } = await import('../monitoring')
    expect(isMonitoringEnabled()).toBe(true)

    captureError(new Error('rider screen crashed'))

    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('/rider/[redacted]')
    expect(sent[0]).not.toContain(RAW_TOKEN)
  })

  it('still reports an ordinary page path unchanged', async () => {
    window.history.pushState({}, '', '/operations/delivery')
    const { captureError } = await import('../monitoring')

    captureError(new Error('delivery screen crashed'))

    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('/operations/delivery')
  })
})
