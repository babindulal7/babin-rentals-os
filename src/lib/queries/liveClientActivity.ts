import { supabase } from '../supabase'
import { kathmanduCivil } from '../bs'

/** Confirmed, current or completed rentals — never quotes, drafts or cancellations. */
export const RENTAL_ACTIVITY_STAGES = new Set(['Booked', 'Packed', 'On Rent', 'Returned', 'Closed'])

export interface LiveClientActivityRow {
  id: string
  clientCode: string
  name: string
  status: string
  bookingCount: number
  lastBookingCreatedAd: string | null
}

export interface LiveClientActivityReport {
  totalVisibleClients: number
  clientsWithRentals: number
  repeatClients: number
  repeatClientRate: number
  totalRentalBookings: number
  rows: LiveClientActivityRow[]
}

const PAGE_SIZE = 500

/**
 * Reads every accessible page, not only Supabase's default first 1000 rows.
 * All counts are scoped to RLS-visible records. A failed query rejects
 * instead of suggesting a real business has zero customers.
 */
async function readClients(): Promise<Array<{ id: string; client_code: string | null; name: string | null; status: string | null }>> {
  const all: Array<{ id: string; client_code: string | null; name: string | null; status: string | null }> = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from('clients_v')
      .select('id, client_code, name, status')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error('Unable to read the client directory.', { cause: error })
    if (!data) throw new Error('Client directory returned no result.')
    all.push(...data)
    if (data.length < PAGE_SIZE) return all
  }
}

async function readRentalBookings(): Promise<Array<{ client_id: string | null; stage: string; created_at: string | null; cancelled_at: string | null }>> {
  const all: Array<{ client_id: string | null; stage: string; created_at: string | null; cancelled_at: string | null }> = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from('bookings')
      .select('client_id, stage, created_at, cancelled_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error('Unable to read client booking history.', { cause: error })
    if (!data) throw new Error('Booking history returned no result.')
    all.push(...data)
    if (data.length < PAGE_SIZE) return all
  }
}

export async function getLiveClientActivityReport(): Promise<LiveClientActivityReport> {
  const [clients, bookings] = await Promise.all([readClients(), readRentalBookings()])
  const activity = new Map<string, { count: number; lastCreated: string | null }>()
  for (const booking of bookings) {
    if (!booking.client_id || booking.cancelled_at || !RENTAL_ACTIVITY_STAGES.has(booking.stage)) continue
    const record = activity.get(booking.client_id) ?? { count: 0, lastCreated: null }
    record.count++
    if (booking.created_at && (!record.lastCreated || booking.created_at > record.lastCreated)) {
      record.lastCreated = booking.created_at
    }
    activity.set(booking.client_id, record)
  }

  const rows: LiveClientActivityRow[] = clients.map((client) => {
    const booking = activity.get(client.id)
    return {
      id: client.id,
      clientCode: client.client_code ?? '',
      name: client.name ?? 'Unnamed client',
      status: client.status ?? 'Unknown',
      bookingCount: booking?.count ?? 0,
      lastBookingCreatedAd: booking?.lastCreated
        ? new Date(kathmanduCivil(new Date(booking.lastCreated))).toISOString().slice(0, 10)
        : null,
    }
  }).sort((a, b) => b.bookingCount - a.bookingCount || a.name.localeCompare(b.name))

  const clientsWithRentals = rows.filter((c) => c.bookingCount > 0).length
  const repeatClients = rows.filter((c) => c.bookingCount >= 2).length
  return {
    totalVisibleClients: rows.length,
    clientsWithRentals,
    repeatClients,
    repeatClientRate: clientsWithRentals ? Math.round((repeatClients / clientsWithRentals) * 1000) / 10 : 0,
    totalRentalBookings: rows.reduce((total, client) => total + client.bookingCount, 0),
    rows,
  }
}
