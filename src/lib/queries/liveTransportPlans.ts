import { supabase } from '../supabase'
import { canViewMoney } from '../rbac'
import type { SystemRole } from '../../types/database'

/**
 * There is no persisted dispatch lifecycle yet. This query returns only
 * transport *plans* linked to bookings; it never invents Delivered, Failed,
 * In Transit, a driver assignment, or a collected payment.
 *
 * booking_transport_v is a server-masked read surface. Until driver row
 * isolation has been audited, do not grant the Driver role access here.
 */
export const LIVE_TRANSPORT_READ_ROLES: ReadonlySet<SystemRole> =
  new Set(['Owner', 'Admin', 'Coordinator', 'Warehouse'])

export function liveTransportReadRefusal(role: SystemRole | null): string | null {
  if (!role || !LIVE_TRANSPORT_READ_ROLES.has(role)) {
    return 'Transport plans are not available to this role. Drivers require verified, assignment-scoped database access.'
  }
  return null
}

export interface LiveTransportPlan {
  id: string
  bookingId: string
  bookingNo: string
  clientName: string
  clientPhone: string | null
  pickupAtAd: string
  handoverLocation: string | null
  deliveryType: string
  vehicle: string | null
  numberPlate: string | null
  driverContact: string | null
  specialInstructions: string | null
  quotedDeliveryFeeNpr: number | null
}

interface TransportRow {
  id: string
  booking_id: string
  vehicle: string | null
  number_plate: string | null
  driver_contact: string | null
  special_instructions: string | null
  delivery_charge?: number | string | null
}

interface BookingRow {
  id: string
  booking_no: string
  pickup_at: string
  pickup_location: string | null
  delivery_type: string
  cancelled_at: string | null
  clients: { name: string | null; phone: string | null; address_line: string | null } | null
}

const PAGE_SIZE = 500
const BOOKING_BATCH = 100

export async function getLiveTransportPlans(role: SystemRole | null): Promise<LiveTransportPlan[]> {
  const refusal = liveTransportReadRefusal(role)
  if (refusal) throw new Error(refusal)

  // Do not request monetary columns at all for money-blind Warehouse users.
  const columns = 'id,booking_id,vehicle,number_plate,driver_contact,special_instructions' +
    (role && canViewMoney(role) ? ',delivery_charge' : '')
  const plans: TransportRow[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from('booking_transport_v')
      .select(columns)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error('Unable to load transport plans from the database.', { cause: error })
    if (!data) throw new Error('Transport plans query returned no data.')
    plans.push(...data as unknown as TransportRow[])
    if (data.length < PAGE_SIZE) break
  }
  if (!plans.length) return []

  // Second RLS-protected read: a view row alone is NOT authority to expose the
  // booking, its client PII or location. Refuse partial permission joins.
  const ids = [...new Set(plans.map((p) => p.booking_id))]
  const bookingMap = new Map<string, BookingRow>()
  for (let i = 0; i < ids.length; i += BOOKING_BATCH) {
    const { data, error } = await supabase.from('bookings')
      .select('id,booking_no,pickup_at,pickup_location,delivery_type,cancelled_at,clients(name,phone,address_line)')
      .in('id', ids.slice(i, i + BOOKING_BATCH))
    if (error) throw new Error('Unable to verify booking access for transport plans.', { cause: error })
    if (!data) throw new Error('Booking permission check returned no data.')
    for (const row of data as unknown as BookingRow[]) bookingMap.set(row.id, row)
  }
  if (bookingMap.size !== ids.length) {
    throw new Error('Transport plans include bookings that this session cannot verify. Nothing was displayed.')
  }

  const result: LiveTransportPlan[] = []
  for (const transport of plans) {
    const booking = bookingMap.get(transport.booking_id)
    if (!booking) throw new Error('Missing verified booking for transport plan.')
    if (booking.cancelled_at) continue
    if (!booking.clients) {
      throw new Error('Transport plans include clients this session cannot verify. Nothing was displayed.')
    }
    const fee = transport.delivery_charge
    const quotedDeliveryFeeNpr = role && canViewMoney(role) && fee !== null && fee !== undefined
      ? Number(fee)
      : null
    if (quotedDeliveryFeeNpr !== null && !Number.isFinite(quotedDeliveryFeeNpr)) {
      throw new Error('Transport amount is invalid. The plan cannot be displayed.')
    }
    result.push({
      id: transport.id,
      bookingId: booking.id,
      bookingNo: booking.booking_no,
      clientName: booking.clients.name ?? 'Unnamed client',
      clientPhone: booking.clients.phone ?? null,
      pickupAtAd: booking.pickup_at,
      handoverLocation: booking.pickup_location ?? booking.clients.address_line ?? null,
      deliveryType: booking.delivery_type,
      vehicle: transport.vehicle,
      numberPlate: transport.number_plate,
      driverContact: transport.driver_contact,
      specialInstructions: transport.special_instructions,
      quotedDeliveryFeeNpr,
    })
  }
  return result.sort((a, b) => a.pickupAtAd.localeCompare(b.pickupAtAd))
}
