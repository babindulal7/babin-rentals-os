import { describe, it, expect } from 'vitest'
import {
  selectFamilyVariant,
  ungroupProductFamily,
  canManageProductFamilies,
  type ProductFamily,
} from '../productFamilies'

describe('T7-13 Product Families and Variants Engine', () => {
  const sampleLensFamily: ProductFamily = {
    id: 'fam-24-70',
    name: '24-70mm f/2.8 Zoom Lens Family',
    createdAt: '2026-11-17T00:00:00Z',
    updatedAt: '2026-11-17T00:00:00Z',
    options: [
      {
        optionId: 'opt-ef',
        optionLabel: 'Canon EF Mount',
        productId: 'prod-lens-ef',
        productName: 'Canon 24-70mm EF',
        availableStock: 2,
        totalStock: 3,
        dailyRatePaisa: 250000,
        serialNumbers: ['EF-001', 'EF-002'],
      },
      {
        optionId: 'opt-pl',
        optionLabel: 'ARRI PL Mount',
        productId: 'prod-lens-pl',
        productName: 'DZOFilm 24-70mm PL',
        availableStock: 0, // Out of stock
        totalStock: 1,
        dailyRatePaisa: 400000,
        serialNumbers: ['PL-999'],
      },
      {
        optionId: 'opt-e',
        optionLabel: 'Sony E Mount',
        productId: 'prod-lens-e',
        productName: 'Sony 24-70mm GM II',
        availableStock: 1,
        totalStock: 1,
        dailyRatePaisa: 300000,
        serialNumbers: ['E-101'],
      },
    ],
  }

  it('allows selecting an available option with its own isolated product ID and rate', () => {
    const result = selectFamilyVariant(sampleLensFamily, 'opt-ef', true)
    expect(result.allowed).toBe(true)
    expect(result.selectedProduct?.productId).toBe('prod-lens-ef')
    expect(result.selectedProduct?.dailyRatePaisa).toBe(250000)
    expect(result.selectedProduct?.availableStock).toBe(2)
  })

  it('strictly blocks booking an out of stock option without pooling stock from siblings', () => {
    const result = selectFamilyVariant(sampleLensFamily, 'opt-pl', true)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('out of stock')
    expect(result.reason).toContain('Stock cannot be drawn from sibling options')
  })

  it('masks dailyRatePaisa for money-blind roles (canViewMoney: false)', () => {
    const result = selectFamilyVariant(sampleLensFamily, 'opt-e', false)
    expect(result.allowed).toBe(true)
    expect(result.selectedProduct?.dailyRatePaisa).toBeUndefined()
  })

  it('enforces RBAC for family grouping/ungrouping and guarantees ungrouping never deletes products', () => {
    expect(canManageProductFamilies('Owner')).toBe(true)
    expect(canManageProductFamilies('Admin')).toBe(true)
    expect(canManageProductFamilies('Manager')).toBe(true)
    expect(canManageProductFamilies('Technician')).toBe(false)
    expect(canManageProductFamilies('Warehouse')).toBe(false)

    // Unauthorized attempt
    const denied = ungroupProductFamily(sampleLensFamily, 'Warehouse')
    expect(denied.success).toBe(false)
    expect(denied.error).toContain('Permission denied')

    // Authorized ungroup
    const allowed = ungroupProductFamily(sampleLensFamily, 'Manager')
    expect(allowed.success).toBe(true)
    expect(allowed.remainingProductIds).toEqual(['prod-lens-ef', 'prod-lens-pl', 'prod-lens-e'])
  })
})
