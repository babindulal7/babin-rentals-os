import { supabase } from '../supabase'
import type { InvoicePdfCompany } from '../pdf/generatePdf'

/** Read confirmed shared values, never the settings store's device/default fallback. */
export async function fetchInvoiceCompany(bookingId: string): Promise<InvoicePdfCompany> {
  const [settings, booking] = await Promise.all([
    supabase.from('settings').select('key, value').eq('scope', 'org').is('location_id', null)
      .in('key', ['organisationName', 'vatNumber', 'businessPhone', 'businessDescription']),
    supabase.from('bookings').select('branch_id').eq('id', bookingId).maybeSingle(),
  ])
  if (settings.error || !Array.isArray(settings.data)) throw new Error('Saved business details could not be loaded. Retry before exporting the invoice.')
  if (booking.error || !booking.data?.branch_id) throw new Error('The invoice booking branch could not be confirmed. Retry before exporting the invoice.')

  const values = new Map<string, string>()
  for (const row of settings.data as unknown as Array<{ key: unknown; value: unknown }>) {
    if (typeof row.key === 'string' && typeof row.value === 'string') values.set(row.key, row.value.trim())
  }
  const name = values.get('organisationName')
  if (!name) throw new Error('Save the organisation name in Settings before exporting an invoice.')

  const branch = await supabase.from('branches').select('address, phone, email').eq('id', booking.data.branch_id).maybeSingle()
  if (branch.error || !branch.data) throw new Error('Saved invoice branch details could not be loaded. Retry before exporting the invoice.')
  const panVat = values.get('vatNumber')
  const description = values.get('businessDescription')
  const address = branch.data.address?.trim()
  const phone = values.get('businessPhone') || branch.data.phone?.trim()
  const email = branch.data.email?.trim()
  return {
    name,
    ...(panVat ? { panVat } : {}),
    ...(description ? { description } : {}),
    ...(address ? { address } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
  }
}
