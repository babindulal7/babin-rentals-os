import type { RentalWindow } from '../availability'
import type { LineEvaluationInput } from '../availabilityEvaluation'
import { assertAvailabilityLine } from './availabilityIntegrity'

/**
 * A saved Bundle is a pricing parent, not equipment. The actual stock to check
 * is its child booking_lines (0070 and createRental.ts). Do not manufacture a
 * product ID from the parent, or count both parent and children as inventory.
 */
export interface SavedStockLine {
  id: string
  line_type: string
  product_id: string | null
  bundle_id: string | null
  parent_line_id: string | null
  description: string | null
  qty: number
}

export interface BundleRequirement {
  id: string
  bundle_id: string
  product_id: string
  quantity: number
  is_mandatory: boolean
}

export function buildBookingStockDemand(
  bookingNo: string,
  lines: readonly SavedStockLine[],
  requirements: readonly BundleRequirement[],
  window: RentalWindow,
): LineEvaluationInput[] {
  const ids = new Map(lines.map(line => [line.id, line]))
  const parents = lines.filter(line => line.line_type === 'Bundle')
  const childrenByParent = new Map<string, SavedStockLine[]>()

  for (const line of lines) {
    if (!Number.isSafeInteger(line.qty) || line.qty < 1) {
      throw new Error(`${bookingNo} has an invalid line quantity; availability cannot be certified.`)
    }
    if (!line.parent_line_id) continue
    const parent = ids.get(line.parent_line_id)
    if (!parent || parent.line_type !== 'Bundle') {
      throw new Error(`${bookingNo} has an orphan or non-bundle equipment component; availability cannot be certified.`)
    }
    if (!parent.bundle_id || line.bundle_id !== parent.bundle_id) {
      throw new Error(`${bookingNo} has a bundle component linked to the wrong bundle; availability cannot be certified.`)
    }
    if (line.line_type !== 'Equipment' && line.line_type !== 'Accessory') {
      throw new Error(`${bookingNo} has a non-equipment bundle component; availability cannot be certified.`)
    }
    assertAvailabilityLine(bookingNo, line)
    childrenByParent.set(parent.id, [...(childrenByParent.get(parent.id) ?? []), line])
  }

  for (const parent of parents) {
    if (!parent.bundle_id || parent.parent_line_id || parent.product_id) {
      throw new Error(`${bookingNo} has an invalid bundle parent; availability cannot be certified.`)
    }
    const children = childrenByParent.get(parent.id) ?? []
    if (children.length === 0) {
      throw new Error(`${bookingNo} has a bundle with no saved equipment components; availability cannot be certified.`)
    }
    const expected = requirements.filter(item => item.bundle_id === parent.bundle_id)
    if (expected.length === 0) {
      throw new Error(`${bookingNo} has a bundle whose component requirements could not be loaded; availability cannot be certified.`)
    }
    const actual = new Map<string, number>()
    for (const child of children) {
      actual.set(child.product_id!, (actual.get(child.product_id!) ?? 0) + child.qty)
    }
    for (const item of expected) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || !item.product_id) {
        throw new Error(`${bookingNo} has an invalid bundle component requirement; availability cannot be certified.`)
      }
      if (item.is_mandatory && (actual.get(item.product_id) ?? 0) < item.quantity * parent.qty) {
        throw new Error(`${bookingNo} is missing required bundle equipment; availability cannot be certified.`)
      }
    }
  }

  // A booking can contain multiple bundles/loose lines of the same product.
  // Evaluate their COMBINED demand: assessing each independently could promise
  // the same available serial or quantity stock twice within one booking.
  const demand = new Map<string, LineEvaluationInput>()
  for (const line of lines) {
    if (line.line_type === 'Bundle' || line.line_type === 'Service') continue
    if (line.line_type !== 'Equipment' && line.line_type !== 'Accessory') {
      throw new Error(`${bookingNo} has a line without verifiable in-house equipment stock; availability cannot be certified.`)
    }
    assertAvailabilityLine(bookingNo, line)
    const productId = line.product_id!
    const existing = demand.get(productId)
    if (existing) {
      demand.set(productId, {
        ...existing,
        requestedQty: existing.requestedQty + line.qty,
        productName: `${existing.productName} (combined equipment demand)`,
      })
    } else {
      demand.set(productId, {
        lineId: line.id,
        productId,
        productName: line.description || 'Equipment',
        requestedQty: line.qty,
        window,
      })
    }
  }

  if (demand.size === 0) {
    throw new Error(`${bookingNo} has no verifiable equipment stock lines; availability cannot be certified.`)
  }
  return [...demand.values()]
}
