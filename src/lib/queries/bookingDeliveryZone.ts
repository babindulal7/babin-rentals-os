import { supabase } from '../supabase'

/*
 * RULING 2026-11-18 (O-30): staff choose the delivery zone at booking; delivery jobs inherit it
 * through their booking. The write goes through set_booking_delivery_zone() (migration 0246),
 * which checks the role and branch in the database. Calling it again with the same zone is a no-op.
 */

export async function setBookingDeliveryZone(bookingId: string, zoneId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_booking_delivery_zone', {
    p_booking_id: bookingId,
    p_zone_id: zoneId,
  })
  if (error) throw new Error(`The delivery zone was not saved: ${error.message}`)
}

export async function setDeliveryJobVehicleClass(jobId: string, vehicleClass: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_delivery_job_vehicle_class', {
    p_job_id: jobId,
    p_vehicle_class: vehicleClass,
  })
  if (error) throw new Error(`The vehicle class was not saved: ${error.message}`)
}
