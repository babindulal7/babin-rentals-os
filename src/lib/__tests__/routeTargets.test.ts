import { describe, expect, it } from 'vitest'
import { AUDIT_LOG_PATH, PRODUCTIONS_HUB_PATH, financeTabPath, rentalAuditLogPath, rentalInvoicesPath } from '../routeTargets'

describe('Rental context navigation', () => {
  it('points audit actions at the registered route with exact record UUID', () => {
    const id = '44444444-4444-4444-8444-444444444444'
    const url = new URL(rentalAuditLogPath(id), 'https://test.invalid')
    expect(url.pathname).toBe(AUDIT_LOG_PATH)
    expect(url.pathname).toBe('/admin/audit-log')
    expect(url.searchParams.get('recordId')).toBe(id)
  })

  it('uses the registered Productions Hub path', () => {
    expect(PRODUCTIONS_HUB_PATH).toBe('/rentals/productions')
    expect(PRODUCTIONS_HUB_PATH).not.toBe('/crew/productions')
  })

  it('carries booking-number filters to the canonical invoices tab', () => {
    const id = 'BR-123/Shift A & B'
    const url = new URL(rentalInvoicesPath(id), 'https://test.invalid')
    expect(url.pathname).toBe('/finance')
    expect(url.searchParams.get('tab')).toBe('invoices')
    expect(url.searchParams.get('search')).toBe(id)
  })

  it('preserves deep-link query, tab override, and hash in legacy redirects', () => {
    const url = new URL(financeTabPath('invoices', '?search=BR-42%2F2026&sort=due&tab=payments&status=unpaid', '#details'), 'https://test.invalid')
    expect(url.pathname).toBe('/finance')
    expect(url.searchParams.get('search')).toBe('BR-42/2026')
    expect(url.searchParams.get('sort')).toBe('due')
    expect(url.searchParams.get('status')).toBe('unpaid')
    expect(url.searchParams.getAll('tab')).toEqual(['invoices'])
    expect(url.hash).toBe('#details')
  })

  it.each(['closing','invoices','payments','expenses','documents','reports'] as const)(
    'preserves incoming search on /finance/%s redirects',
    tab => {
      const url = new URL(financeTabPath(tab, '?search=B-777'), 'https://test.invalid')
      expect(url.searchParams.get('tab')).toBe(tab)
      expect(url.searchParams.get('search')).toBe('B-777')
    },
  )
})
