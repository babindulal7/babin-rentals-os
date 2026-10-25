import { IS_MOCK, supabase } from '../supabase'

export interface ReturnQuantityLine {
  id: string
  qty: number
}

/**
 * Verified unassigned quantity receipts, including an explicit zero for every
 * physical, non-consumable booking line. Ordinary movement rows are not proof
 * that stock was received; the database reads its private receipt ledger.
 */
export async function fetchReturnQuantityFacts(
  bookingId: string,
  expectedLines: readonly ReturnQuantityLine[],
): Promise<Map<string, number>> {
  const expected = new Map<string, number>()
  for (const line of expectedLines) {
    if (!line.id || expected.has(line.id) || !Number.isSafeInteger(line.qty) || line.qty <= 0) {
      throw new Error('Booking quantities could not be verified. Reload Return before confirming.')
    }
    expected.set(line.id, line.qty)
  }

  // The local corpus has no authoritative receipt ledger. Its explicit mock
  // source starts each workspace at zero; live reads never fall back to zero.
  if (IS_MOCK) return new Map([...expected].map(([id]) => [id, 0]))
  if (expected.size === 0) return new Map()

  const { data, error } = await supabase.rpc('read_verified_return_quantities', { p_booking_id: bookingId })
  if (error || !Array.isArray(data)) {
    throw new Error('Previously returned quantities could not be verified. Reload Return before confirming.')
  }

  const facts = new Map<string, number>()
  for (const value of data as unknown[]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Previously returned quantities are incomplete. Reload Return before confirming.')
    }
    const row = value as Record<string, unknown>
    const id = row.booking_line_id
    const qty = row.returned_qty
    const required = typeof id === 'string' ? expected.get(id) : undefined
    if (typeof id !== 'string' || required === undefined || facts.has(id) ||
      typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 0 || qty > required) {
      throw new Error('Previously returned quantities are invalid. Reload Return before confirming.')
    }
    facts.set(id, qty)
  }
  if (facts.size !== expected.size) {
    throw new Error('Previously returned quantities are incomplete. Reload Return before confirming.')
  }
  return facts
}
