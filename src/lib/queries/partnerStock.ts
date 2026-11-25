import { supabase } from '../supabase'
import type { Paisa } from '../money'
import { toBs, formatBs } from '../bs'

export type PartnerCostKind = 'daily' | 'fixed'
export type TemporaryStockStatus = 'Active' | 'Returned to partner' | 'Cancelled'

export interface PartnerStockUnit {
  id: string
  assetCode: string
  serialNumber?: string | undefined
  status: string
}

export interface PartnerStockRecord {
  id: string
  partnerName: string
  productId: string
  productName: string
  productBrand?: string | undefined
  productModel?: string | undefined
  trackingMode: 'Serialised' | 'Quantity'
  quantity: number
  availableFrom: string
  availableUntil: string
  availableFromBs: string
  availableUntilBs: string
  costKind: PartnerCostKind | null
  costPaisa: Paisa | null
  status: TemporaryStockStatus
  notes?: string | undefined
  returnedAt?: string | undefined
  units: PartnerStockUnit[]
  isExpired: boolean
  isUpcoming: boolean
  isActive: boolean
}

interface PartnerStockDbRow {
  id: string
  partner_name: string
  product_id: string
  tracking_mode: 'Serialised' | 'Quantity'
  quantity: number
  available_from: string
  available_until: string
  cost_kind: PartnerCostKind | null
  cost_paisa: number | null
  status: TemporaryStockStatus
  notes: string | null
  returned_at: string | null
  products: {
    name: string | null
    brand: string | null
    model: string | null
  } | null
  product_units: Array<{
    id: string
    asset_code: string
    serial_number: string | null
    status: string
  }> | null
}

export async function listPartnerStock(): Promise<{ rows: PartnerStockRecord[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('partner_stock_read_v')
      .select(`
        id,
        partner_name,
        product_id,
        tracking_mode,
        quantity,
        available_from,
        available_until,
        cost_kind,
        cost_paisa,
        status,
        notes,
        returned_at,
        products,
        product_units
      `)
      .order('created_at', { ascending: false })

    if (error) {
      return { rows: [], error: error.message }
    }

    const now = new Date()
    const dbRows = (data ?? []) as unknown as PartnerStockDbRow[]

    const rows: PartnerStockRecord[] = dbRows.map((r) => {
      const fromDate = new Date(r.available_from)
      const untilDate = new Date(r.available_until)
      const isExpired = untilDate < now
      const isUpcoming = fromDate > now
      const isActive = r.status === 'Active' && !isExpired && !isUpcoming

      const fromBs = toBs(fromDate)
      const availableFromBs = fromBs ? formatBs(fromBs) : r.available_from.slice(0, 10)

      const untilBs = toBs(untilDate)
      const availableUntilBs = untilBs ? formatBs(untilBs) : r.available_until.slice(0, 10)

      const units: PartnerStockUnit[] = (r.product_units ?? []).map((u) => ({
        id: u.id,
        assetCode: u.asset_code,
        serialNumber: u.serial_number ?? undefined,
        status: u.status,
      }))

      return {
        id: r.id,
        partnerName: r.partner_name,
        productId: r.product_id,
        productName: r.products?.name ?? 'Unknown Gear',
        productBrand: r.products?.brand ?? undefined,
        productModel: r.products?.model ?? undefined,
        trackingMode: r.tracking_mode,
        quantity: r.quantity,
        availableFrom: r.available_from,
        availableUntil: r.available_until,
        availableFromBs,
        availableUntilBs,
        costKind: r.cost_kind,
        costPaisa: r.cost_paisa != null ? (r.cost_paisa as Paisa) : null,
        status: r.status,
        notes: r.notes ?? undefined,
        returnedAt: r.returned_at ?? undefined,
        units,
        isExpired,
        isUpcoming,
        isActive,
      }
    })

    return { rows, error: null }
  } catch (err: unknown) {
    return { rows: [], error: err instanceof Error ? err.message : 'Failed to list partner stock' }
  }
}
