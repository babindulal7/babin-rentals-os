import { supabase } from '../supabase'
import type { SystemRole } from '../../types/database'
import { canViewMoney } from '../rbac'
import type { Paisa } from '../money'

export type DeliveryTransportStatus = 'Scheduled' | 'Ready' | 'In Transit' | 'Delivered' | 'Failed'

export interface DeliveryTransportItem {
  id: string
  bookingId: string
  bookingNo: string
  bookingStage: string
  branchId: string
  clientName: string
  clientPhone: string | null
  destination: string | null
  deliveryType: string
  driverId: string | null
  driverName: string | null
  vehicle: string | null
  numberPlate: string | null
  deliveryStatus: DeliveryTransportStatus
  scheduledAt: string
  dispatchedAt: string | null
  deliveredAt: string | null
  recipientName: string | null
  deliveryRevision: number
  deliveryUpdatedAt: string
  deliveryNote: string | null
  deliveryChargePaisa: Paisa | null
}

export const DELIVERY_READ_ROLES: ReadonlySet<SystemRole> = new Set([
  'Owner',
  'Admin',
  'Coordinator',
  'Warehouse',
  'Driver',
])

export function deliveryTransportReadRefusal(role: SystemRole | null): string | null {
  if (!role || !DELIVERY_READ_ROLES.has(role)) {
    return 'Delivery transport records are not available to this role. Drivers require verified, assignment-scoped database access.'
  }
  return null
}

interface RawDeliveryTransportRow {
  id: string
  booking_id: string
  booking_no: string
  booking_stage: string
  branch_id: string
  client_name: string
  client_phone: string | null
  destination: string | null
  delivery_type: string
  driver_id: string | null
  driver_name: string | null
  vehicle: string | null
  number_plate: string | null
  delivery_status: string
  scheduled_at: string
  dispatched_at: string | null
  delivered_at: string | null
  recipient_name: string | null
  delivery_revision: number
  delivery_updated_at: string
  delivery_note: string | null
  delivery_charge_paisa: number | string | null
}

export async function fetchDeliveryTransportList(role: SystemRole | null): Promise<DeliveryTransportItem[]> {
  const refusal = deliveryTransportReadRefusal(role)
  if (refusal) throw new Error(refusal)

  const isMoneyViewer = role !== null && canViewMoney(role)

  const { data, error } = await supabase
    .from('delivery_transport_v')
    .select('*')
    .order('scheduled_at', { ascending: true })

  if (error) {
    throw new Error('Unable to load delivery transport records from the database.', { cause: error })
  }

  if (!data) return []

  const rows = data as unknown as RawDeliveryTransportRow[]

  return rows.map((row) => {
    let chargePaisa: Paisa | null = null
    if (isMoneyViewer && row.delivery_charge_paisa !== null && row.delivery_charge_paisa !== undefined) {
      const parsed = Number(row.delivery_charge_paisa)
      if (Number.isFinite(parsed) && parsed >= 0) {
        chargePaisa = Math.round(parsed) as Paisa
      }
    }

    return {
      id: row.id,
      bookingId: row.booking_id,
      bookingNo: row.booking_no,
      bookingStage: row.booking_stage,
      branchId: row.branch_id,
      clientName: row.client_name,
      clientPhone: row.client_phone ?? null,
      destination: row.destination ?? null,
      deliveryType: row.delivery_type,
      driverId: row.driver_id ?? null,
      driverName: row.driver_name ?? null,
      vehicle: row.vehicle ?? null,
      numberPlate: row.number_plate ?? null,
      deliveryStatus: (['Scheduled', 'Ready', 'In Transit', 'Delivered', 'Failed'].includes(row.delivery_status)
        ? row.delivery_status
        : 'Scheduled') as DeliveryTransportStatus,
      scheduledAt: row.scheduled_at,
      dispatchedAt: row.dispatched_at ?? null,
      deliveredAt: row.delivered_at ?? null,
      recipientName: row.recipient_name ?? null,
      deliveryRevision: row.delivery_revision,
      deliveryUpdatedAt: row.delivery_updated_at,
      deliveryNote: isMoneyViewer ? (row.delivery_note ?? null) : null,
      deliveryChargePaisa: chargePaisa,
    }
  })
}
