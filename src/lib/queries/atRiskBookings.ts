import { supabase } from '../supabase'

export interface AtRiskBookingItem {
  id: string
  clientUuid: string
  bookingId: string
  bookingNo: string
  clientId: string
  clientName: string
  bookingStage: string
  pickupAt: string
  returnAt: string
  cause: string
  sourceBookingId?: string | null | undefined
  sourceBookingNo?: string | null | undefined
  clashingAssetId?: string | null | undefined
  clashingAssetTag?: string | null | undefined
  clashingProductId?: string | null | undefined
  clashingProductName?: string | null | undefined
  status: string
  resolutionDetails?: Record<string, unknown> | null | undefined
  raisedAt: string
  resolvedAt?: string | null | undefined
  resolvedBy?: string | null | undefined
  createdAt: string
}

interface AtRiskBookingViewRow {
  id: string
  client_uuid: string
  booking_id: string
  booking_no: string
  client_id: string
  client_name: string
  booking_stage: string
  pickup_at: string
  return_at: string
  cause: string
  source_booking_id?: string | null | undefined
  source_booking_no?: string | null | undefined
  clashing_asset_id?: string | null | undefined
  clashing_asset_tag?: string | null | undefined
  clashing_product_id?: string | null | undefined
  clashing_product_name?: string | null | undefined
  status: string
  resolution_details?: Record<string, unknown> | null | undefined
  raised_at: string
  resolved_at?: string | null | undefined
  resolved_by?: string | null | undefined
  created_at: string
}

export async function fetchActiveAtRiskBookings(): Promise<AtRiskBookingItem[]> {
  try {
    const { data, error } = await supabase
      .from('at_risk_bookings_v')
      .select('*')
      .eq('status', 'Active')
      .order('raised_at', { ascending: false })

    if (error || !data) {
      return []
    }

    return (data as unknown as AtRiskBookingViewRow[]).map((row) => ({
      id: row.id,
      clientUuid: row.client_uuid,
      bookingId: row.booking_id,
      bookingNo: row.booking_no,
      clientId: row.client_id,
      clientName: row.client_name,
      bookingStage: row.booking_stage,
      pickupAt: row.pickup_at,
      returnAt: row.return_at,
      cause: row.cause,
      sourceBookingId: row.source_booking_id,
      sourceBookingNo: row.source_booking_no,
      clashingAssetId: row.clashing_asset_id,
      clashingAssetTag: row.clashing_asset_tag,
      clashingProductId: row.clashing_product_id,
      clashingProductName: row.clashing_product_name,
      status: row.status,
      resolutionDetails: row.resolution_details,
      raisedAt: row.raised_at,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      createdAt: row.created_at,
    }))
  } catch {
    return []
  }
}

export async function checkBookingAtRisk(bookingId: string): Promise<AtRiskBookingItem | null> {
  try {
    const { data, error } = await supabase
      .from('at_risk_bookings_v')
      .select('*')
      .eq('booking_id', bookingId)
      .eq('status', 'Active')
      .maybeSingle()

    if (error || !data) {
      return null
    }

    const row = data as unknown as AtRiskBookingViewRow
    return {
      id: row.id,
      clientUuid: row.client_uuid,
      bookingId: row.booking_id,
      bookingNo: row.booking_no,
      clientId: row.client_id,
      clientName: row.client_name,
      bookingStage: row.booking_stage,
      pickupAt: row.pickup_at,
      returnAt: row.return_at,
      cause: row.cause,
      sourceBookingId: row.source_booking_id,
      sourceBookingNo: row.source_booking_no,
      clashingAssetId: row.clashing_asset_id,
      clashingAssetTag: row.clashing_asset_tag,
      clashingProductId: row.clashing_product_id,
      clashingProductName: row.clashing_product_name,
      status: row.status,
      resolutionDetails: row.resolution_details,
      raisedAt: row.raised_at,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      createdAt: row.created_at,
    }
  } catch {
    return null
  }
}
