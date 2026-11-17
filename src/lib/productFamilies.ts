/**
 * Product Families and Variants Presentation & Selection Engine (T7-13)
 *
 * Implements product family grouping (e.g. 24-70mm lens EF / PL / E mount,
 * cable lengths, sizes) where each variant option maps strictly to its own
 * real product ID, dedicated stock, individual daily rate, and specific serials.
 *
 * Enforces:
 * - Selecting an option (e.g. PL mount) cannot book or draw stock from another option (e.g. EF mount).
 * - Never aggregate family stock into fictitious shared stock pool.
 * - Choosing an unavailable option is blocked.
 * - Grouping and ungrouping actions require Manager, Owner, or Admin role.
 * - Ungrouping breaks the family presentation link but NEVER deletes the underlying products.
 */

import type { SystemRole } from '../types/database'

export interface ProductFamilyVariantOption {
  optionId: string
  optionLabel: string // e.g. 'Sony E', 'Canon EF', 'PL Mount', '5m', '10m'
  productId: string
  productName: string
  availableStock: number
  totalStock: number
  dailyRatePaisa?: number // Masked for money-blind roles
  serialNumbers: string[]
}

export interface ProductFamily {
  id: string
  name: string // e.g. 'Sony FE 24-70mm f/2.8 GM II' or 'BNC SDI Cable'
  description?: string
  options: ProductFamilyVariantOption[]
  createdAt: string
  updatedAt: string
}

export interface SelectVariantResult {
  allowed: boolean
  reason?: string
  selectedProduct?: {
    productId: string
    optionLabel: string
    dailyRatePaisa?: number
    availableStock: number
  }
}

/** Check if user has permission to group or ungroup product families */
export function canManageProductFamilies(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/**
 * Validates and selects a variant option within a family.
 * Returns fail-closed if option does not exist or has zero available stock.
 */
export function selectFamilyVariant(
  family: ProductFamily,
  optionId: string,
  canViewMoney = true,
): SelectVariantResult {
  const option = family.options.find((opt) => opt.optionId === optionId)
  if (!option) {
    return {
      allowed: false,
      reason: `Option '${optionId}' not found in family '${family.name}'.`,
    }
  }

  if (option.availableStock <= 0) {
    return {
      allowed: false,
      reason: `Option '${option.optionLabel}' is currently out of stock. Stock cannot be drawn from sibling options.`,
    }
  }

  return {
    allowed: true,
    selectedProduct: {
      productId: option.productId,
      optionLabel: option.optionLabel,
      availableStock: option.availableStock,
      ...(canViewMoney && option.dailyRatePaisa !== undefined
        ? { dailyRatePaisa: option.dailyRatePaisa }
        : {}),
    },
  }
}

/**
 * Safe Ungrouping logic:
 * Dissolves the family container, returning all underlying products intact.
 */
export function ungroupProductFamily(
  family: ProductFamily,
  actorRole: SystemRole,
): { success: boolean; error?: string; remainingProductIds?: string[] } {
  if (!canManageProductFamilies(actorRole)) {
    return {
      success: false,
      error: 'Permission denied: Only Owner, Admin, or Manager can ungroup product families.',
    }
  }

  const intactProductIds = family.options.map((opt) => opt.productId)
  return {
    success: true,
    remainingProductIds: intactProductIds,
  }
}
