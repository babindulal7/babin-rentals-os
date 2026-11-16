import { supabase } from '../supabase'
import { parseTstzRange } from './availability'

export interface DowntimeRow {
  id: string
  assetId: string | null
  productId: string
  assetTag: string | null
  productName: string | null
  qty: number
  startAt: string
  endAt: string
  reason: string
  notes: string | null
  createdBy: string
  releasedAt: string | null
  releasedReason: string | null
  endedBy: string | null
  createdAt: string
  isActive: boolean
}

interface RawDowntimeReservation {
  id: string
  asset_id: string | null
  product_id: string
  qty: number | null
  period: string
  downtime_reason: string | null
  downtime_notes: string | null
  created_by: string
  released_at: string | null
  released_reason: string | null
  ended_by: string | null
  created_at: string
  product_units: { asset_tag: string } | null
  products: { name: string } | null
}

function toDowntimeRow(r: RawDowntimeReservation): DowntimeRow {
  const range = parseTstzRange(r.period)
  const now = Date.now()
  const startMs = range?.fromAd ? new Date(range.fromAd).getTime() : 0
  const endMs = range?.toAd ? new Date(range.toAd).getTime() : 0
  const isReleased = r.released_at !== null
  const isActive = !isReleased && now >= startMs && now < endMs

  return {
    id: r.id,
    assetId: r.asset_id,
    productId: r.product_id,
    assetTag: r.product_units?.asset_tag ?? null,
    productName: r.products?.name ?? null,
    qty: r.qty ?? 1,
    startAt: range?.fromAd ?? '',
    endAt: range?.toAd ?? '',
    reason: r.downtime_reason ?? 'Other',
    notes: r.downtime_notes ?? null,
    createdBy: r.created_by,
    releasedAt: r.released_at,
    releasedReason: r.released_reason,
    endedBy: r.ended_by,
    createdAt: r.created_at,
    isActive,
  }
}

export async function listProductDowntimes(productId: string): Promise<DowntimeRow[]> {
  const { data, error } = await supabase
    .from('inventory_reservations')
    .select(`
      id,
      asset_id,
      product_id,
      qty,
      period,
      downtime_reason,
      downtime_notes,
      created_by,
      released_at,
      released_reason,
      ended_by,
      created_at,
      product_units ( asset_tag ),
      products ( name )
    `)
    .eq('kind', 'downtime')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`listProductDowntimes failed: ${error.message}`)

  return ((data ?? []) as unknown as RawDowntimeReservation[]).map(toDowntimeRow)
}

export async function listAssetDowntimes(assetId: string): Promise<DowntimeRow[]> {
  const { data, error } = await supabase
    .from('inventory_reservations')
    .select(`
      id,
      asset_id,
      product_id,
      qty,
      period,
      downtime_reason,
      downtime_notes,
      created_by,
      released_at,
      released_reason,
      ended_by,
      created_at,
      product_units ( asset_tag ),
      products ( name )
    `)
    .eq('kind', 'downtime')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`listAssetDowntimes failed: ${error.message}`)

  return ((data ?? []) as unknown as RawDowntimeReservation[]).map(toDowntimeRow)
}
