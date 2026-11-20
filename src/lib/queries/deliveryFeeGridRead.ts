import { supabase } from '../supabase'
import { resolveDeliveryFee, type DeliveryFeeState, type DeliveryVehicleClass } from '../deliveryFeeGrid'

/*
 * RULING 2026-11-09 (R-9.18, R-9.20) and O-28 answered 18 Nov 2026: the booking form fills the
 * delivery charge from the grid cell for the chosen zone and vehicle class. A row-level read
 * returns nothing for a money-blind role (RLS on both tables), so the caller shows no fee at all.
 */

type FeeRow = { fee_paisa: number | string | null } | null
type QuotedRow = { quoted: boolean } | null

export async function fetchGridFeeState(zoneId: string, vehicleClass: DeliveryVehicleClass): Promise<DeliveryFeeState> {
  const [feeRes, quotedRes] = await Promise.all([
    supabase
      .from('delivery_zone_vehicle_fees')
      .select('fee_paisa')
      .eq('zone_id', zoneId)
      .eq('vehicle_class', vehicleClass)
      .maybeSingle(),
    supabase.from('delivery_zone_quoted').select('quoted').eq('zone_id', zoneId).maybeSingle(),
  ])
  if (feeRes.error || quotedRes.error) {
    throw new Error(`Could not read the delivery fee grid: ${(feeRes.error ?? quotedRes.error)?.message ?? 'unknown'}`)
  }
  const fee = feeRes.data as FeeRow
  const quoted = quotedRes.data as QuotedRow
  return resolveDeliveryFee({
    quotedPerTrip: quoted?.quoted === true,
    feePaisa: fee === null || fee.fee_paisa === null ? null : Number(fee.fee_paisa),
  })
}
