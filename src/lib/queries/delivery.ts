import { businessDayAd, kathmanduMinutes } from '../../data/today'
import { IS_MOCK, supabase } from '../supabase'
import { canPerformOperations, canViewMoney } from '../rbac'
import type { SystemRole } from '../../types/database'

export interface DeliveryWriteContext {
  role: SystemRole | null
  isOnline: boolean
}

export const LIVE_DELIVERY_READ_ROLES: ReadonlySet<SystemRole> = new Set([
  'Owner',
  'Admin',
  'Manager',
  'Coordinator',
  'Warehouse',
  'Driver',
])

export function liveDeliveryReadRefusal(role: SystemRole | null): string | null {
  if (!role || !LIVE_DELIVERY_READ_ROLES.has(role)) {
    return 'Delivery records are not available to this role. Drivers require assigned trip access.'
  }
  return null
}

export function deliveryReadRefusal(role: SystemRole | null): string | null {
  if (!role || role === 'Client') return 'Internal delivery records are not available to this session.'
  if (role === 'Driver') return 'Assigned delivery records are unavailable until verified trip assignment access is connected.'
  if (!IS_MOCK) return 'Delivery records are unavailable: a server-backed delivery query and action are not connected. No live deliveries were loaded and nothing has been saved.'
  return null
}

/** This local preview has no delivery server action. Never report a live save. */
export function deliveryMutationRefusal(context: DeliveryWriteContext): string | null {
  if (!context.role || !canPerformOperations(context.role) || !canViewMoney(context.role)) {
    return 'Your role cannot change delivery records.'
  }
  if (!IS_MOCK) {
    return 'Delivery changes are unavailable until a server-backed delivery action is connected. Nothing has been saved.'
  }
  if (!context.isOnline) return 'This device is offline. Delivery changes are not queued. Reconnect before trying again.'
  return null
}

function requireDeliveryMutation(context: DeliveryWriteContext): void {
  const refusal = deliveryMutationRefusal(context)
  if (refusal) throw new Error(refusal)
}

/**
 * One instant, rendered as `YYYY-MM-DD HH:MM`, both halves in **Kathmandu**.
 * Both halves come from `data/today.ts`, the one place the offset lives.
 */
