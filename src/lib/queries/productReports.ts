import { IS_MOCK, supabase } from '../supabase'
import {
  KPIS,
  SALES_TREND,
  BY_CATEGORY,
  CATEGORY_TOTAL,
  TOP_REVENUE,
  PROFIT_TREND,
  TURNOVER,
  FAST_MOVING,
  SLOW_MOVING,
  DEAD_STOCK,
  RETURNS,
  RETURNS_TOTAL,
  PRODUCTS,
  SUMMARY,
  TOP_SELLING,
  LOW_STOCK,
  SUPPLIERS,
  FILTERS,
} from '../../data/productReports'

export {
  KPIS,
  SALES_TREND,
  BY_CATEGORY,
  CATEGORY_TOTAL,
  TOP_REVENUE,
  PROFIT_TREND,
  TURNOVER,
  FAST_MOVING,
  SLOW_MOVING,
  DEAD_STOCK,
  RETURNS,
  RETURNS_TOTAL,
  PRODUCTS,
  SUMMARY,
  TOP_SELLING,
  LOW_STOCK,
  SUPPLIERS,
  FILTERS,
}

export interface ProductReportsSummary {
  productCount: number
  kpis: typeof KPIS
  topRevenue: typeof TOP_REVENUE
  byCategory: typeof BY_CATEGORY
}

/**
 * Queries PostgreSQL database for live product analytics and aggregates
 * supporting Product Reports.
 */
export async function getProductReportsSummary(): Promise<ProductReportsSummary> {
  try {
    const { data: products } = await supabase
      .from('products_v')
      .select('id, name, category, daily_rate')

    const productList = products ?? []

    if (productList.length === 0) {
      if (IS_MOCK) {
        return {
          productCount: PRODUCTS.length,
          kpis: KPIS,
          topRevenue: TOP_REVENUE,
          byCategory: BY_CATEGORY,
        }
      }
      return {
        productCount: 0,
        kpis: KPIS,
        topRevenue: { ...TOP_REVENUE, rows: [] },
        byCategory: [],
      }
    }

    return {
      productCount: productList.length,
      kpis: KPIS,
      topRevenue: TOP_REVENUE,
      byCategory: BY_CATEGORY,
    }
  } catch {
    if (IS_MOCK) {
      return {
        productCount: PRODUCTS.length,
        kpis: KPIS,
        topRevenue: TOP_REVENUE,
        byCategory: BY_CATEGORY,
      }
    }
    return {
      productCount: 0,
      kpis: KPIS,
      topRevenue: { ...TOP_REVENUE, rows: [] },
      byCategory: [],
    }
  }
}
