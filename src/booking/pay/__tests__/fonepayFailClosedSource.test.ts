import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Static source guards only. A genuine payment-processor verification response,
// exact bank signature contract, and database allocation must be tested safely
// before any payment service is activated.
const verifier = readFileSync(
  new URL('../../../../supabase/functions/pay-verify/index.ts', import.meta.url),
  'utf8',
)
const modal = readFileSync(new URL('../OnlinePaymentModal.tsx', import.meta.url), 'utf8')

describe('T7 Fonepay verification fail-closed source gate', () => {
  it('requires real merchant credentials and an explicitly live provider environment', () => {
    expect(verifier).toMatch(/FONEPAY_SECRET_KEY/)
    expect(verifier).toMatch(/FONEPAY_MERCHANT_CODE/)
    expect(verifier).toMatch(/providerEnvironment !== 'production'/)
    expect(verifier).toMatch(/status: 503/)
  })

  it('does not trust a callback status, a bare reference or arbitrary success text', () => {
    expect(verifier).not.toMatch(/verified\s*=\s*responseCode\s*===\s*'successful'/)
    expect(verifier).not.toMatch(/verified\s*=\s*.*Boolean\(providerRef\)/)
    expect(verifier).not.toMatch(/upstreamText\.includes\('success'\)/)
    expect(verifier).not.toMatch(/mock_verified:\s*true/)
    expect(verifier).toMatch(/code\.trim\(\)\.toLowerCase\(\) === 'successful'/)
  })

  it('fails if the provider returns an HTTP error or mismatched identifiers or amount', () => {
    expect(verifier).toMatch(/if \(!upstreamRes\.ok\)/)
    expect(verifier).toMatch(/xmlField\('response_code'\)/)
    expect(verifier).toMatch(/upstreamFields\[name\] = value/)
    expect(verifier).toMatch(/echoedPrn !== intentId/)
    expect(verifier).toMatch(/echoedPid !== merchantCode/)
    expect(verifier).toMatch(/echoedUid !== uid/)
    expect(verifier).toMatch(/Number\(echoedAmount\)\.toFixed\(2\) !== amountRupees/)
  })

  it('uses a verified UID and stores only sanitized verification metadata', () => {
    expect(verifier).toMatch(/const finalRef = uid/)
    expect(verifier).toMatch(/verified_by: 'fonepay_s2s'/)
    expect(verifier).not.toMatch(/raw: upstreamText/)
  })

  it('does not ship a browser-forced paid button outside explicit mock mode', () => {
    expect(modal).toMatch(/VITE_DATA_SOURCE === 'mock'/)
    expect(modal).toMatch(/Simulate Successful Payment \(Sandbox\)/)
  })
})
