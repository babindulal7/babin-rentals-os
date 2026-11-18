import { supabase } from '../supabase'

export interface BookingAtRiskRow {
  id: string
  booking_id: string
  booking_no: string
  cause: 'extension_clash' | 'late_return' | 'marked_will_be_late' | 'overbooking_shortage'
  clashing_booking_id?: string | null
  clashing_booking_no?: string | null
  product_id?: string | null
  product_name?: string | null
  asset_id?: string | null
  asset_tag?: string | null
  raised_at: string
  raised_by?: string | null
  resolved_at?: string | null
  resolved_by?: string | null
  resolution?: string | null
  resolution_notes?: string | null
  created_at: string
}

const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase

/**
 * Fetches active (unresolved) at-risk records for a specific booking.
 */
export async function fetchBookingAtRisk(bookingId: string): Promise<BookingAtRiskRow[]> {
  if (!bookingId) return []
  if (isMock) {
    return []
  }
  try {
    const { data, error } = await supabase
      .from('booking_at_risk')
      .select('*')
      .eq('booking_id', bookingId)
      .is('resolved_at', null)
      .order('raised_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch at-risk booking rows:', error)
      return []
    }

    return (data ?? []) as BookingAtRiskRow[]
  } catch {
    return []
  }
}

/**
 * Fetches all currently active (unresolved) at-risk bookings for Today dashboard & alerts.
 */
export async function fetchActiveAtRiskBookings(): Promise<BookingAtRiskRow[]> {
  if (isMock) {
    return []
  }
  try {
    const { data, error } = await supabase
      .from('booking_at_risk')
      .select('*')
      .is('resolved_at', null)
      .order('raised_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch active at-risk bookings:', error)
      return []
    }

    return (data ?? []) as BookingAtRiskRow[]
  } catch {
    return []
  }
}
