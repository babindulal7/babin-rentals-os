/**
 * src/lib/queries/recommendations.ts
 *
 * Product Recommendations and Co-Rented Items (T7-12, B1).
 * Supports automatic 12-month booking co-occurrence analysis and staff pinning/reordering.
 */

import { supabase } from '../supabase'

export interface ProductRecommendationAdmin {
  readonly id: string
  readonly product_id: string
  readonly recommended_product_id: string
  readonly recommended_name: string
  readonly position: number
  readonly source: 'auto' | 'staff'
}

export async function fetchProductRecommendationsAdmin(
  productId: string,
): Promise<ProductRecommendationAdmin[]> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase

  if (isMock) {
    return [
      {
        id: 'mock-rec-1',
        product_id: productId,
        recommended_product_id: 'mock-rec-prod-1',
        recommended_name: 'Sony FE 24-70mm f/2.8 GM II Lens',
        position: 1,
        source: 'auto',
      },
      {
        id: 'mock-rec-2',
        product_id: productId,
        recommended_product_id: 'mock-rec-prod-2',
        recommended_name: 'V-Mount 98Wh Battery Pack',
        position: 2,
        source: 'auto',
      },
    ]
  }

  const { data, error } = await supabase
    .from('product_recommendations')
    .select(`
      id,
      product_id,
      recommended_product_id,
      position,
      source,
      recommended_product:products!recommended_product_id(name)
    `)
    .eq('product_id', productId)
    .order('position', { ascending: true })

  if (error || !data) {
    return []
  }

  interface AdminRecommendationRow {
    readonly id: string
    readonly product_id: string
    readonly recommended_product_id: string
    readonly position: number
    readonly source: 'auto' | 'staff'
    readonly recommended_product: { readonly name: string } | null
  }

  const rows = data as unknown as AdminRecommendationRow[]
  return rows.map((row) => ({
    id: row.id,
    product_id: row.product_id,
    recommended_product_id: row.recommended_product_id,
    recommended_name: row.recommended_product?.name || 'Recommended Item',
    position: row.position,
    source: row.source,
  }))
}

export async function saveStaffRecommendations(
  productId: string,
  recommendations: Array<{ recommended_product_id: string; position: number }>,
): Promise<boolean> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase

  if (isMock) {
    return true
  }

  const { data, error } = await supabase.rpc('set_staff_product_recommendations', {
    p_product_id: productId,
    p_recommendations: recommendations,
  })

  if (error) {
    throw new Error(error.message)
  }

  return Boolean(data)
}