function kathmanduStamp(now: Date = new Date()): string {
  const minutes = kathmanduMinutes(now.toISOString())
  return `${businessDayAd(now)} ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export type DeliveryStatus = 'Scheduled' | 'Ready' | 'In Transit' | 'Delivered' | 'Failed'
export type DeliveryMode = 'Babin Delivery' | 'Courier / Rider' | 'Self Pickup'

export interface DeliveryRecord {
  id: string
  bookingId?: string | undefined
  bookingNo: string
  leg?: 'Outbound' | 'Return' | undefined
  clientName: string
  clientPhone: string
  address: string
  neighborhood: string
  mode: DeliveryMode
  itemCount?: number | undefined
  items?: string | undefined
  driverId?: string | undefined
  driverName?: string | undefined
  driverPhone?: string | undefined
  vehiclePlate?: string | undefined
  status: DeliveryStatus
  scheduledDate: string
  scheduledTime: string
  dispatchedAt?: string | undefined
  deliveredAt?: string | undefined
  deliveryFeeNpr: number
  notes?: string | undefined
  recipientName?: string | undefined
  packageSealNo?: string | undefined
  gatePassNo?: string
}

export const INITIAL_DELIVERIES: DeliveryRecord[] = [
  {
    id: 'DEL-2601',
    bookingNo: 'BR-2613',
    clientName: 'Himalayan Films Pvt. Ltd.',
    clientPhone: '+977 9841234567',
    address: 'Bakhundole, Lalitpur (Near Summit Hotel)',
    neighborhood: 'Sanepa / Bakhundole',
    mode: 'Babin Delivery',
    itemCount: 4,
    items: 'ARRI Alexa Mini LF + NiSi Cine Primes (2 Pelican cases)',
    driverName: 'Suman Rai',
    driverPhone: '+977 9851098765',
    vehiclePlate: 'Ba 3 Cha 8821 (Scorpio Van)',
    status: 'In Transit',
    scheduledDate: '2026-07-14',
    scheduledTime: '09:30',
    dispatchedAt: '2026-07-14 08:45',
    deliveryFeeNpr: 3500,
    notes: 'Fragile: 2 Pelican cases (ARRI Alexa Mini LF + NiSi Cine Primes). Handle with extreme care.',
    packageSealNo: 'BR-SEAL-882',
    gatePassNo: 'GP-0412',
  },
  {
    id: 'DEL-2602',
    bookingNo: 'BR-2611',
    clientName: 'Kathmandu Ad Lab',
    clientPhone: '+977 9801122334',
    address: 'Naxal, Kathmandu (Opposite Narayanhiti Gate 3)',
    neighborhood: 'Naxal',
    mode: 'Courier / Rider',
    itemCount: 2,
    items: 'Sony FX6 Cinema Kit + GM Zoom Trio',
    driverName: 'Ramesh Thapa (Pathao Rider)',
    driverPhone: '+977 9813009988',
    vehiclePlate: 'Ba 92 Pa 3314',
    status: 'Ready',
    scheduledDate: '2026-07-14',
    scheduledTime: '11:00',
    deliveryFeeNpr: 1500,
    notes: 'Collect advance Rs 24,500 before equipment release.',
    packageSealNo: 'BR-SEAL-883',
    gatePassNo: 'GP-0413',
  },
  {
    id: 'DEL-2603',
    bookingNo: 'BR-2609',
    clientName: 'Studio Nine Creations',
    clientPhone: '+977 9818776655',
    address: 'Jhamsikhel, Lalitpur',
    neighborhood: 'Jhamsikhel',
    mode: 'Babin Delivery',
    itemCount: 6,
    items: 'Aputure 600d Pro + Light Dome 150 (2 lighting cases)',
    driverName: 'Suman Rai',
    driverPhone: '+977 9851098765',
    vehiclePlate: 'Ba 3 Cha 8821 (Scorpio Van)',
    status: 'Delivered',
    scheduledDate: '2026-07-14',
    scheduledTime: '07:30',
    dispatchedAt: '2026-07-14 07:05',
    deliveredAt: '2026-07-14 07:34',
    recipientName: 'Anil Gurung (Production Manager)',
    deliveryFeeNpr: 3500,
    notes: 'Handed over on set at Studio Nine soundstage.',
    packageSealNo: 'BR-SEAL-880',
    gatePassNo: 'GP-0410',
  },
  {
    id: 'DEL-2604',
    bookingNo: 'BR-2614',
    clientName: 'White Peak Documentaries',
    clientPhone: '+977 9849988776',
    address: 'Baluwatar, Kathmandu',
    neighborhood: 'Baluwatar',
    mode: 'Babin Delivery',
    itemCount: 3,
    items: 'RED V-Raptor kit + heavy-duty Sachtler tripod',
    status: 'Scheduled',
    scheduledDate: '2026-07-15',
    scheduledTime: '08:00',
    deliveryFeeNpr: 3500,
    notes: 'RED V-Raptor kit + heavy-duty Sachtler tripod.',
  },
  {
    id: 'DEL-2605',
    bookingNo: 'BR-2615',
    clientName: 'Pokhara Mountain Sets',
    clientPhone: '+977 9856012345',
    address: 'Kalanki Highway Cargo Hub, Kathmandu',
    neighborhood: 'Kalanki',
    mode: 'Courier / Rider',
    itemCount: 8,
    items: 'Sound Devices 833 + Wireless Audio Kit (consignment box)',
    status: 'Scheduled',
    scheduledDate: '2026-07-15',
    scheduledTime: '14:00',
    deliveryFeeNpr: 2000,
    notes: 'Consignment shipment to Pokhara via Night Express Courier.',
  },
]

const STORAGE_KEY = 'babin_rentals_deliveries_v1'

export function getDeliveries(role: SystemRole | null): DeliveryRecord[] {
  // Local sample records cannot stand in for live deliveries.
  if (deliveryReadRefusal(role)) return []
  if (typeof window === 'undefined') return INITIAL_DELIVERIES
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DELIVERIES))
      return INITIAL_DELIVERIES
    }
    return JSON.parse(raw) as DeliveryRecord[]
  } catch {
    return INITIAL_DELIVERIES
  }
}

export function saveDeliveries(list: DeliveryRecord[], context: DeliveryWriteContext): void {
  requireDeliveryMutation(context)
  if (typeof window === 'undefined') throw new Error('Delivery storage is unavailable. Nothing has been saved.')
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function updateDeliveryStatus(
  id: string,
  status: DeliveryStatus,
  context: DeliveryWriteContext,
  extra?: { recipientName?: string | undefined; notes?: string | undefined }
): DeliveryRecord[] {
  requireDeliveryMutation(context)
  const current = getDeliveries(context.role)
  const timeStr = kathmanduStamp()

  const next = current.map((d) => {
    if (d.id !== id) return d
    const updated: DeliveryRecord = { ...d, status }
    if (status === 'In Transit' && !d.dispatchedAt) {
      updated.dispatchedAt = timeStr
    }
    if (status === 'Delivered') {
      updated.deliveredAt = timeStr
      if (extra?.recipientName) updated.recipientName = extra.recipientName
    }
    if (extra?.notes) {
      updated.notes = updated.notes ? `${updated.notes} · ${extra.notes}` : extra.notes
    }
    return updated
  })

  saveDeliveries(next, context)
  return next
}

export function assignDeliveryRider(
  id: string,
  driverName: string,
  driverPhone: string,
  vehiclePlate: string,
  context: DeliveryWriteContext
): DeliveryRecord[] {
  requireDeliveryMutation(context)
  const current = getDeliveries(context.role)
  const next = current.map((d) => {
    if (d.id !== id) return d
    return {
      ...d,
      driverName,
      driverPhone,
      vehiclePlate,
      status: d.status === 'Scheduled' ? ('Ready' as DeliveryStatus) : d.status,
    }
  })
  saveDeliveries(next, context)
  return next
}

export function rescheduleDeliveryRecord(
  id: string,
  newScheduledAt: string,
  context: DeliveryWriteContext,
  notes?: string
): DeliveryRecord[] {
  requireDeliveryMutation(context)
  const current = getDeliveries(context.role)
  const datePart = newScheduledAt.slice(0, 10)
  const timePart = newScheduledAt.slice(11, 16) || '10:00'
  const next = current.map((d) => {
    if (d.id !== id) return d
    return {
      ...d,
      scheduledDate: datePart,
      scheduledTime: timePart,
      notes: notes ? (d.notes ? `${d.notes} · ${notes}` : notes) : d.notes,
    }
  })
  saveDeliveries(next, context)
  return next
}

function nextDeliveryId(existing: readonly DeliveryRecord[]): string {
  let highest = 2600
  for (const d of existing) {
    const n = Number(d.id.replace(/^DEL-/, ''))
    if (Number.isFinite(n) && n > highest) highest = Math.floor(n)
  }
  let candidate = highest + 1
  const taken = new Set(existing.map((d) => d.id))
  while (taken.has(`DEL-${candidate}`)) candidate += 1
  return `DEL-${candidate}`
}

export function createDeliveryRecord(payload: Omit<DeliveryRecord, 'id'>, context: DeliveryWriteContext): DeliveryRecord {
  requireDeliveryMutation(context)
  const current = getDeliveries(context.role)
  const created: DeliveryRecord = { ...payload, id: nextDeliveryId(current) }
  const next = [created, ...current]
  saveDeliveries(next, context)
  return created
}

interface JobRow {
  id: string
  booking_id: string
  branch_id: string
  leg: string
  scheduled_at: string
  status: string
  assigned_driver_id: string | null
  dispatched_at: string | null
  delivered_at: string | null
  received_by: string | null
  last_note: string | null
  vehicle: string | null
  rider_name: string | null
  rider_phone: string | null
}

interface BookingInfo {
  id: string
  booking_no: string
  delivery_type: string
  item_count: number | null
  pickup_at: string
  return_at: string
  pickup_location: string | null
  clients: {
    name: string | null
    phone: string | null
    address_line: string | null
  } | null
}

/**
 * Live database query for delivery jobs.
 * Enforces RLS isolation: Driver reads only assigned jobs.
 * Enforces Law 6: Driver and Warehouse never receive delivery charge or monetary values.
 */
export async function fetchDeliveries(role: SystemRole | null): Promise<DeliveryRecord[]> {
  const refusal = liveDeliveryReadRefusal(role)
  if (refusal) throw new Error(refusal)

  if (IS_MOCK) {
    return getDeliveries(role)
  }

  const { data: jobs, error: jobsError } = await supabase
    .from('delivery_jobs')
    .select(`
      id,
      booking_id,
      branch_id,
      leg,
      scheduled_at,
      status,
      assigned_driver_id,
      dispatched_at,
      delivered_at,
      received_by,
      last_note,
      vehicle,
      rider_name,
      rider_phone
    `)
    .order('scheduled_at', { ascending: false })

  if (jobsError) {
    throw new Error(`Failed to load delivery jobs: ${jobsError.message}`)
  }

  if (!jobs || jobs.length === 0) {
    return []
  }

  const typedJobs = jobs as unknown as JobRow[]
  const bookingIds = Array.from(new Set(typedJobs.map((j) => j.booking_id)))

  const { data: bookingsData, error: bookingsError } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_no,
      delivery_type,
      item_count,
      pickup_at,
      return_at,
      pickup_location,
      clients (
        name,
        phone,
        address_line
      )
    `)
    .in('id', bookingIds)

  if (bookingsError) {
    throw new Error(`Failed to load booking details for delivery jobs: ${bookingsError.message}`)
  }

  const bookingMap = new Map<string, BookingInfo>()
  for (const b of (bookingsData as unknown as BookingInfo[] || [])) {
    bookingMap.set(b.id, b)
  }

  const transportFeeMap = new Map<string, number>()
  if (role && canViewMoney(role)) {
    const { data: transportData } = await supabase
      .from('booking_transport_v')
      .select('booking_id, delivery_charge')
      .in('booking_id', bookingIds)

    if (transportData) {
      for (const t of (transportData as { booking_id: string | null; delivery_charge: number | null }[])) {
        if (t.booking_id && t.delivery_charge != null) {
          transportFeeMap.set(t.booking_id, Math.round(Number(t.delivery_charge)))
        }
      }
    }
  }

  return typedJobs.map((job): DeliveryRecord => {
    const booking = bookingMap.get(job.booking_id)
    const client = booking?.clients

    const scheduledDate = job.scheduled_at ? job.scheduled_at.slice(0, 10) : ''
    const scheduledTime = job.scheduled_at ? job.scheduled_at.slice(11, 16) : ''

    const dispatchedAt = job.dispatched_at ? job.dispatched_at.replace('T', ' ').slice(0, 16) : undefined
    const deliveredAt = job.delivered_at ? job.delivered_at.replace('T', ' ').slice(0, 16) : undefined

    let mode: DeliveryMode = 'Babin Delivery'
    if (booking?.delivery_type === 'Client Pickup') {
      mode = 'Self Pickup'
    } else if (job.rider_name) {
      mode = 'Courier / Rider'
    }

    return {
      id: job.id,
      bookingId: job.booking_id,
      bookingNo: booking?.booking_no ?? 'UNKNOWN',
      leg: (job.leg as 'Outbound' | 'Return') ?? 'Outbound',
      clientName: client?.name ?? 'Unknown Client',
      clientPhone: client?.phone ?? '',
      address: client?.address_line || booking?.pickup_location || 'Warehouse / Studio',
      neighborhood: '',
      mode,
      itemCount: booking?.item_count != null ? Number(booking.item_count) : undefined,
      items: job.last_note || (booking?.item_count != null ? `${booking.item_count} items` : undefined),
      driverId: job.assigned_driver_id || undefined,
      driverName: job.rider_name || (job.assigned_driver_id ? 'Assigned Driver' : undefined),
      driverPhone: job.rider_phone || undefined,
      vehiclePlate: job.vehicle || undefined,
      status: job.status as DeliveryStatus,
      scheduledDate,
      scheduledTime,
      dispatchedAt,
      deliveredAt,
      deliveryFeeNpr: transportFeeMap.get(job.booking_id) ?? 0,
      notes: job.last_note || undefined,
      recipientName: job.received_by || undefined,
    }
  })
}
