import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchInvoiceCompany } from '../invoiceCompany'

const db = vi.hoisted(() => ({
  settings: [] as Array<{ key: string; value: unknown }>,
  failure: '',
  branchId: 'booking-branch',
  calls: [] as Array<[string, string, ...unknown[]]>,
  branch: { address: 'Saved branch address', phone: '9801111111', email: 'accounts@example.test' },
}))
vi.mock('../../supabase', () => ({
  supabase: { from: (table: string) => {
    const result = () => ({
      data: db.failure === table ? null : table === 'settings' ? db.settings : table === 'bookings' ? { branch_id: db.branchId } : db.branch,
      error: db.failure === table ? { message: 'Read refused' } : null,
    })
    const builder = {
      select: (...args: unknown[]) => { db.calls.push([table, 'select', ...args]); return builder },
      eq: (...args: unknown[]) => { db.calls.push([table, 'eq', ...args]); return builder },
      is: (...args: unknown[]) => { db.calls.push([table, 'is', ...args]); return builder },
      in: (...args: unknown[]) => { db.calls.push([table, 'in', ...args]); return builder },
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    }
    return builder
  } },
}))

beforeEach(() => {
  db.settings = [
    { key: 'organisationName', value: 'Saved Film Rentals Ltd' },
    { key: 'vatNumber', value: '123456789' },
    { key: 'businessPhone', value: '+977 9802222222' },
    { key: 'businessDescription', value: 'Saved business description' },
  ]
  db.branch = { address: 'Saved branch address', phone: '9801111111', email: 'accounts@example.test' }
  db.failure = ''
  db.branchId = 'booking-branch'
  db.calls = []
})

describe('invoice company identity comes from shared records', () => {
  it('uses saved organisation values and the invoice booking branch, with no default identity', async () => {
    await expect(fetchInvoiceCompany('invoice-booking')).resolves.toEqual({
      name: 'Saved Film Rentals Ltd', panVat: '123456789', phone: '+977 9802222222',
      address: 'Saved branch address', email: 'accounts@example.test', description: 'Saved business description',
    })
    expect(db.calls).toContainEqual(['settings', 'eq', 'scope', 'org'])
    expect(db.calls).toContainEqual(['settings', 'is', 'location_id', null])
    expect(db.calls).toContainEqual(['bookings', 'eq', 'id', 'invoice-booking'])
    expect(db.calls).toContainEqual(['branches', 'eq', 'id', 'booking-branch'])
  })

  it('uses the saved branch phone when the organisation phone is blank', async () => {
    db.settings = db.settings.filter((row) => row.key !== 'businessPhone')
    expect((await fetchInvoiceCompany('invoice-booking')).phone).toBe('9801111111')
  })

  it('omits absent optional values instead of printing example contacts or a tagline', async () => {
    db.settings = [{ key: 'organisationName', value: 'Saved Rentals' }]
    db.branch = { address: '', phone: '', email: '' }
    await expect(fetchInvoiceCompany('invoice-booking')).resolves.toEqual({ name: 'Saved Rentals' })
  })

  it.each(['settings', 'bookings', 'branches'])('refuses a failed %s read', async (table) => {
    db.failure = table
    await expect(fetchInvoiceCompany('invoice-booking')).rejects.toThrow(/could not be (loaded|confirmed)/)
  })

  it.each([
    { label: 'absent', settings: [] },
    { label: 'blank', settings: [{ key: 'organisationName', value: '   ' }] },
    { label: 'invalid', settings: [{ key: 'organisationName', value: 123 }] },
  ])('does not replace a $label business name with a default', async ({ settings }) => {
    db.settings = settings
    await expect(fetchInvoiceCompany('invoice-booking')).rejects.toThrow(/organisation name/)
  })

  it('reads changed business details for the next export without caching old defaults', async () => {
    await fetchInvoiceCompany('invoice-booking')
    db.settings = [{ key: 'organisationName', value: 'Updated Rentals' }, { key: 'vatNumber', value: '987654321' }]
    const company = await fetchInvoiceCompany('invoice-booking')
    expect(company.name).toBe('Updated Rentals')
    expect(company.panVat).toBe('987654321')
  })
})
